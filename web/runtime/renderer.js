import { createWidgetHealthClient } from "./health-client.js";
export function runtime(handler, extra = {}) {
  const config = {
    template: document.body.dataset.template,
    animation: true,
    messageLimit: 30,
    ...window.TikTokWidgetConfig,
  };
  const health = createWidgetHealthClient();
  const root = document.getElementById("root");
  if (!root) {
    health.report("runtime.error", { code: "ROOT_MISSING" });
    return { config, root, health };
  }
  document.documentElement.style.setProperty(
    "--accent",
    config.color || "#ff416c",
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
      img.addEventListener(
        "error",
        () => {
          health.report("asset.failed", {
            code: "IMAGE_FAILED",
            resourceType: "img",
          });
          img.remove();
        },
        { once: true },
      );
      div.append(img);
    }
    const content = document.createElement("div"),
      name = document.createElement("strong"),
      message = document.createElement("div");
    name.textContent = user?.nickname || user?.unique_id || "Viewer";
    message.textContent = text;
    content.append(name, message);
    div.append(content);
    return div;
  }
  function trim() {
    while (
      root.children.length >
      Math.max(1, Math.min(1000, Number(config.messageLimit) || 30))
    )
      root.firstChild.remove();
  }
  function report(error) {
    health.report("audio.failed", {
      code:
        error?.name === "NotAllowedError"
          ? "AUDIO_BLOCKED"
          : "AUDIO_PLAY_FAILED",
    });
    const message = "Audio playback failed: " + (error?.message || error);
    console.warn(message);
    if (window.TikTokPlaygroundPreview)
      window.dispatchEvent(
        new CustomEvent("tiktok:preview-error", { detail: message }),
      );
  }
  function sound() {
    if (!config.sound || !config.soundUrl) return;
    try {
      const url = new URL(
        config.soundUrl,
        window.TikTokWidgetAssetBase || document.baseURI || location.href,
      );
      if (
        url.protocol === "file:" &&
        location.protocol === "http:" &&
        location.hostname === "absolute"
      ) {
        url.href = new URL(
          location.origin + "/" + url.pathname + url.search + url.hash,
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
  const ctx = { config, root, row, trim, sound, counter, health, ...extra };
  const changes =
    typeof MutationObserver === "function"
      ? new MutationObserver(() => {})
      : null;
  changes?.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
  });
  const accept = (event) => {
    const e = event.detail;
    if (!e || e.version !== 1) return;
    if (config.filters?.length && !config.filters.includes(e.type)) {
      health.report("event.skipped", { eventType: e.type, code: "FILTER" });
      return;
    }
    const ticket = health.begin(e, {
      deduplicate: e.type === "gift" || e.type === "follow",
    });
    if (!ticket) return;
    try {
      changes?.takeRecords();
      handler(ctx, e, e.data || {});
      health.processed(ticket);
      if (changes?.takeRecords().length) health.rendered(ticket, root);
    } catch (error) {
      health.failed(ticket);
      console.warn("Invalid widget event", error);
    }
  };
  window.addEventListener("tiktok:event", accept);
  const previewSettings = (event) => {
    if (window.TikTokPlaygroundPreview) {
      Object.assign(config, event.detail);
      document.documentElement.style.setProperty(
        "--accent",
        config.color || "#ff416c",
      );
      document.body.classList.toggle("light", config.theme === "light");
      style.textContent = config.customCss || "";
    }
  };
  const state = (event) => {
    window.TikTokLastState = event.detail;
  };
  const follow = (event) => {
    if (event.detail.type !== "follow")
      accept({ detail: { ...event.detail, type: "follow" } });
  };
  window.addEventListener("tiktok:preview-settings", previewSettings);
  window.addEventListener("tiktok:state", state);
  if (extra.followAlias) window.addEventListener("tiktok:follow", follow);
  ctx.dispose = () => {
    window.removeEventListener("tiktok:event", accept);
    window.removeEventListener("tiktok:preview-settings", previewSettings);
    window.removeEventListener("tiktok:state", state);
    window.removeEventListener("tiktok:follow", follow);
    changes?.disconnect();
    health.dispose();
  };
  health.ready();
  offlineFixture(config);
  return ctx;
}
export function offlineFixture(config) {
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
          repeat_end: true,
        },
      ],
      ["like", { count: "23", total: "23" }],
      ["follow", { user }],
      ["roomUser", { total: "23" }],
    ])
      window.dispatchEvent(
        new CustomEvent("tiktok:event", {
          detail: {
            version: 1,
            synthetic: true,
            type,
            data,
            room: "@fixture",
            messageId: "offline-" + type + "-" + Date.now(),
          },
        }),
      );
  };
}
