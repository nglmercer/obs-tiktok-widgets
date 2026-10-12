import type { EventMap, TikTokEvent } from './types.js';
export declare function useTikTokEvent<K extends keyof EventMap & string>(type: K, callback: (event: TikTokEvent<EventMap[K]>) => void): void;
