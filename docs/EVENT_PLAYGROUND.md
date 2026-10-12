# Event Playground

Select a widget in **Docks → TikTok LIVE Widgets → Widgets**, then choose **More actions → Open Event Playground**. The system browser opens a local file; no server or new TikTok connection is required. Gift widgets immediately show **Viewer123 · Rose × 23 ✓** using the same `widget.js` and `widget.css` shipped to Browser Sources.

Choose an event, edit the viewer and gift, then use **Replay**. Enable the cumulative streak for 1 → 5 → 23 (or your selected positive uint64 total; small totals use distinct increasing checkpoints). All streak messages share one group ID; every message has its own message ID. Repetitions create new groups. Interval and speed control delivery timing. **Stop** cancels remaining events. **Reset** stops delivery, clears history and JSON, and reloads the preview renderer; controls retain their current values and Replay remains available. Animation and sound switches affect only this preview; sound uses the widget's configured sound URL and browser playback permissions.

Timeline entries select JSON for inspection and copying. History is bounded to 200 events. Clipboard copy uses the browser API, with a selection-based fallback for local-file browser policies. Event fields render as text. Numeric identifiers and counts remain decimal strings; validation uses BigInt, including unsigned 64-bit IDs. The default completed event uses contract version 1, `WebcastGiftMessage`, `synthetic: true`, `repeat_count: "23"`, and `repeat_end: true`.

## Isolation and compatibility

`WidgetManager::materializePlayground` writes under `playground/<existing-widget-uuid>/`, separate from `widgets/<uuid>/` and `widgets.json`. It does not save settings, refresh/add/remove sources, invoke the dispatcher, or broadcast through the OBS bridge. Editable/custom source HTML and original configuration files are preserved. Existing **Preview widget** fixture mode remains available.

The host page sends local messages only to its preview frame; the frame verifies the sender and synthetic v1 envelope and emits `tiktok:event` followed by `tiktok:<type>` DOM CustomEvents. The ordinary system browser has no OBS plugin bridge. Frame permissions allow scripts and original local assets, including relative custom HTML assets. Custom HTML/CSS/JavaScript is trusted user-authored code, as it is in the existing widget workflow; this is not a security sandbox for executing hostile custom programs. Usernames, gift names, and event JSON use text nodes, never HTML interpolation.

All templates retain their filters and render their own supported event types. A chat widget opened with the default gift event remains blank until Chat is selected; gift widgets show the default gift immediately. Custom pages should subscribe to the existing DOM contract. Animation/sound controls affect the bundled renderer; custom renderers determine their own handling of these settings. The legacy SDK remains compatible.

**Events → Broadcast synthetic events to OBS (integration test)** is a separate global action. It intentionally reaches production Browser Sources. Playground replay never uses that action.

## Development and checks

- `npm ci && npm run build && npm test`
- For the real file-based Chromium suite: `PLAYGROUND_BROWSER_EXECUTABLE=/path/to/chrome npm test`. Install a Chromium binary separately (for example `npx playwright install chromium`). Without the environment variable, this one browser suite reports skipped; the deterministic suites still run.
- `cmake --build build -j4 && ctest --test-dir build --output-on-failure`
- `cmake --install build --prefix /path/to/stage` packages `data/web/playground` with the existing asset installation rules.

The reusable TypeScript fixture factory, local event bus and cancellable scenario engine live in `web/playground/engine.ts`. The packaged application and engine are generated during `npm run build`; packaged renderer assets are copied from their source during the same build.

Before claiming production readiness, run OBS/CEF acceptance: select a real gift source, open the playground, confirm default/replay/streak/JSON/copy/stop/reset, monitor other Browser Sources for zero preview events, return to the scene, then restart OBS and confirm UUIDs, custom HTML, configuration and source paths remain unchanged. Test audible sound and custom local assets in supported system browsers. These checks cannot be replaced by a mock OBS vendor/source or headless browser.

## Document generation, assets, and lifecycle

The shared `HtmlBootstrap.hpp` utility inserts a marked, idempotent bootstrap at the beginning of the original head. Its tokenizer skips comments and script/style raw text and understands quoted `>` characters. If the head is omitted, it creates one after the original html opening tag or document prolog. The original DOCTYPE is retained; no standards-mode DOCTYPE is invented for a quirks-mode author document. Known config.js script elements are replaced by one escaped inline configuration before any renderer. Other HTML, CSS and scripts remain in order. Production and preview use the same injection utility. Only generated copies change; no author config.js is written beside external HTML.

Custom and editable documents retain their author directory through a head base URL. An existing authored base takes precedence. Nested stylesheets, scripts, fonts and images use browser URL resolution. Built-in preview audio uses the original production widget asset directory; custom audio uses the authored base. The renderer accepts file, HTTPS and HTTP audio URLs, rejects other protocols, and reports playback promise failures (including missing files and autoplay denial) in the playground status and console. This grants no new filesystem API or file server; explicit local URLs retain ordinary browser file-access policies. External asset directories are never copied. Editable duplication copies the editable HTML into a new widget directory while retaining its original resource base; generated config and previews remain independent.

Deletion validates canonical UUID spelling and rejects symlinked managed roots/targets before removing only the selected widgets/<uuid> and playground/<uuid>. Missing directories are harmless. Materialization replaces the same generated files on template changes, so no old renderer/config is retained. External author documents and resources remain untouched.

Parent states are loading → initializing → ready, with error and closed terminal states until Reset. Each navigation initiated by the parent has a new session in its query URL. Unexpected iframe reloads trigger a fresh parent navigation/session. loaded(session) permits one settings initialization; ready(session) enables Replay. Reset first cancels the scenario timer and invalidates the session, then loads a fresh document. Stop cancels pending delivery and initial automatic replay. A ten-second handshake timeout presents a retry message. Page closure clears timers. The frame also requires initialization before accepting events and closes on pagehide.

Both endpoints validate source WindowProxy, channel, session, version, action and payload. Preview events require synthetic:true, supported event types and typed data with uint64 decimal strings. Packets over 64 KiB are rejected. HTTP origins use a restricted postMessage target and matching received origin; file URLs explicitly use `*` because browser file origins vary and can be opaque. Source/session/contract checks remain mandatory for files. Ready reports built-in supported event types intersected with saved filters; unsupported combinations show an explanatory status. Custom templates keep their own renderer and event handling. Animation/sound updates are applied only after the frame validates settings.

The iframe sandbox with allow-scripts and allow-same-origin supports trusted local templates; it does not isolate hostile custom JavaScript. No cookie, credential, signing or OBS-secret payload is sent. Synthetic DOM events stay in the frame and no plugin dispatcher is called.

The Chromium integration suite now also runs native `build/widget-test` to generate real custom and built-in documents. Build native tests first, or set `PLAYGROUND_NATIVE_TEST` to the executable for another configured build directory. Tests cover standards mode, headless custom HTML, local image/CSS/JS resources, URL resolution and simulated audio promise failures. Audible output and actual autoplay policy still require manual browser/OBS checks.

## Template Engine v2 integration

Instance code now lives in `projects/<uuid>/src`, not the legacy editable generated folder. **Open widget project** opens that authoritative tree. Independent manifest templates share only the event runtime; they no longer need a central renderer switch. Both Browser Sources and Playground resolve the selected immutable release through the original stable `widgets/<uuid>/index.html` entry. A local script-pointer check requests a session reset after publication, without a server or cross-frame synthetic event dispatch. Saved edits become visible after explicit publish, or auto-publish while OBS's project watcher is running. Preview-only animation/sound settings remain separate from persisted settings. See [Template Engine v2](TEMPLATE_ENGINE_V2.md) and [widgetctl](WIDGETCTL.md).

## Responsive UI v4

The compact event-aware controls, shared theme/locale preferences, collapsible JSON inspector and bounded timeline are described in [Studio v4](UI_V4.md). The fixture engine and preview session protocol are unchanged. English/Spanish labels never modify event names or JSON payloads. Standalone file previews use only bundled assets and browser-local preferences; no Node or additional connection is required.
