// Compatibility aliases only. New manifests each ship one independent entry.
import {start as chat} from '../templates/chat.js';
import {start as gifts} from '../templates/gifts.js';
import {start as alerts} from '../templates/alerts.js';
import {start as likes} from '../templates/likes.js';
import {start as viewers} from '../templates/viewers.js';
import {start as events} from '../templates/events.js';
const aliases={'builtin.chat':'chat','builtin.gift-alert':'gifts','builtin.follow-alert':'alerts','builtin.likes':'likes','builtin.viewers':'viewers','builtin.events':'events'};
const type=window.TikTokWidgetConfig?.template||document.body.dataset.template;
({chat,gifts,alerts,likes,viewers,events})[aliases[type]||type]?.();
