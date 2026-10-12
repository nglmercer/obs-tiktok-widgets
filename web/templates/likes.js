import { runtime } from "../runtime/renderer.js";
export function likes(c, e, d) {
  if (e.type !== "like") return;
  c.total =
    d.total != null ? BigInt(d.total) : c.total + BigInt(d.count || "0");
  if (!c.timer)
    c.timer = setTimeout(
      () => {
        c.counter("♥", c.total.toString());
        c.timer = null;
      },
      Number(c.config.likeAggregationMs) || 250,
    );
}
export const start = () => {
  const c = runtime(likes, { total: 0n, timer: null });
  c.counter("♥", "0");
  return c;
};
