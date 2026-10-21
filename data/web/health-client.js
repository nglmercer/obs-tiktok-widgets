"use strict";
(() => {
  // web/runtime/health-client.js
  function createWidgetHealthClient({
    target = globalThis.window,
    document = target?.document,
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
    if (document?.fonts) {
      report("font.status", {
        status: document.fonts.status === "loaded" ? "ready" : "loading"
      });
      fontTimer = setTimeout(
        () => report("font.status", { status: "timeout", code: "FONT_TIMEOUT" }),
        3e3
      );
      Promise.resolve(document.fonts.ready).then(
        () => {
          clearTimeout(fontTimer);
          report("font.status", {
            status: document.fonts.status === "loaded" ? "ready" : "failed"
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

  // web/runtime/health-bootstrap.js
  if (!window.TikTokPlaygroundPreview)
    window.TikTokWidgetHealth = createWidgetHealthClient();
})();
