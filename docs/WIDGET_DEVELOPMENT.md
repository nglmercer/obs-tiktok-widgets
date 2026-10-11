# Widget development

Any loaded OBS Browser Source can use DOM events directly, regardless of whether this plugin created it:

```html
<pre id="out"></pre>
<script>
window.addEventListener('tiktok:chat', event => {
  document.getElementById('out').textContent = event.detail.data.comment;
});
</script>
```

All sources share the same native TikTok transport. No imports, tokens, cookies, signing configuration or networking are required. `event.detail` is an object. Use textContent for untrusted text and safe URL protocols for avatars/artwork. Never put TikTok names/comments into innerHTML. Do not trust third-party widget code with local files; install custom HTML only from authors you trust.

Optional SDK ES module: `data/web/sdk/tiktok-obs.mjs`. Plain script bundle: `data/web/sdk/tiktok-obs.js`, exposing `TikTokOBSSDK.TikTokOBS`. Types and declarations are in `web/sdk` and `data/web/sdk/esm`.

```js
import { TikTokOBS } from './tiktok-obs.mjs';
const remove = TikTokOBS.on('gift', envelope => console.log(envelope.data));
TikTokOBS.once('chat', envelope => console.log(envelope.data.comment));
const removeAny = TikTokOBS.onAny(envelope => console.log(envelope.type));
remove();
removeAny();
// off(type, sameCallback), getLastState(), and destroy() are also available.
```

React: subscribe in useEffect and return the unsubscribe function. Vue: subscribe in onMounted and unsubscribe in onUnmounted. `destroy()` affects only that SDK instance's listeners; it cannot stop the plugin or another widget. For multiple independently managed SDK lifetimes, instantiate TikTokOBSClient. `getLastState()` is null until the first state snapshot after subscription.

Built-in templates read `window.TikTokWidgetConfig` from generated `config.js`, unique per UUID. This file contains visual settings only. Custom templates are local HTML copied into the generated directory; an injected base URL preserves original relative resources. Custom templates can access their visual config through the same global. Custom HTML and CSS are trusted user code, unlike TikTok event strings.

Open a built-in page with `?preview=1` to display an explicit fixture button in any ordinary browser. It dispatches chat, gift, like, follow, viewer and unknown fixtures locally. The dock's generator uses the native normalization envelope and dispatch queue; it never starts network transport. `web/examples/custom.html` is a minimal SDK-free subscription example.

An iframe can optionally receive events forwarded explicitly by its parent with postMessage and strict origin checks. postMessage is not a bus across separate OBS Browser Sources.

## Edit local HTML externally

Select a widget, then choose **More actions → Open editable HTML folder**. The plugin creates a per-widget `editable` folder containing `index.html`, `widget.js`, and `widget.css`, and uses that HTML as the widget source. Open those files in your preferred editor, save, then choose **Reload edited HTML**. The editable files survive settings changes and OBS restarts. `config.js` is generated automatically; change settings through Edit widget instead of editing that file. Browser preview uses fixtures; real DOM events require an OBS Browser Source. Deleting the widget removes its per-widget folder.
