import { scenario, ScenarioEngine, type FixtureOptions } from "./engine.js";
import type { TikTokEvent } from "../sdk/types.js";
const el = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const input = (id: string) => el<HTMLInputElement>(id);
const frame = el<HTMLIFrameElement>("preview"),
  status = el("status"),
  json = el("json"),
  history = el("history");
let ready = false,
  last: TikTokEvent | undefined,
  pending = false;
const send = (data: Record<string, unknown>) =>
  frame.contentWindow?.postMessage(
    { channel: "tiktok-playground", ...data },
    "*",
  );
const settings = () =>
  send({
    action: "settings",
    animation: input("animation").checked,
    sound: input("sound").checked,
  });
const engine = new ScenarioEngine((event) => {
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
  status.textContent = "Local simulation delivered";
});
function options(): FixtureOptions {
  const count = Number(input("count").value);
  if (!Number.isInteger(count) || count < 1 || count > 1000000)
    throw new Error("Repeat count must be between 1 and 1,000,000");
  if (input("streak").checked && count < 5)
    throw new Error("Streak total must be at least 5");
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
    scenario(o, input("streak").checked);
    if (!ready) {
      pending = true;
      return;
    }
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
window.addEventListener("message", (e) => {
  if (
    e.source !== frame.contentWindow ||
    e.data?.channel !== "tiktok-playground"
  )
    return;
  if (e.data.action === "loaded") settings();
  if (e.data.action === "ready") {
    ready = true;
    el<HTMLButtonElement>("replay").disabled = false;
    if (pending) {
      pending = false;
      play();
    }
  }
});
el<HTMLButtonElement>("replay").disabled = true;
pending = true;
frame.src = "preview.html";
el("replay").onclick = play;
el("stop").onclick = () => {
  pending = false;
  engine.stop();
  status.textContent = "Stopped";
};
el("reset").onclick = () =>
  engine.reset(() => {
    pending = false;
    ready = false;
    last = undefined;
    json.textContent = "";
    history.replaceChildren();
    el<HTMLButtonElement>("replay").disabled = true;
    frame.src = "preview.html";
    status.textContent = "Reset";
  });
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
for (const id of ["animation", "sound"]) input(id).onchange = settings;
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
    const copied = document.execCommand("copy");
    area.remove();
    status.textContent = copied
      ? "JSON copied"
      : "Copy unavailable: select the JSON and copy manually";
  }
};
window.addEventListener("pagehide", () => engine.stop());
