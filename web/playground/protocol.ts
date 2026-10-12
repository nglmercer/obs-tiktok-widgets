import type { TikTokEvent } from "../sdk/types.js";
export const channel = "tiktok-playground";
export function targetOrigin(url: string): string {
  const parsed = new URL(url);
  return parsed.protocol === "file:" || parsed.origin === "null" ? "*" : parsed.origin;
}
export function validPacket(value: unknown, session: string): value is Record<string, any> {
  if (!value || typeof value !== "object" || !session) return false;
  const p = value as Record<string, unknown>;
  try { if (JSON.stringify(p).length > 65536) return false; } catch { return false; }
  if (p.channel !== channel || p.session !== session || p.version !== 1) return false;
  if (p.action === "updated") return Object.keys(p).length === 4;
  if (p.action === "loaded") return Object.keys(p).length === 4;
  if (p.action === "ready") return Object.keys(p).length === 4 || (Object.keys(p).length === 5 && (p.supported === null || (Array.isArray(p.supported) && p.supported.length <= 5 && p.supported.every(t => ["gift", "chat", "like", "follow", "roomUser"].includes(t)))));
  if (p.action === "settings") return typeof p.animation === "boolean" && typeof p.sound === "boolean" && (p.config === undefined || validPreviewConfig(p.config));
  if (p.action === "error") return typeof p.message === "string" && p.message.length <= 512;
  if (p.action !== "event") return false;
  const e = p.event as TikTokEvent;
  return !!e && e.version === 1 && e.synthetic === true &&
    ["gift", "chat", "like", "follow", "roomUser"].includes(e.type) &&
    typeof e.messageId === "string" && typeof e.room === "string" &&
    typeof e.method === "string" && typeof e.receivedTimestamp === "string" &&
    e.isHistory === false && !!e.data && typeof e.data === "object" && !Array.isArray(e.data) && validData(e);
}
function validData(e: TikTokEvent): boolean {
  const d = e.data as Record<string, any>;
  const uint = (v: unknown) => typeof v === "string" && /^\d{1,20}$/.test(v) && BigInt(v) <= 18446744073709551615n;
  if (e.type !== "roomUser" && (!d.user || typeof d.user !== "object" || !uint(d.user.id) || typeof d.user.nickname !== "string")) return false;
  if (e.type === "gift") return uint(d.gift_id) && uint(d.repeat_count) && uint(d.combo_count) && typeof d.group_id === "string" && typeof d.gift_name === "string" && typeof d.repeat_end === "boolean";
  if (e.type === "like") return uint(d.count) && uint(d.total);
  if (e.type === "roomUser") return uint(d.total);
  return e.type !== "chat" || typeof d.comment === "string";
}

export function validPreviewConfig(value: unknown): value is Record<string, unknown> {
 if (!value || typeof value !== "object" || Array.isArray(value)) return false;
 const text=JSON.stringify(value); if (text.length>32768) return false;
 return Object.entries(value).every(([key,v]) => !/secret|token|cookie|session|credential|password|signing|__proto__|constructor|prototype|customHtml|editableHtml|^id$|^template$/i.test(key) && (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || (Array.isArray(v) && v.every(x=>typeof x === "string"))));
}
