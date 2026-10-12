import { runtime } from "../runtime/renderer.js";
export function alerts(c, e, d) {
  if (e.type === "follow") {
    c.root.append(c.row(d.user, "followed the creator"));
    c.trim();
    c.sound();
    setTimeout(() => c.root.firstChild?.remove(), 5000);
  }
}
export const start = () => runtime(alerts, { followAlias: true });
