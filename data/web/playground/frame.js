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

  // web/playground/frame.ts
  (() => {
    "use strict";
    const previewWindow = window;
    previewWindow.TikTokPlaygroundPreview = true;
    let initialized = false;
    window.addEventListener("message", (e) => {
      if (e.source !== parent || e.data?.channel !== "tiktok-playground") return;
      if (e.data.action === "settings") {
        previewWindow.TikTokWidgetConfig = {
          ...previewWindow.TikTokWidgetConfig,
          animation: !!e.data.animation,
          sound: !!e.data.sound
        };
        if (!initialized) {
          initialized = true;
          parent.postMessage(
            { channel: "tiktok-playground", action: "ready" },
            "*"
          );
        }
      }
      if (e.data.action === "event" && e.data.event?.version === 1 && e.data.event.synthetic === true) {
        dispatchLocal(window, e.data.event);
      }
    });
    window.addEventListener(
      "load",
      () => parent.postMessage({ channel: "tiktok-playground", action: "loaded" }, "*")
    );
  })();
})();
