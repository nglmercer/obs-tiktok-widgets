# Executed validation and remaining acceptance checks

Development platform: CachyOS Linux x86_64, GCC 16.2.1, installed Qt6, OBS 32.2.2 SDK extracted into /tmp/widgets-obs-sdk (initial host build used the extracted SDK; the installed OBS Flatpak was subsequently detected), pinned Rust source at 886157c10350c7def971f782451462db72bc0007.

Executed successfully:

- `cargo build --release --locked -p ttl-live-native`: Rust native shared library.
- CMake configure and full native plugin compile/link using the extracted OBS SDK.
- CTest: four suites (events, connection-lifecycle, widget-config, bridge-api).
- Native event decode fixture with uint64 max ID; retained unknown data; FIFO, bounded queue, dedup and shutdown diagnostics; 10,000 enqueue/drain iterations.
- Connection manager concurrent requests and cancellation with a fake transport, asserting maximum one live client and zero after shutdown.
- Real upstream `cargo test --locked -p ttl-live-native`: four callback/lifecycle unit tests plus seven ABI/decoder fixture tests.
- TypeScript compiler and esbuild browser/ES module builds.
- Eight JavaScript checks: SDK subscription cleanup/state/version handling; all six renderers using a minimal deterministic DOM harness; safe text, independent filters, cumulative gift streaks, precise likes, viewer coalescing.
- CMake install staging and ZIP archive generation (see generated release artifact).

The bridge suite invokes the real obs-websocket API header through OBS proc handlers, validates CallVendorRequest and nested object event_data, generic/typed dispatch, response freeing, and explicit missing integration failure. The vendor callback is mocked. This is not a real obs-browser/CEF integration test.

Still incomplete:

- Launch OBS with the installed dock and native library on a desktop.
- Disable the network WebSocket server; verify the real obs-browser vendor probe succeeds.
- Add at least two Browser Sources plus a custom HTML source; generate fixture events and verify parsed event.detail on generic and typed subscriptions across all three.
- Verify widget changes refresh real browser pages, source duplication/deletion, scene switching, and full OBS restart restoration.
- Verify a real public TikTok LIVE room using guest bootstrap and optional account session.
- Verify follow display keys and gift streak artwork/sound against live traffic.
- Measure real OBS responsiveness, sustained event delivery latency/overflow and resource growth across repeated connection cycles. Current queue stress is deterministic correctness work, not a full production load/leak benchmark.
- Execute Windows/macOS workflows and inspect installed DLL/dylib resolution; sign/notarize macOS releases.

These are release gates. No live TikTok or real multi-source CEF success is claimed. CI definitions alone are not evidence of a platform build.

## Current OBS Flatpak installation

Rebuilt against the installed com.obsproject.Studio 32.2.2 `/app` libraries using Freedesktop SDK 25.08, GCC 15.2 and the Rust SDK extension. All four C++ suites passed inside that SDK; bridge-api required explicit X11 socket access for libobs startup on this Wayland desktop. Installed both native libraries and packaged assets under `~/.var/app/com.obsproject.Studio/config/obs-studio/plugins/obs-tiktok-widgets/`. Immediate RTLD_NOW dynamic loading passed in the normal application runtime; the pinned native ABI reports version 1, and libttl_live.so resolves beside the plugin using `$ORIGIN`. OBS was not launched or interrupted. Real dock/CEF/live-room acceptance checks above remain pending. Reproduce using `tools/install-flatpak.sh`.

## Simplified dock update

The Flatpak SDK build passed all six CTest suites, including offline automatic-download/cache/checksum/redirect/size/cancellation fixtures and offscreen Qt dock tests. All three tabs rendered successfully. Test processes explicitly use `/app/lib` and `/app/lib/qt/plugins` to avoid incompatible Qt files supplied by another installed plugin. Installation replaces files atomically while OBS remains running; the update requires an OBS restart. Real live-room and CEF acceptance checks remain unverified for this update.

The event selector and JSON tree update passed all six CTest suites in the Flatpak SDK. Dock tests verify selected-type generation, structured event fields, filtering existing records and the 200-event display bound. Updated installed plugin passed runtime loading; OBS restart is required.

The event-selector and widget-action update passed six CTest suites. Tests cover hiding state by default, retaining selectable state records, suppressing repeated monitor snapshots, and preserving external HTML edits after widget restoration. The installed plugin passed normal Flatpak runtime loading. Layout was reviewed using offscreen Qt renders; actual live/CEF delivery remains unverified.


## Event Playground (2026-10-11)

All four implementation phases are included in one change: fixture/scenario/local DOM bus; responsive controls with the real renderer; native dock action and separate preview materialization; security, persistence, regression tests, documentation and package checks.

Executed successfully on this Linux host:

- `npm ci`: locked dependencies installed; zero reported vulnerabilities. The host npm policy blocked esbuild's postinstall script, but the platform binary was available and all esbuild invocations succeeded.
- `npm run build`: existing SDK, TypeScript playground checks, application/frame bundles and reusable scenario module; source renderer/CSS copied into packaged assets.
- `PLAYGROUND_BROWSER_EXECUTABLE=/home/meme/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test`: **16/16 passed**, including an actual file-based headless Chromium preview. Checked automatic Viewer123 ×23 Rose, cumulative 1 → 5 → 23, generic-before-typed DOM ordering, replay, cancellation, reset, clipboard copy, HTML injection as safe text, animation control, narrow viewport and zero preview events on the host window.
- Deterministic tests cover v1/method/synthetic/default fields, uint64 precision, unique message/group IDs, cumulative totals, repeated scenarios, reentrant cancellation, sender validation, packaged/source parity and all existing renderer/SDK regressions.
- `cmake --build build -j4`: full plugin and test executables built against the existing host OBS SDK/Qt configuration.
- `ctest --test-dir build --output-on-failure`: **7/7 passed**. New source-persistence suite uses real libobs serialization/restoration with a **mock** browser source, verifies no changed source settings and retains UUID/local-file settings. Widget tests verify separate playground assets, all six built-in templates, preserved editable HTML/config and unchanged widgets.json. Dock tests verify the new action and separately labeled global broadcasting.
- `cmake --install build --prefix /tmp/obs-playground-stage`: staging passed.
- `cpack --config build/CPackConfig.cmake -B /tmp/obs-playground-package`: Linux ZIP generated under the project's configured release directory. Verified all eight playground assets in the archive byte-for-byte against the current build.
- Headless Chromium screenshot reviewed: dark controls, real gift card, JSON inspector and timeline render correctly.

The browser suite is opt-in through `PLAYGROUND_BROWSER_EXECUTABLE`; plain `npm test` reports that one suite skipped when no executable is configured. No external server is used by the browser test or playground.

Not completed: real OBS/CEF scene isolation and restart checks, audible playback, live TikTok traffic, Firefox/system-browser compatibility, Windows/macOS builds. OBS was not restarted, installed plugins were not replaced and user scenes were not edited. Mock source/bridge tests and Chromium preview are not real OBS/CEF validation; production readiness is **not claimed**. See [Event Playground acceptance steps](EVENT_PLAYGROUND.md).
