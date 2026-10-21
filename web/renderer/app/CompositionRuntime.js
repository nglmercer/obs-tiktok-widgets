import { EventRouter, clone, fromOBS } from "../../universal/index.js";
import { orderedWidgets, validateComposition } from "./composition.js";

// One canonical native listener per canvas. No Studio transport or credentials.
export class CompositionRuntime {
  constructor(
    root,
    registry,
    { target = window, mountTimeout = 5000, preview = false } = {},
  ) {
    this.root = root;
    this.registry = registry;
    this.target = target;
    this.mountTimeout = mountTimeout;
    this.preview = preview;
    this.router = new EventRouter();
    this.hosts = new Map();
    this.generation = 0;
    this.state = "initializing";
    this.stats = { mountErrors: 0, handlingErrors: 0, queueOverflow: 0 };
    this.accept = (event) => this.router.push(event.detail);
    this.legacyPreview = (event) => {
      // The local preview frame dispatches v1 fixtures; never broadcast them.
      if (this.preview && event.detail?.version === 1)
        this.router.push(fromOBS(event.detail, "composition.preview"));
    };
    target.addEventListener("universal:event", this.accept);
    if (preview) target.addEventListener("tiktok:event", this.legacyPreview);
    this.unsubscribe = this.router.subscribe((event) => {
      for (const host of this.hosts.values()) {
        if (host.state !== "ready") continue;
        const events = host.widget.events ?? host.definition.events;
        if (events?.length && !events.includes(event.type)) continue;
        this.dispatch(host, clone(event));
      }
    });
  }
  fail(host) {
    if (host.abort.signal.aborted) return;
    this.stats.handlingErrors++;
    host.state = "failed";
    this.state = "degraded";
    this.disposeHost(host);
  }
  dispatch(host, event) {
    if (host.abort.signal.aborted || host.state !== "ready") return;
    if (host.busy) {
      if (host.queue.length >= 64) this.stats.queueOverflow++;
      else host.queue.push(event);
      return;
    }
    try {
      const result = host.runtime.handleEvent(event);
      if (result && typeof result.then === "function") {
        host.busy = true;
        Promise.resolve(result)
          .catch(() => this.fail(host))
          .finally(() => {
            host.busy = false;
            while (
              !host.busy &&
              host.queue.length &&
              !host.abort.signal.aborted
            )
              this.dispatch(host, host.queue.shift());
          });
      }
    } catch {
      this.fail(host);
    }
  }
  async load(composition) {
    validateComposition(composition);
    if (this.state === "destroyed") throw new Error("RUNTIME_DESTROYED");
    const generation = ++this.generation;
    const nextIds = new Set(
      composition.widgets.filter((w) => w.enabled).map((w) => w.id),
    );
    for (const [id, host] of this.hosts) {
      if (!nextIds.has(id)) {
        this.disposeHost(host);
        this.hosts.delete(id);
      }
    }
    this.state = "initializing";
    Object.assign(this.root.style, {
      position: "relative",
      overflow: "hidden",
      width: `${composition.viewport.width}px`,
      height: `${composition.viewport.height}px`,
      background: composition.background,
    });
    await Promise.all(
      orderedWidgets(composition)
        .filter((w) => w.enabled)
        .map(async (widget) => {
          const previous = this.hosts.get(widget.id);
          const reusable =
            previous?.state === "ready" &&
            JSON.stringify(previous.widget.template) ===
              JSON.stringify(widget.template) &&
            JSON.stringify(previous.widget.settings) ===
              JSON.stringify(widget.settings);
          if (previous && !reusable) this.disposeHost(previous);
          const node = reusable
            ? previous.node
            : this.root.ownerDocument.createElement("div");
          const t = widget.transform;
          node.dataset.widget = widget.id;
          Object.assign(node.style, {
            position: "absolute",
            overflow: "hidden",
            left: `${t.x}px`,
            top: `${t.y}px`,
            width: `${t.width}px`,
            height: `${t.height}px`,
            transform: `rotate(${t.rotation}deg)`,
            opacity: String(t.opacity),
            zIndex: String(widget.zIndex),
            display: widget.visible ? "" : "none",
          });
          if (reusable) {
            previous.widget = clone(widget);
            return;
          }
          this.root.append(node);
          const host = {
            widget: clone(widget),
            node,
            state: "mounting",
            busy: false,
            queue: [],
            abort: new AbortController(),
          };
          this.hosts.set(widget.id, host);
          try {
            host.definition = this.registry.resolve(
              widget.template.id,
              widget.template.version,
            );
            if (!host.definition)
              throw new Error("TEMPLATE_VERSION_UNAVAILABLE");
            host.runtime = host.definition.createRuntime({
              signal: host.abort.signal,
              settings: clone(widget.settings),
              fail: (code) => {
                host.error = code;
                this.fail(host);
              },
            });
            const mounted = Promise.resolve().then(() =>
              host.runtime.mount(node),
            );
            let timer;
            const timeout = new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error("MOUNT_TIMEOUT")),
                this.mountTimeout,
              );
            });
            try {
              await Promise.race([mounted, timeout]);
            } finally {
              clearTimeout(timer);
            }
            if (generation !== this.generation || host.abort.signal.aborted)
              return;
            host.state = "ready";
          } catch (error) {
            host.error = String(error.message || error);
            host.state = "failed";
            this.stats.mountErrors++;
            this.disposeHost(host);
          }
        }),
    );
    if (generation === this.generation && this.state !== "destroyed")
      this.state = [...this.hosts.values()].some((h) => h.state === "failed")
        ? "degraded"
        : "ready";
  }
  disposeHost(host) {
    host.abort.abort();
    host.queue.length = 0;
    if (!host.disposed) {
      host.disposed = true;
      try {
        Promise.resolve(host.runtime?.destroy()).catch(() => {});
      } catch {}
    }
    host.node.remove();
  }
  clear() {
    for (const host of this.hosts.values()) this.disposeHost(host);
    this.hosts.clear();
  }
  destroy() {
    ++this.generation;
    this.state = "destroyed";
    this.target.removeEventListener("universal:event", this.accept);
    this.target.removeEventListener("tiktok:event", this.legacyPreview);
    this.unsubscribe();
    this.clear();
  }
  diagnostics() {
    return {
      state: this.state,
      ...this.stats,
      events: { ...this.router.stats },
      widgets: [...this.hosts.values()].map((h) => ({
        id: h.widget.id,
        state: h.state,
        error: h.error,
      })),
    };
  }
}
