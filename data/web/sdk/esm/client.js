export class TikTokOBSClient {
    constructor(target = window) {
        this.target = target;
        this.listeners = new Map();
        this.lastState = null;
        this.on('state', event => { this.lastState = event; });
    }
    on(type, callback) {
        const channel = type === '*' ? 'tiktok:event' : `tiktok:${type}`;
        let map = this.listeners.get(type);
        if (!map) {
            map = new Map();
            this.listeners.set(type, map);
        }
        if (!map.has(callback)) {
            const listener = (event) => { const e = event.detail; if (e?.version === 1)
                callback(e); };
            map.set(callback, listener);
            this.target.addEventListener(channel, listener);
        }
        return () => this.off(type, callback);
    }
    once(type, callback) { let remove = () => { }; remove = this.on(type, event => { remove(); callback(event); }); return remove; }
    off(type, callback) { const map = this.listeners.get(type), listener = map?.get(callback); if (listener) {
        this.target.removeEventListener(type === '*' ? 'tiktok:event' : `tiktok:${type}`, listener);
        map.delete(callback);
    } }
    onAny(callback) { return this.on('*', callback); }
    getLastState() { return this.lastState; }
    destroy() { for (const [type, map] of this.listeners)
        for (const callback of map.keys())
            this.off(type, callback); this.listeners.clear(); this.lastState = null; }
}
export const TikTokOBS = new TikTokOBSClient();
