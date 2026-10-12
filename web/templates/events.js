import { runtime } from "../runtime/renderer.js";
export function events(c, e) {
  const pre = document.createElement("pre");
  const copy = { ...e };
  delete copy.native;
  pre.textContent = JSON.stringify(copy, null, 2);
  c.root.append(pre);
  c.trim();
}
export const start = () => runtime(events);
