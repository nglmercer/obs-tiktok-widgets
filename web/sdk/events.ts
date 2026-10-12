import type { EventMap,TikTokEvent } from './types.js';
/** One typed DOM subscription. Generic+typed delivery never duplicates a subscription. */
export function onTikTokEvent<K extends keyof EventMap & string>(type:K,callback:(event:TikTokEvent<EventMap[K]>)=>void,target:Window=window):()=>void {
 const channel=type==='*'?'tiktok:event':`tiktok:${type}`;
 const listener=(event:Event)=>{const payload=(event as CustomEvent).detail;if(payload?.version===1 && (type==='*'||payload.type===type))callback(payload);};
 target.addEventListener(channel,listener);return ()=>target.removeEventListener(channel,listener);
}
