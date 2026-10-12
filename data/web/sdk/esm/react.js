import { useEffect, useRef } from 'react';
import { onTikTokEvent } from './events.js';
export function useTikTokEvent(type, callback) { const latest = useRef(callback); latest.current = callback; useEffect(() => onTikTokEvent(type, event => latest.current(event)), [type]); }
