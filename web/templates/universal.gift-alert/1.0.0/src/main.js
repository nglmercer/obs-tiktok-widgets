import {
  WidgetRuntime,
  browserHost,
  fromOBS,
} from "../../../../universal/index.js";
const manifest = {
  contract: "universal-widget",
  schemaVersion: 3,
  id: "universal.gift-alert",
  name: "Universal Alert",
  version: "1.0.0",
  engine: "web",
  entry: "src/index.html",
  events: ["custom.alert", "tiktok.gift"],
  defaultSize: { width: 600, height: 400 },
  capabilities: [
    "events.subscribe",
    "assets.read",
    "settings.read",
    "preview.inject",
  ],
};
const root = document.getElementById("root");
let settings = {};
const gifts = new Map();
const widget = {
  initialize(context) {
    settings = context.settings;
  },
  mount() {
    root.style.setProperty(
      "--accent",
      /^#[0-9a-f]{6}$/i.test(settings.color) ? settings.color : "#ff416c",
    );
  },
  updateSettings(value) {
    settings = value;
    this.mount();
  },
  onEvent(event) {
    const key =
      event.type === "tiktok.gift"
        ? `${event.data.user?.id || ""}:${event.data.giftId}:${event.data.groupId || event.id}`
        : undefined;
    if (key && gifts.has(key)) {
      gifts.get(key).querySelector("p").textContent =
        `${event.data.giftName || "Gift"} × ${event.data.repeatCount}`;
      return;
    }
    const card = document.createElement("article"),
      title = document.createElement("h2"),
      message = document.createElement("p");
    card.className = "alert";
    title.textContent =
      event.type === "custom.alert"
        ? event.data.title
        : settings.title || "Gift received";
    message.textContent =
      event.type === "custom.alert"
        ? event.data.message || ""
        : `${event.data.giftName || "Gift"} × ${event.data.repeatCount}`;
    card.append(title, message);
    root.append(card);
    if (key) {
      gifts.set(key, card);
      card.dataset.giftKey = key;
    }
    while (root.children.length > 5) {
      gifts.delete(root.firstChild.dataset.giftKey);
      root.firstChild.remove();
    }
  },
  dispose() {
    gifts.clear();
    root.replaceChildren();
  },
};
const preview = new URLSearchParams(location.search).has("__playground");
const runtime = new WidgetRuntime(
  widget,
  browserHost(root, { preview }),
  manifest,
);
runtime.initialize(window.TikTokWidgetConfig || {}).catch(console.error);
window.addEventListener("pagehide", () => runtime.dispose(), { once: true });
// Standalone local preview only. Live frames never subscribe to fixture messages.
if (preview)
  window.addEventListener("universal:preview", (event) =>
    runtime.preview(event.detail),
  );
if (preview) {
  window.addEventListener("tiktok:event", (event) => {
    const canonical = fromOBS(event.detail, "preview.local");
    if (event.detail.type === "custom.alert") {
      canonical.type = "custom.alert";
      canonical.data = {
        title: settings.title || "Test alert",
        message: "Viewer123 sends Rose ×23",
      };
    }
    runtime.preview(canonical);
  });
  window.addEventListener("tiktok:preview-settings", (event) => {
    const next = {};
    for (const key of ["title", "color"])
      if (key in event.detail) next[key] = event.detail[key];
    runtime.updateSettings(next);
  });
}
