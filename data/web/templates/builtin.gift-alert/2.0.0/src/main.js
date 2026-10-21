"use strict";
(() => {
  // web/runtime/health-client.js
  function createWidgetHealthClient({
    target = globalThis.window,
    document: document2 = target?.document,
    now = () => globalThis.performance?.now?.() ?? Date.now(),
    limit = 100
  } = {}) {
    if (target?.TikTokWidgetHealth) return target.TikTokWidgetHealth;
    const session = target?.TikTokWidgetHealthSession;
    const identity = target?.TikTokWidgetHealthIdentity;
    const endpoint = /^http:\/\/127\.0\.0\.1:[0-9]+\/widget-health\/v1\/report$/.test(
      session?.endpoint ?? ""
    ) ? session.endpoint : null;
    const outgoing = [];
    let sendTimer, transport = endpoint ? "negotiating" : "unavailable";
    function flush() {
      sendTimer = void 0;
      const packet = outgoing.shift();
      if (!packet || disposed) return;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1500);
      Promise.resolve().then(
        () => target.fetch(endpoint, {
          method: "POST",
          credentials: "omit",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "X-Widget-Health-Token": session.token
          },
          body: JSON.stringify(packet),
          signal: controller.signal
        })
      ).then(
        (response) => {
          transport = response.ok ? "available" : "unavailable";
        },
        () => {
          transport = "unavailable";
        }
      ).finally(() => clearTimeout(timeout));
      if (outgoing.length) sendTimer = setTimeout(flush, 250);
    }
    const records = [], listeners = [], seen = /* @__PURE__ */ new Map();
    let disposed = false, mounted = false;
    const instanceId = globalThis.crypto?.randomUUID?.() ?? `page-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    function report(kind, data = {}) {
      if (disposed) return;
      const safe = {};
      for (const key of [
        "eventId",
        "eventType",
        "code",
        "status",
        "resourceType"
      ])
        if (typeof data[key] === "string" && /^[A-Za-z0-9_.:-]{1,128}$/.test(data[key]))
          safe[key] = data[key];
      if (typeof data.widgetMounted === "boolean")
        safe.widgetMounted = data.widgetMounted;
      if (Number.isFinite(data.elapsedMs))
        safe.elapsedMs = Math.max(0, Math.min(3e5, data.elapsedMs));
      records.push(
        Object.freeze({
          protocol: "widget-health/v1",
          instanceId,
          kind,
          monotonicMs: now(),
          data: Object.freeze(safe)
        })
      );
      if (endpoint && identity?.widgetId && identity?.buildId && typeof target?.fetch === "function") {
        const packet = {
          protocol: "widget-health/v1",
          sessionId: session.sessionId,
          widgetId: identity.widgetId,
          buildId: identity.buildId,
          instanceId,
          kind,
          data: safe
        };
        if (outgoing.length < 32) outgoing.push(packet);
        if (!sendTimer) sendTimer = setTimeout(flush, 250);
      }
      if (records.length > Math.max(1, Math.min(1e3, limit))) records.shift();
    }
    function on(name, fn, capture = false) {
      target?.addEventListener(name, fn, capture);
      listeners.push(() => target?.removeEventListener(name, fn, capture));
    }
    on(
      "error",
      (event) => {
        const tag = event.target?.tagName?.toLowerCase();
        if (["script", "link", "img", "audio", "video", "source"].includes(tag))
          report("asset.failed", {
            code: "RESOURCE_LOAD_FAILED",
            resourceType: tag
          });
        else report("runtime.error", { code: "JS_EXCEPTION" });
      },
      true
    );
    on(
      "unhandledrejection",
      () => report("runtime.error", { code: "UNHANDLED_REJECTION" })
    );
    on(
      "securitypolicyviolation",
      () => report("runtime.error", { code: "CSP_BLOCKED" })
    );
    on("pagehide", () => report("pagehide"));
    on("pageshow", () => {
      if (mounted) report("ready", { widgetMounted: true });
    });
    const heartbeat = target?.setInterval?.(() => {
      report("heartbeat", { widgetMounted: mounted });
    }, 5e3);
    let fontTimer;
    if (document2?.fonts) {
      report("font.status", {
        status: document2.fonts.status === "loaded" ? "ready" : "loading"
      });
      fontTimer = setTimeout(
        () => report("font.status", { status: "timeout", code: "FONT_TIMEOUT" }),
        3e3
      );
      Promise.resolve(document2.fonts.ready).then(
        () => {
          clearTimeout(fontTimer);
          report("font.status", {
            status: document2.fonts.status === "loaded" ? "ready" : "failed"
          });
        },
        () => {
          clearTimeout(fontTimer);
          report("font.status", { status: "failed", code: "FONT_FAILED" });
        }
      );
    }
    report("loading");
    const client = {
      instanceId,
      transportStatus() {
        return transport;
      },
      report,
      ready() {
        mounted = true;
        report("ready", { widgetMounted: true });
      },
      heartbeat() {
        report("heartbeat", { widgetMounted: mounted });
      },
      snapshot() {
        return records.slice();
      },
      // Only explicit stable IDs are deduplicated. Never collapse gift streak updates
      // by group ID: repeat_count is cumulative and each update may be distinct.
      begin(event, { deduplicate = false } = {}) {
        const id = event?.id ?? event?.messageId;
        const cumulative = event?.data?.repeat_count ?? event?.data?.repeatCount ?? event?.payload?.repeatCount;
        const ended = event?.data?.repeat_end ?? event?.data?.repeatEnd;
        if (event?.type === "gift" && cumulative !== void 0 && !/^[0-9]{1,20}$/.test(String(cumulative)))
          deduplicate = false;
        const key = `${event?.type}:${id}:${event?.type === "gift" ? `${cumulative ?? ""}:${ended ?? ""}` : ""}`;
        for (const [oldKey, time] of seen)
          if (now() - time > 3e4) seen.delete(oldKey);
        const data = {
          eventId: typeof id === "string" ? id : "",
          eventType: event?.type
        };
        report("event.received", data);
        if (deduplicate && typeof id === "string" && id.length <= 128 && id.length && seen.has(key)) {
          report("event.skipped", { ...data, code: "DUPLICATE" });
          return null;
        }
        if (deduplicate && typeof id === "string" && id.length <= 128 && id.length) {
          seen.set(key, now());
          for (const [key2, time] of seen)
            if (now() - time > 3e4 || seen.size > 256) seen.delete(key2);
        }
        return { data, start: now() };
      },
      processed(ticket) {
        if (ticket)
          report("event.processed", {
            ...ticket.data,
            elapsedMs: now() - ticket.start
          });
      },
      rendered(ticket, root) {
        if (!ticket || !target?.requestAnimationFrame) return;
        target.requestAnimationFrame(
          () => target.requestAnimationFrame(() => {
            if (root?.isConnected && root.childNodes.length)
              report("event.rendered", {
                ...ticket.data,
                elapsedMs: now() - ticket.start
              });
          })
        );
      },
      failed(ticket) {
        if (ticket)
          report("event.failed", { ...ticket.data, code: "HANDLER_FAILED" });
      },
      dispose() {
        report("pagehide");
        disposed = true;
        clearTimeout(fontTimer);
        target?.clearInterval?.(heartbeat);
        clearTimeout(sendTimer);
        outgoing.length = 0;
        listeners.splice(0).forEach((off) => off());
        seen.clear();
      }
    };
    return client;
  }

  // web/runtime/renderer.js
  function runtime(handler, extra = {}) {
    const config = {
      template: document.body.dataset.template,
      animation: true,
      messageLimit: 30,
      ...window.TikTokWidgetConfig
    };
    const health = createWidgetHealthClient();
    const root = document.getElementById("root");
    if (!root) {
      health.report("runtime.error", { code: "ROOT_MISSING" });
      return { config, root, health };
    }
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
        img.addEventListener(
          "error",
          () => {
            health.report("asset.failed", {
              code: "IMAGE_FAILED",
              resourceType: "img"
            });
            img.remove();
          },
          { once: true }
        );
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
      health.report("audio.failed", {
        code: error?.name === "NotAllowedError" ? "AUDIO_BLOCKED" : "AUDIO_PLAY_FAILED"
      });
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
    const ctx = { config, root, row, trim, sound, counter, health, ...extra };
    const changes = typeof MutationObserver === "function" ? new MutationObserver(() => {
    }) : null;
    changes?.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });
    const accept = (event) => {
      const e = event.detail;
      if (!e || e.version !== 1) return;
      if (config.filters?.length && !config.filters.includes(e.type)) {
        health.report("event.skipped", { eventType: e.type, code: "FILTER" });
        return;
      }
      const ticket = health.begin(e, {
        deduplicate: e.type === "gift" || e.type === "follow"
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
          config.color || "#ff416c"
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
  var start = () => runtime(gifts, { rows: /* @__PURE__ */ new Map(), counts: /* @__PURE__ */ new Map() });

  // web/templates/builtin.gift-alert/2.0.0/src/main.js
  start();
})();
