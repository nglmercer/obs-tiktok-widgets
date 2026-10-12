import {useEffect,useRef} from 'react';
import {onTikTokEvent} from '@obs-tiktok/widgets-sdk';
import type {EventMap,TikTokEvent} from '@obs-tiktok/widgets-sdk';
export function useTikTokEvent<K extends keyof EventMap & string>(type:K,callback:(event:TikTokEvent<EventMap[K]>)=>void){const latest=useRef(callback);latest.current=callback;useEffect(()=>onTikTokEvent(type,event=>latest.current(event)),[type]);}
