"use strict";
(() => {
  // web/playground/engine.ts
  var session = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  function dispatchLocal(target, event) {
    target.dispatchEvent(new CustomEvent("tiktok:event", { detail: event }));
    target.dispatchEvent(
      new CustomEvent(`tiktok:${event.type}`, { detail: event })
    );
  }

  // web/playground/protocol.ts
  var channel = "tiktok-playground";
  function targetOrigin(url) {
    const parsed = new URL(url);
    return parsed.protocol === "file:" || parsed.origin === "null" ? "*" : parsed.origin;
  }
  function validPacket(value, session2) {
    if (!value || typeof value !== "object" || !session2) return false;
    const p = value;
    try {
      if (JSON.stringify(p).length > 65536) return false;
    } catch {
      return false;
    }
    if (p.channel !== channel || p.session !== session2 || p.version !== 1) return false;
    if (p.action === "updated") return Object.keys(p).length === 4;
    if (p.action === "loaded") return Object.keys(p).length === 4;
    if (p.action === "ready") return Object.keys(p).length === 4 || Object.keys(p).length === 5 && (p.supported === null || Array.isArray(p.supported) && p.supported.length <= 5 && p.supported.every((t) => ["gift", "chat", "like", "follow", "roomUser"].includes(t)));
    if (p.action === "settings") return typeof p.animation === "boolean" && typeof p.sound === "boolean";
    if (p.action === "error") return typeof p.message === "string" && p.message.length <= 512;
    if (p.action !== "event") return false;
    const e = p.event;
    return !!e && e.version === 1 && e.synthetic === true && ["gift", "chat", "like", "follow", "roomUser"].includes(e.type) && typeof e.messageId === "string" && typeof e.room === "string" && typeof e.method === "string" && typeof e.receivedTimestamp === "string" && e.isHistory === false && !!e.data && typeof e.data === "object" && !Array.isArray(e.data) && validData(e);
  }
  function validData(e) {
    const d = e.data;
    const uint = (v) => typeof v === "string" && /^\d{1,20}$/.test(v) && BigInt(v) <= 18446744073709551615n;
    if (e.type !== "roomUser" && (!d.user || typeof d.user !== "object" || !uint(d.user.id) || typeof d.user.nickname !== "string")) return false;
    if (e.type === "gift") return uint(d.gift_id) && uint(d.repeat_count) && uint(d.combo_count) && typeof d.group_id === "string" && typeof d.gift_name === "string" && typeof d.repeat_end === "boolean";
    if (e.type === "like") return uint(d.count) && uint(d.total);
    if (e.type === "roomUser") return uint(d.total);
    return e.type !== "chat" || typeof d.comment === "string";
  }

  // web/playground/frame.ts
  (() => {
    const session2 = new URL(window.location.href).searchParams.get("session") || "";
    const previewWindow = window;
    if (previewWindow.TikTokPlaygroundSession) return;
    previewWindow.TikTokPlaygroundSession = session2;
    previewWindow.TikTokPlaygroundPreview = true;
    let state = "loading";
    const origin = document.referrer ? targetOrigin(document.referrer) : "*";
    const send = (action, extra = {}) => parent.postMessage({ channel, version: 1, session: session2, action, ...extra }, origin);
    window.addEventListener("message", (e) => {
      if (e.source !== parent || origin !== "*" && e.origin !== origin || !validPacket(e.data, session2)) return;
      if (e.data.action === "settings" && (state === "loaded" || state === "ready")) {
        previewWindow.TikTokWidgetConfig = { ...previewWindow.TikTokWidgetConfig, animation: e.data.animation, sound: e.data.sound };
        dispatchEvent(new CustomEvent("tiktok:preview-settings", { detail: previewWindow.TikTokWidgetConfig }));
        if (state === "loaded") {
          state = "ready";
          const types = { gifts: ["gift"], chat: ["chat"], likes: ["like"], viewers: ["roomUser"], alerts: ["follow"], events: ["gift", "chat", "like", "follow", "roomUser"] };
          const config = previewWindow.TikTokWidgetConfig || {};
          const available = Array.isArray(config.events) ? config.events : types[String(config.template || document.body?.dataset.template)];
          const filters = config.filters;
          send("ready", { supported: available ? available.filter((t) => !Array.isArray(filters) || !filters.length || filters.includes(t)) : null });
        }
      } else if (e.data.action === "event" && state === "ready") dispatchLocal(window, e.data.event);
    });
    window.addEventListener("tiktok:preview-error", (e) => send("error", { message: String(e.detail).slice(0, 512) }));
    window.addEventListener("load", () => {
      state = "loaded";
      send("loaded");
    }, { once: true });
    let poll;
    const pointer = previewWindow.TikTokWidgetBuildPointer;
    if (pointer) {
      previewWindow.TikTokWidgetBuildChanged = (build) => {
        if (state === "ready" && build !== previewWindow.TikTokWidgetBuildId) {
          state = "closed";
          send("updated");
          if (poll) clearInterval(poll);
        }
      };
      poll = setInterval(() => {
        if (state !== "ready") return;
        const script = document.createElement("script");
        script.src = `${pointer}?t=${Date.now()}`;
        script.onload = script.onerror = () => script.remove();
        document.head.append(script);
      }, 1e3);
    }
    window.addEventListener("pagehide", () => {
      state = "closed";
      if (poll) clearInterval(poll);
    }, { once: true });
  })();
})();
