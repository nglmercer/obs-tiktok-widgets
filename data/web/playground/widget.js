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
      for (const [type2, data] of [
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
              type: type2,
              data,
              room: "@fixture",
              messageId: "offline-" + type2 + "-" + Date.now()
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

  // web/templates/gifts.js
  function gifts(c, e, d) {
    if (e.type !== "gift") return;
    const key = `${e.room}:${d.user?.id}:${d.gift_id}:${d.group_id || e.messageId}`;
    const count = BigInt(d.repeat_count || "1"), previous = c.counts.get(key) || 0n;
    if (count < previous) return;
    c.counts.set(key, count);
    const old = c.rows.get(key);
    if (old?.isConnected) old.remove();
    const item = c.row(
      d.user,
      `${d.gift_name || "Gift"} \xD7 ${count}${d.repeat_end ? " \u2713" : " \u2026"}`,
      d.gift_image_url
    );
    c.rows.set(key, item);
    c.root.append(item);
    c.trim();
    if (count > previous) c.sound();
    if (c.rows.size > 2048) {
      const oldest = c.rows.keys().next().value;
      c.rows.delete(oldest);
      c.counts.delete(oldest);
    }
  }
  var start2 = () => runtime(gifts, { rows: /* @__PURE__ */ new Map(), counts: /* @__PURE__ */ new Map() });

  // web/templates/alerts.js
  function alerts(c, e, d) {
    if (e.type === "follow") {
      c.root.append(c.row(d.user, "followed the creator"));
      c.trim();
      c.sound();
      setTimeout(() => c.root.firstChild?.remove(), 5e3);
    }
  }
  var start3 = () => runtime(alerts, { followAlias: true });

  // web/templates/likes.js
  function likes(c, e, d) {
    if (e.type !== "like") return;
    c.total = d.total != null ? BigInt(d.total) : c.total + BigInt(d.count || "0");
    if (!c.timer)
      c.timer = setTimeout(
        () => {
          c.counter("\u2665", c.total.toString());
          c.timer = null;
        },
        Number(c.config.likeAggregationMs) || 250
      );
  }
  var start4 = () => {
    const c = runtime(likes, { total: 0n, timer: null });
    c.counter("\u2665", "0");
    return c;
  };

  // web/templates/viewers.js
  function viewers(c, e, d) {
    if (e.type !== "roomUser") return;
    c.pending = d.total || "0";
    if (!c.timer)
      c.timer = setTimeout(
        () => {
          c.counter("Viewers", c.pending);
          c.timer = null;
        },
        Number(c.config.viewerCoalescingMs) || 250
      );
  }
  var start5 = () => {
    const c = runtime(viewers, { timer: null });
    c.counter("Viewers", "0");
    return c;
  };

  // web/templates/events.js
  function events(c, e) {
    const pre = document.createElement("pre");
    const copy = { ...e };
    delete copy.native;
    pre.textContent = JSON.stringify(copy, null, 2);
    c.root.append(pre);
    c.trim();
  }
  var start6 = () => runtime(events);

  // web/widgets/widget.js
  var aliases = { "builtin.chat": "chat", "builtin.gift-alert": "gifts", "builtin.follow-alert": "alerts", "builtin.likes": "likes", "builtin.viewers": "viewers", "builtin.events": "events" };
  var type = window.TikTokWidgetConfig?.template || document.body.dataset.template;
  ({ chat: start, gifts: start2, alerts: start3, likes: start4, viewers: start5, events: start6 })[aliases[type] || type]?.();
})();
