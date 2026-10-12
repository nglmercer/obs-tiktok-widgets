import type { EventMap, TikTokEvent } from './types.js';
/** One typed DOM subscription. Generic+typed delivery never duplicates a subscription. */
export declare function onTikTokEvent<K extends keyof EventMap & string>(type: K, callback: (event: TikTokEvent<EventMap[K]>) => void, target?: Window): () => void;
