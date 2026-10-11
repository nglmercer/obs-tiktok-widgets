import type { TikTokEvent, EventMap } from './types.js';
type Callback = (event: TikTokEvent<any>) => void;
export class TikTokOBSClient {
 private listeners = new Map<string, Map<Callback, EventListener>>();
 private lastState: TikTokEvent | null = null;
 constructor(private target: Window = window) { this.on('state', event => {this.lastState=event;}); }
 on<K extends keyof EventMap & string>(type:K, callback:(event:TikTokEvent<EventMap[K]>)=>void):()=>void {
  const channel=type==='*'?'tiktok:event':`tiktok:${type}`;
  let map=this.listeners.get(type);if(!map){map=new Map();this.listeners.set(type,map);}
  if(!map.has(callback)){const listener:EventListener=(event)=>{const e=(event as CustomEvent).detail;if(e?.version===1)callback(e);};map.set(callback,listener);this.target.addEventListener(channel,listener);}
  return ()=>this.off(type,callback);
 }
 once<K extends keyof EventMap & string>(type:K,callback:(event:TikTokEvent<EventMap[K]>)=>void):()=>void {let remove=()=>{};remove=this.on(type,event=>{remove();callback(event);});return remove;}
 off(type:string,callback:Callback):void {const map=this.listeners.get(type),listener=map?.get(callback);if(listener){this.target.removeEventListener(type==='*'?'tiktok:event':`tiktok:${type}`,listener);map!.delete(callback);}}
 onAny(callback:Callback):()=>void{return this.on('*',callback);}
 getLastState():TikTokEvent|null{return this.lastState;}
 destroy():void{for(const [type,map] of this.listeners)for(const callback of map.keys())this.off(type,callback);this.listeners.clear();this.lastState=null;}
}
export const TikTokOBS = new TikTokOBSClient();
