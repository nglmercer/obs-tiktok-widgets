# Event Playground

Select a widget in **Docks → TikTok LIVE Widgets → Widgets**, then choose **More actions → Open Event Playground**. The system browser opens a local file; no server or new TikTok connection is required. Gift widgets immediately show **Viewer123 · Rose × 23 ✓** using the same `widget.js` and `widget.css` shipped to Browser Sources.

Choose an event, edit the viewer and gift, then use **Replay**. Enable the cumulative streak for 1 → 5 → 23 (or your selected total, minimum 5). All three messages share one group ID; every message has its own message ID. Repetitions create new groups. Interval and speed control delivery timing. **Stop** cancels remaining events. **Reset** stops delivery, clears history and JSON, and reloads the preview renderer; controls retain their current values and Replay remains available. Animation and sound switches affect only this preview; sound uses the widget's configured sound URL and browser playback permissions.

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
