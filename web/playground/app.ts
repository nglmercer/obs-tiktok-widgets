import { scenario, ScenarioEngine, type FixtureOptions } from "./engine.js";
import { channel, targetOrigin, validPacket } from "./protocol.js";
import { uniqueId, integer } from "./engine.js";
import type { TikTokEvent } from "../sdk/types.js";
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const frame = el<HTMLIFrameElement>("preview"),
  status = el("status"),
  json = el("json"),
  history = el("history");
let state: "loading" | "initializing" | "ready" | "error" | "closed" = "loading";
let session = "", timeout: ReturnType<typeof setTimeout> | undefined;
let last: TikTokEvent | undefined, initialReplay = true;
let supported: string[] | null = null;
const origin = targetOrigin(new URL("preview.html", location.href).href);
const send = (data: Record<string, unknown>) => {
  if (state === "closed" || state === "error") return;
  frame.contentWindow?.postMessage({ channel, version: 1, session, ...data }, origin);
};
const settings = () =>
  send({
    action: "settings",
    animation: input("animation").checked,
    sound: input("sound").checked,
  });
const engine = new ScenarioEngine((event) => {
  if (state !== "ready") return;
  send({ action: "event", event });
  last = event;
  json.textContent = JSON.stringify(event, null, 2);
  const li = document.createElement("li"),
    b = document.createElement("button");
  b.textContent = `${event.type} · ${event.messageId} · ${String((event.data as Record<string, unknown>).repeat_count || "")}`;
  b.onclick = () => {
    last = event;
    json.textContent = JSON.stringify(event, null, 2);
  };
  li.append(b);
  history.append(li);
  while (history.children.length > 200) history.firstChild?.remove();
  status.textContent = supported && !supported.includes(event.type) ? `This template or its filters do not display ${event.type} events.` : "Local simulation delivered";
});
function options(): FixtureOptions {
  const count = integer(input("count").value);
  if (BigInt(count) < 1n) throw new Error("Repeat count must be positive");
  return {
    type: input("type").value,
    username: input("username").value,
    userId: input("userId").value,
    giftId: input("giftId").value,
    giftName: input("giftName").value,
    count: String(count),
    completed: input("completed").checked,
  };
}
function play() {
  try {
    const o = options(),
      interval = Number(input("interval").value),
      repetitions = Number(input("repetitions").value);
    if (
      !Number.isFinite(interval) ||
      interval < 0 ||
      interval > 60000 ||
      !Number.isInteger(repetitions) ||
      repetitions < 1 ||
      repetitions > 100
    )
      throw new Error("Invalid interval or simulation count");
    const speed = Number(input("speed").value);
    if (!Number.isFinite(speed) || speed <= 0) throw new Error("Invalid playback speed");
    scenario(o, input("streak").checked);
    if (state !== "ready") return;
    settings();
    engine.play(
      () => scenario(o, input("streak").checked),
      interval / Number(input("speed").value),
      repetitions,
    );
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}
function loadPreview() {
  engine.stop();
  if (timeout !== undefined) clearTimeout(timeout);
  session = uniqueId(); state = "loading";
  el<HTMLButtonElement>("replay").disabled = true;
  status.textContent = "Loading preview…";
  frame.src = `preview.html?session=${encodeURIComponent(session)}`;
  timeout = setTimeout(() => {
    state = "error"; engine.stop(); timeout = undefined;
    status.textContent = "Preview initialization timed out. Reset to retry.";
  }, 10000);
}
window.addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow || (origin !== "*" && e.origin !== origin) || !validPacket(e.data, session)) return;
  if (e.data.action === "loaded" && state === "loading") { state = "initializing"; settings(); }
  else if (e.data.action === "ready" && state === "initializing") {
    state = "ready";
    supported = e.data.supported ?? null;
    clearTimeout(timeout); timeout = undefined;
    el<HTMLButtonElement>("replay").disabled = false;
    status.textContent = "Preview ready. Templates display their supported event types and filters.";
    if (initialReplay) { initialReplay = false; play(); }
  } else if (e.data.action === "updated" && state === "ready") { initialReplay = false; loadPreview();
  } else if (e.data.action === "error" && state === "ready") status.textContent = e.data.message;
});
frame.onload = () => { if (state === "ready") { initialReplay = false; loadPreview(); } };
frame.onerror = () => { state = "error"; el<HTMLButtonElement>("replay").disabled = true; engine.stop(); clearTimeout(timeout); status.textContent = "Preview failed to load. Reset to retry."; };
const initialOptions = new URL(location.href).searchParams;
for (const [key, id] of [["event", "type"], ["user", "username"], ["gift", "giftName"], ["count", "count"]]) if (initialOptions.has(key)) input(id).value = initialOptions.get(key)!;
loadPreview();
el("replay").onclick = play;
el("stop").onclick = () => { initialReplay = false; engine.stop(); status.textContent = "Stopped"; };
el("reset").onclick = () => {
  initialReplay = false; last = undefined; json.textContent = ""; history.replaceChildren(); loadPreview();
};
input("range").oninput = () => {
  input("count").value = input("range").value;
};
input("count").oninput = () => {
  input("range").value = input("count").value;
};
input("gift").onchange = () => {
  if (input("gift").value !== "custom") {
    input("giftId").value = input("gift").value;
    input("giftName").value =
      el<HTMLSelectElement>("gift").selectedOptions[0].text;
  }
};
for (const id of ["animation", "sound"]) input(id).onchange = () => { if (state === "ready") settings(); };
el("copy").onclick = async () => {
  if (!last) return;
  const text = JSON.stringify(last, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = "JSON copied";
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    let copied = false;
    try { copied = document.execCommand("copy"); } catch {}
    area.remove();
    status.textContent = copied
      ? "JSON copied"
      : "Copy unavailable: select the JSON and copy manually";
  }
};
window.addEventListener("pagehide", () => { state = "closed"; session = ""; clearTimeout(timeout); engine.stop(); });
