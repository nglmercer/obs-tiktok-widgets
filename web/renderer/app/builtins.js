import { customDefinition } from "./custom.js";
import { WidgetRegistry } from "./composition.js";
import { chat } from "../../templates/chat.js";
import { gifts } from "../../templates/gifts.js";
import { alerts } from "../../templates/alerts.js";
import { likes } from "../../templates/likes.js";
import { viewers } from "../../templates/viewers.js";
import { events } from "../../templates/events.js";
import mappings from "../../universal/schemas/mappings.schema.json" with { type: "json" };
import css from "../../widgets/widget.css?raw";

function legacyEvent(event) {
  const mapping = mappings.definitions[event.type] ?? {};
  const data = { ...event.data };
  for (const [key, rule] of Object.entries(mapping))
    data[rule[0]] = event.data[key] ?? rule[3];
  data.user = {};
  for (const [key, rule] of Object.entries(mappings.user))
    data.user[rule[0]] = event.data.user?.[key] ?? rule[3];
  const type =
    event.type === "tiktok.room_stats"
      ? "roomUser"
      : event.type.replace(/^tiktok\./, "");
  return {
    version: 1,
    type,
    data,
    room: event.metadata?.room ?? "",
    messageId: event.id,
  };
}

function createRuntime(handler, initial, { settings, signal }) {
  const timers = new Set(),
    audio = new Set();
  let root, shadow;
  const c = {
    ...initial(),
    config: { messageLimit: 30, animation: true, ...settings },
    setTimeout(fn, ms) {
      if (signal.aborted) return null;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (!signal.aborted) fn();
      }, ms);
      timers.add(timer);
      return timer;
    },
    row(user, text, url) {
      const row = document.createElement("div");
      row.className = "item" + (c.config.animation ? " animate" : "");
      const imageUrl = url || user?.avatar_url;
      if (imageUrl && /^https?:\/\//i.test(imageUrl)) {
        const img = document.createElement("img");
        img.src = imageUrl;
        img.referrerPolicy = "no-referrer";
        img.alt = "";
        row.append(img);
      }
      const textNode = document.createElement("div"),
        name = document.createElement("strong"),
        message = document.createElement("div");
      name.textContent = user?.nickname || user?.unique_id || "Viewer";
      message.textContent = text;
      textNode.append(name, message);
      row.append(textNode);
      return row;
    },
    trim() {
      while (
        root.children.length >
        Math.max(1, Math.min(1000, Number(c.config.messageLimit) || 30))
      )
        root.firstChild.remove();
    },
    counter(label, value) {
      const node = document.createElement("div");
      node.className = "counter";
      node.textContent = `${label} ${value}`;
      root.replaceChildren(node);
    },
    sound() {
      if (!c.config.sound || !c.config.soundUrl || signal.aborted) return;
      if (audio.size >= 16) return;
      const url = new URL(c.config.soundUrl, document.baseURI);
      if (!["file:", "http:", "https:"].includes(url.protocol)) return;
      const player = new Audio(url.href);
      audio.add(player);
      const done = () => audio.delete(player);
      player.onended = done;
      player.onerror = done;
      player.play().catch(done);
    },
  };
  const destroy = () => {
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    for (const player of audio) {
      player.pause();
      player.removeAttribute("src");
      player.load();
    }
    audio.clear();
    shadow?.replaceChildren();
    c.rows?.clear();
    c.counts?.clear();
    c.root = root = null;
  };
  signal.addEventListener("abort", destroy, { once: true });
  return {
    mount(container) {
      if (signal.aborted) return;
      shadow = container.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent =
        `:host{display:block;color:white;font:22px system-ui;--accent:${/^#[0-9a-f]{3,8}$/i.test(c.config.color) ? c.config.color : "#ff416c"}}` +
        css +
        (c.config.customCss || "");
      root = document.createElement("main");
      root.id = "root";
      if (c.config.theme === "light") root.className = "light";
      c.root = root;
      shadow.append(style, root);
    },
    handleEvent(event) {
      const legacy = legacyEvent(event);
      handler(c, legacy, legacy.data);
    },
    update(next) {
      Object.assign(c.config, next);
    },
    destroy() {
      signal.removeEventListener("abort", destroy);
      destroy();
    },
  };
}
export function builtinRegistry() {
  const registry = new WidgetRegistry();
  for (const [id, handler, subscriptions, initial] of [
    ["builtin.chat", chat, ["tiktok.chat"], () => ({})],
    [
      "builtin.gift-alert",
      gifts,
      ["tiktok.gift"],
      () => ({ rows: new Map(), counts: new Map() }),
    ],
    ["builtin.follow-alert", alerts, ["tiktok.follow"], () => ({})],
    [
      "builtin.likes",
      likes,
      ["tiktok.like"],
      () => ({ total: 0n, timer: null }),
    ],
    [
      "builtin.viewers",
      viewers,
      ["tiktok.room_stats"],
      () => ({ timer: null }),
    ],
    ["builtin.events", events, [], () => ({})],
  ])
    registry.register({
      id,
      version: "2.0.0",
      events: subscriptions,
      createRuntime: (context) => createRuntime(handler, initial, context),
    });
  registry.register(customDefinition());
  return registry;
}
