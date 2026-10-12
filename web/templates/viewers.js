import { runtime } from "../runtime/renderer.js";
export function viewers(c, e, d) {
  if (e.type !== "roomUser") return;
  c.pending = d.total || "0";
  if (!c.timer)
    c.timer = setTimeout(
      () => {
        c.counter("Viewers", c.pending);
        c.timer = null;
      },
      Number(c.config.viewerCoalescingMs) || 250,
    );
}
export const start = () => {
  const c = runtime(viewers, { timer: null });
  c.counter("Viewers", "0");
  return c;
};
