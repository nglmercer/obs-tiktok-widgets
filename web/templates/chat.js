import { runtime } from "../runtime/renderer.js";
export function chat(c, e, d) {
  if (e.type === "chat") {
    c.root.append(c.row(d.user, d.comment || ""));
    c.trim();
  }
}
export const start = () => runtime(chat);
