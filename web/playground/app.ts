import {
  t,
  getLocale,
  getTheme,
  setLocale,
  setTheme,
  subscribe,
  localizeDocument,
  eventCount,
  type Locale,
  type Theme,
} from "../shared/i18n/index.js";
import { scenario, ScenarioEngine, type FixtureOptions } from "./engine.js";
import {
  channel,
  targetOrigin,
  validPacket,
  validPreviewConfig,
} from "./protocol.js";
import { uniqueId, integer } from "./engine.js";
import type { TikTokEvent } from "../sdk/types.js";
if (new URL(location.href).searchParams.get("studio") === "design")
  document.body.classList.add("studio-preview");
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const frame = el<HTMLIFrameElement>("preview"),
  status = el("status"),
  json = el("json"),
  history = el("history");
let statusKey = "Loading renderer…";
function showStatus(key: string) {
  statusKey = key;
  status.textContent = t(key);
}
function updateUI() {
  localizeDocument();
  input("language").value = getLocale();
  input("theme").value = getTheme();
  showStatus(statusKey);
  el("event-count").textContent = eventCount(history.children.length);
}
const unsubscribeLocale = subscribe(updateUI);
updateUI();
input("language").onchange = () => setLocale(input("language").value as Locale);
input("theme").onchange = () => setTheme(input("theme").value as Theme);
function eventControls() {
  const gift = input("type").value === "gift";
  for (const id of ["gift-controls", "streak-controls", "gift-id-control"])
    el(id).hidden = !gift;
}
input("type").onchange = eventControls;
let state: "loading" | "initializing" | "ready" | "error" | "closed" =
  "loading";
let session = "",
  timeout: ReturnType<typeof setTimeout> | undefined;
let last: TikTokEvent | undefined,
  initialReplay = true;
let supported: string[] | null = null;
const origin = targetOrigin(new URL("preview.html", location.href).href);
const send = (data: Record<string, unknown>) => {
  if (state === "closed" || state === "error") return;
  frame.contentWindow?.postMessage(
    { channel, version: 1, session, ...data },
    origin,
  );
};
let studioDraft: Record<string, unknown> | undefined;
const studioSession = new URL(location.href).searchParams.get("studioSession");
window.addEventListener("message", (e) => {
  if (
    e.source !== parent ||
    parent === window ||
    e.origin !== location.origin ||
    !studioSession ||
    e.data?.channel !== "tiktok-studio-draft" ||
    e.data?.session !== studioSession ||
    e.data?.version !== 1 ||
    !validPreviewConfig(e.data.config)
  )
    return;
  if (["en", "es"].includes(e.data.locale) && e.data.locale !== getLocale())
    setLocale(e.data.locale);
  if (
    ["light", "dark", "system"].includes(e.data.theme) &&
    e.data.theme !== getTheme()
  )
    setTheme(e.data.theme);
  studioDraft = e.data.config;
  if (state === "ready") settings();
});
const settings = () =>
  send({
    action: "settings",
    ...(studioDraft ? { config: studioDraft } : {}),
    animation:
      typeof studioDraft?.animation === "boolean"
        ? studioDraft.animation
        : input("animation").checked,
    sound:
      typeof studioDraft?.sound === "boolean"
        ? studioDraft.sound
        : input("sound").checked,
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
  el("event-count").textContent = eventCount(history.children.length);
  while (history.children.length > 200) history.firstChild?.remove();
  status.textContent =
    supported && !supported.includes(event.type)
      ? t("This template or its filters do not display {type} events.", {
          type: event.type,
        })
      : "Local simulation delivered";
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
    if (!Number.isFinite(speed) || speed <= 0)
      throw new Error("Invalid playback speed");
    scenario(o, input("streak").checked);
    if (state !== "ready") return;
    settings();
    engine.play(
      () => scenario(o, input("streak").checked),
      interval / Number(input("speed").value),
      repetitions,
    );
  } catch (e) {
    showStatus((e as Error).message);
  }
}
function loadPreview() {
  engine.stop();
  if (timeout !== undefined) clearTimeout(timeout);
  session = uniqueId();
  state = "loading";
  el<HTMLButtonElement>("replay").disabled = true;
  showStatus("Loading preview…");
  frame.src = `preview.html?session=${encodeURIComponent(session)}`;
  timeout = setTimeout(() => {
    state = "error";
    engine.stop();
    timeout = undefined;
    showStatus("Preview initialization timed out. Reset to retry.");
  }, 10000);
}
window.addEventListener("message", (e) => {
  if (
    e.source !== frame.contentWindow ||
    (origin !== "*" && e.origin !== origin) ||
    !validPacket(e.data, session)
  )
    return;
  if (e.data.action === "loaded" && state === "loading") {
    state = "initializing";
    settings();
  } else if (e.data.action === "ready" && state === "initializing") {
    state = "ready";
    supported = e.data.supported ?? null;
    clearTimeout(timeout);
    timeout = undefined;
    el<HTMLButtonElement>("replay").disabled = false;
    status.textContent =
      "Preview ready. Templates display their supported event types and filters.";
    if (initialReplay) {
      initialReplay = false;
      play();
    }
  } else if (e.data.action === "updated" && state === "ready") {
    initialReplay = false;
    loadPreview();
  } else if (e.data.action === "error" && state === "ready")
    showStatus(e.data.message);
});
frame.onload = () => {
  if (state === "ready") {
    initialReplay = false;
    loadPreview();
  }
};
frame.onerror = () => {
  state = "error";
  el<HTMLButtonElement>("replay").disabled = true;
  engine.stop();
  clearTimeout(timeout);
  showStatus("Preview failed to load. Reset to retry.");
};
const initialOptions = new URL(location.href).searchParams;
for (const [key, id] of [
  ["event", "type"],
  ["user", "username"],
  ["gift", "giftName"],
  ["count", "count"],
])
  if (initialOptions.has(key)) input(id).value = initialOptions.get(key)!;
eventControls();
loadPreview();
el("replay").onclick = play;
el("stop").onclick = () => {
  initialReplay = false;
  engine.stop();
  showStatus("Stopped");
};
el("reset").onclick = () => {
  initialReplay = false;
  last = undefined;
  json.textContent = "";
  history.replaceChildren();
  el("event-count").textContent = eventCount(0);
  loadPreview();
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
for (const id of ["animation", "sound"])
  input(id).onchange = () => {
    if (state === "ready") settings();
  };
el("copy").onclick = async () => {
  if (!last) return;
  const text = JSON.stringify(last, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showStatus("JSON copied");
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {}
    area.remove();
    showStatus(
      copied
        ? "JSON copied"
        : "Copy unavailable: select the JSON and copy manually",
    );
  }
};
window.addEventListener("pagehide", () => {
  unsubscribeLocale();
  state = "closed";
  session = "";
  clearTimeout(timeout);
  engine.stop();
});
