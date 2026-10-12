import { onTikTokEvent } from "@obs-tiktok/widgets-sdk";
import "./style.css";
const config = (window as any).TikTokWidgetConfig || {};
const root = document.getElementById("root")!;
root.innerHTML =
  '<section id="alert"><h1></h1><p id="gift">Waiting for a gift</p></section>';
const alert = document.getElementById("alert")!;
alert.style.color = config.color || "#ff77cc";
alert.style.fontSize = (config.fontSize || 32) + "px";
alert.style.transform = `translate(${config.x || 0}px,${config.y || 0}px)`;
root.querySelector("h1")!.textContent = config.title || "Rose alert";
const groups = new Map<string, bigint>();
onTikTokEvent("gift", (event) => {
  const data = event.data;
  const count = BigInt(data.repeat_count);
  const max =
    count > (groups.get(data.group_id) || 0n)
      ? count
      : groups.get(data.group_id)!;
  groups.set(data.group_id, max);
  document.getElementById("gift")!.textContent =
    `${data.user.nickname || "Viewer123"} sends ${max} ${data.gift_name}`;
});
