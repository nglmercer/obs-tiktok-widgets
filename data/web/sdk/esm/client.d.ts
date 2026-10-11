import type { TikTokEvent, EventMap } from './types.js';
type Callback = (event: TikTokEvent<any>) => void;
export declare class TikTokOBSClient {
    private target;
    private listeners;
    private lastState;
    constructor(target?: Window);
    on<K extends keyof EventMap & string>(type: K, callback: (event: TikTokEvent<EventMap[K]>) => void): () => void;
    once<K extends keyof EventMap & string>(type: K, callback: (event: TikTokEvent<EventMap[K]>) => void): () => void;
    off(type: string, callback: Callback): void;
    onAny(callback: Callback): () => void;
    getLastState(): TikTokEvent | null;
    destroy(): void;
}
export declare const TikTokOBS: TikTokOBSClient;
export {};
