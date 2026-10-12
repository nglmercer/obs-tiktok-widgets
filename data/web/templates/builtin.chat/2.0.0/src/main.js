"use strict";
(() => {
  // web/runtime/renderer.js
  function runtime(handler, extra = {}) {
    const config = {
      template: document.body.dataset.template,
      animation: true,
      messageLimit: 30,
      ...window.TikTokWidgetConfig
    };
    const root = document.getElementById("root");
    document.documentElement.style.setProperty(
      "--accent",
      config.color || "#ff416c"
    );
    document.body.classList.toggle("light", config.theme === "light");
    const style = document.createElement("style");
    style.textContent = config.customCss || "";
    document.head.append(style);
    const safeUrl = (url) => {
      try {
        const u = new URL(url);
        return ["https:", "http:"].includes(u.protocol) ? u.href : "";
      } catch {
        return "";
      }
    };
    function row(user, text, url) {
      const div = document.createElement("div");
      div.className = "item" + (config.animation ? " animate" : "");
      const src = safeUrl(url || user?.avatar_url);
      if (src) {
        const img = document.createElement("img");
        img.src = src;
        img.referrerPolicy = "no-referrer";
        div.append(img);
      }
      const content = document.createElement("div"), name = document.createElement("strong"), message = document.createElement("div");
      name.textContent = user?.nickname || user?.unique_id || "Viewer";
      message.textContent = text;
      content.append(name, message);
      div.append(content);
      return div;
    }
    function trim() {
      while (root.children.length > Math.max(1, Math.min(1e3, Number(config.messageLimit) || 30)))
        root.firstChild.remove();
    }
    function report(error) {
      const message = "Audio playback failed: " + (error?.message || error);
      console.warn(message);
      if (window.TikTokPlaygroundPreview)
        window.dispatchEvent(
          new CustomEvent("tiktok:preview-error", { detail: message })
        );
    }
    function sound() {
      if (!config.sound || !config.soundUrl) return;
      try {
        const url = new URL(
          config.soundUrl,
          window.TikTokWidgetAssetBase || document.baseURI || location.href
        );
        if (url.protocol === "file:" && location.protocol === "http:" && location.hostname === "absolute") {
          url.href = new URL(
            location.origin + "/" + url.pathname + url.search + url.hash
          ).href;
        }
        if (!["file:", "https:", "http:"].includes(url.protocol))
          throw new Error("Unsupported audio URL protocol");
        new Audio(url.href).play().catch(report);
      } catch (e) {
        report(e);
      }
    }
    function counter(label, value) {
      root.replaceChildren();
      const div = document.createElement("div");
      div.className = "counter" + (config.animation ? " animate" : "");
      div.textContent = `${label} ${value}`;
      root.append(div);
    }
    const ctx = { config, root, row, trim, sound, counter, ...extra };
    const accept = (event) => {
      const e = event.detail;
      if (!e || e.version !== 1 || config.filters?.length && !config.filters.includes(e.type))
        return;
      try {
        handler(ctx, e, e.data || {});
      } catch (error) {
        console.warn("Invalid widget event", error);
      }
    };
    window.addEventListener("tiktok:event", accept);
    window.addEventListener("tiktok:preview-settings", (event) => {
      if (window.TikTokPlaygroundPreview) {
        config.animation = event.detail.animation;
        config.sound = event.detail.sound;
      }
    });
    window.addEventListener("tiktok:state", (event) => {
      window.TikTokLastState = event.detail;
    });
    if (extra.followAlias)
      window.addEventListener("tiktok:follow", (event) => {
        if (event.detail.type !== "follow")
          accept({ detail: { ...event.detail, type: "follow" } });
      });
    offlineFixture(config);
    return ctx;
  }
  function offlineFixture(config) {
    if (!new URL(location.href).searchParams.has("preview")) return;
    const button = document.createElement("button");
    button.id = "preview";
    button.textContent = "Play offline fixtures";
    document.body.prepend(button);
    button.onclick = () => {
      const user = { nickname: "Viewer123", id: "9007199254740993" };
      for (const [type, data] of [
        ["chat", { user, comment: "Hello from local preview" }],
        [
          "gift",
          {
            user,
            gift_id: "5655",
            gift_name: "Rose",
            group_id: "fixture-" + Date.now(),
            repeat_count: "23",
            repeat_end: true
          }
        ],
        ["like", { count: "23", total: "23" }],
        ["follow", { user }],
        ["roomUser", { total: "23" }]
      ])
        window.dispatchEvent(
          new CustomEvent("tiktok:event", {
            detail: {
              version: 1,
              synthetic: true,
              type,
              data,
              room: "@fixture",
              messageId: "offline-" + type + "-" + Date.now()
            }
          })
        );
    };
  }

  // web/templates/chat.js
  function chat(c, e, d) {
    if (e.type === "chat") {
      c.root.append(c.row(d.user, d.comment || ""));
      c.trim();
    }
  }
  var start = () => runtime(chat);

  // web/templates/builtin.chat/2.0.0/src/main.js
  start();
})();
