import { runtime } from "../runtime/renderer.js";
export function gifts(c, e, d) {
  if (e.type !== "gift") return;
  const key = `${e.room}:${d.user?.id}:${d.gift_id}:${d.group_id || e.messageId}`;
  const count = BigInt(d.repeat_count || "1"),
    previous = c.counts.get(key) || 0n;
  if (count < previous) return;
  c.counts.set(key, count);
  const old = c.rows.get(key);
  if (old?.isConnected) old.remove();
  const item = c.row(
    d.user,
    `${d.gift_name || "Gift"} × ${count}${d.repeat_end ? " ✓" : " …"}`,
    d.gift_image_url,
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
export const start = () =>
  runtime(gifts, { rows: new Map(), counts: new Map() });
