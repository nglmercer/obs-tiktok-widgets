import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useTikTokEvent } from "@obs-tiktok/widgets-react";
import "./style.css";
function Alert() {
  const [gift, setGift] = useState("Waiting for a gift");
  const [groups] = useState(() => new Map<string, bigint>());
  const [config, setConfig] = useState(
    (window as any).TikTokWidgetConfig || {},
  );
  useEffect(() => {
    const update = (e: Event) => setConfig((e as CustomEvent).detail);
    window.addEventListener("tiktok:preview-settings", update);
    return () => window.removeEventListener("tiktok:preview-settings", update);
  }, []);
  useTikTokEvent("gift", (event) => {
    const d = event.data;
    const n = BigInt(d.repeat_count);
    const maximum =
      n > (groups.get(d.group_id) || 0n) ? n : groups.get(d.group_id)!;
    groups.set(d.group_id, maximum);
    setGift(
      `${d.user.nickname || "Viewer123"} sends ${maximum} ${d.gift_name}`,
    );
  });
  return (
    <section
      id="alert"
      style={{
        width: config.width,
        height: config.height,
        color: config.color || "#ff77cc",
        fontSize: config.fontSize || 32,
        transform: `translate(${config.x || 0}px,${config.y || 0}px)`,
      }}
    >
      <h1>{config.title || "Rose alert"}</h1>
      <p id="gift">{gift}</p>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<Alert />);
