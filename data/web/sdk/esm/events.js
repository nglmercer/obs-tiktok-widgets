/** One typed DOM subscription. Generic+typed delivery never duplicates a subscription. */
export function onTikTokEvent(type, callback, target = window) {
    const channel = type === '*' ? 'tiktok:event' : `tiktok:${type}`;
    const listener = (event) => { const payload = event.detail; if (payload?.version === 1 && (type === '*' || payload.type === type))
        callback(payload); };
    target.addEventListener(channel, listener);
    return () => target.removeEventListener(channel, listener);
}
