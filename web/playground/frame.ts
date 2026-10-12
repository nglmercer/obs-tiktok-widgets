import { dispatchLocal } from "./engine.js";
import { channel, validPacket, targetOrigin } from "./protocol.js";
(() => {
  const session = new URL(window.location.href).searchParams.get("session") || "";
  const previewWindow = window as Window & { TikTokPlaygroundPreview?: boolean; TikTokWidgetConfig?: Record<string, unknown>; TikTokPlaygroundSession?: string; TikTokWidgetBuildPointer?: string; TikTokWidgetBuildId?: string; TikTokWidgetBuildChanged?: (build: string) => void };
  if (previewWindow.TikTokPlaygroundSession) return;
  previewWindow.TikTokPlaygroundSession = session;
  previewWindow.TikTokPlaygroundPreview = true;
  let state: "loading" | "loaded" | "ready" | "closed" = "loading";
  const origin = document.referrer ? targetOrigin(document.referrer) : "*";
  const send = (action: string, extra = {}) => parent.postMessage({ channel, version: 1, session, action, ...extra }, origin);
  window.addEventListener("message", (e) => {
    if (e.source !== parent || (origin !== "*" && e.origin !== origin) || !validPacket(e.data, session)) return;
    if (e.data.action === "settings" && (state === "loaded" || state === "ready")) {
      previewWindow.TikTokWidgetConfig = { ...previewWindow.TikTokWidgetConfig, animation: e.data.animation, sound: e.data.sound };
      dispatchEvent(new CustomEvent("tiktok:preview-settings", { detail: previewWindow.TikTokWidgetConfig }));
      if (state === "loaded") {
        state = "ready";
        const types: Record<string, string[]> = {gifts:["gift"],chat:["chat"],likes:["like"],viewers:["roomUser"],alerts:["follow"],events:["gift","chat","like","follow","roomUser"]};
        const config = previewWindow.TikTokWidgetConfig || {};
        const available = Array.isArray(config.events) ? config.events as string[] : types[String(config.template || document.body?.dataset.template)];
        const filters = config.filters;
        send("ready", {supported: available ? available.filter(t => !Array.isArray(filters) || !filters.length || filters.includes(t)) : null});
      }
    } else if (e.data.action === "event" && state === "ready") dispatchLocal(window, e.data.event);
  });
  window.addEventListener("tiktok:preview-error", (e) => send("error", { message: String((e as CustomEvent).detail).slice(0, 512) }));
  window.addEventListener("load", () => { state = "loaded"; send("loaded"); }, { once: true });
  let poll: ReturnType<typeof setInterval> | undefined;
  const pointer = previewWindow.TikTokWidgetBuildPointer;
  if (pointer) {
    previewWindow.TikTokWidgetBuildChanged = (build) => { if (state === "ready" && build !== previewWindow.TikTokWidgetBuildId) { state = "closed"; send("updated"); if (poll) clearInterval(poll); } };
    poll = setInterval(() => {
      if (state !== "ready") return;
      const script = document.createElement("script");
      script.src = `${pointer}?t=${Date.now()}`;
      script.onload = script.onerror = () => script.remove();
      document.head.append(script);
    }, 1000);
  }
  window.addEventListener("pagehide", () => { state = "closed"; if (poll) clearInterval(poll); }, { once: true });
})();
