export const CONTRACT_VERSION = 1 as const;
export interface TikTokUser { id?: string; nickname?: string; unique_id?: string; avatar_url?: string; sec_uid?: string }
export interface ChatData { user: TikTokUser; comment: string }
export interface GiftData { user: TikTokUser; gift_id: string; gift_name: string; repeat_count: string; combo_count?: string; group_id: string; repeat_end: boolean; diamond_count?: string; gift_image_url?: string }
export interface TikTokEvent<T = Record<string, unknown>> { version: 1; type: string; room?: string; method?: string; messageId?: string; isHistory?: boolean; sourceTimestamp?: string|null; sourceTimestampUnit?: 'server-defined'; receivedTimestamp?: string; data: T; native?: Record<string,unknown>; rawPayload?: string; synthetic?: boolean }
export interface EventMap {chat:ChatData;gift:GiftData;like:{count:string;total:string;user?:TikTokUser};roomUser:{total:string};state:{state:string;username?:string;error?:string};follow:{user:TikTokUser};[key:string]:unknown}


/** One typed DOM subscription. Generic+typed delivery never duplicates a subscription. */
export function onTikTokEvent<K extends keyof EventMap & string>(type:K,callback:(event:TikTokEvent<EventMap[K]>)=>void,target:Window=window):()=>void {
 const channel=type==='*'?'tiktok:event':`tiktok:${type}`;
 const listener=(event:Event)=>{const payload=(event as CustomEvent).detail;if(payload?.version===1 && (type==='*'||payload.type===type))callback(payload);};
 target.addEventListener(channel,listener);return ()=>target.removeEventListener(channel,listener);
}
