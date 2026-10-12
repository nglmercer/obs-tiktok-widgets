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

## PR #1 corrections (2026-10-11)

Validated against fetched branch head `6baa414` before applying corrections on `feat/event-playground`.

- `npm ci` and `npm run build` passed. Locked dependency audit reported zero vulnerabilities; esbuild's blocked postinstall did not prevent the installed binary from building assets.
- `PLAYGROUND_BROWSER_EXECUTABLE=/home/meme/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test`: **20/20 passed**, including three real Chromium suites. Native-generated documents retain CSS1Compat and DOCTYPE with a missing head; original custom files stay unchanged; local images, nested CSS/JS and real WAV metadata load; missing audio emits a resource error. Audio URL/protocol and autoplay-error reporting use a controlled Audio stub; audible output is not claimed.
- Regression checks cover unfinished/completed and small uint64 cumulative streaks, unique replay groups, concurrent engines, timer cancellation, delayed initialization, stale loaded/ready/event rejection, rapid Reset, unexpected iframe reload, source/session/payload validation, safe text, animation, clipboard, responsive layout and local event isolation.
- Native `cmake --build build -j4` passed using the existing configured Linux build. `ctest --test-dir build --output-on-failure`: **7/7 passed**, including production source serialization/persistence, generated-path stability, preview cleanup, unrelated-widget/external-file preservation, UUID traversal rejection, symlink deletion protection and independent duplicate editable HTML.
- CMake staging to `/tmp/obs-playground-fixes-stage` and Linux CPack ZIP packaging passed. Packaged playground assets were compared byte-for-byte with `data/web/playground`; generated web assets remain tracked alongside sources.

No OBS GUI acceptance workflow, real CEF multi-source monitoring, OBS restart, audible playback, live TikTok connection, other browser engine, Windows or macOS run was performed. This environment supplies Linux native libraries and headless Chromium; automated libobs tests use a mock Browser Source. These results do not establish the complete manual OBS Definition of Done. Custom templates remain trusted programs, may implement their own settings/event handling, and remain subject to browser local-file/autoplay policy. Malformed HTML beyond supported document/prolog/head structures is not repaired by a full HTML parser.

## Template Engine v2 (2026-10-11)

Implemented and checked on `feat/event-playground`, against open PR #1. Earlier sections describe earlier builds; this section supersedes their unperformed OBS checks for the specific disposable-profile workflow below.

- `npm ci`, `npm run build`, `npm run format:check` and `node tools/check-generated.mjs` passed. Zero dependency audit findings; 83 generated assets match deterministic regeneration. esbuild's blocked install script did not prevent its available binary from building.
- `PLAYGROUND_BROWSER_EXECUTABLE=/home/meme/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test`: **23/23 passed, zero skips**, including three real Chromium suites, all offline CLI commands, package safety, source persistence, standards mode, relative resources, uint64 gift scenarios and preview sessions.
- Native Linux build and **7/7 CTest** passed earlier in this implementation session. After the environment restarted, the temporary `/tmp/widgets-obs-sdk` disappeared, so the final host rebuild could not configure LibObs. This is an environment dependency failure, not recorded as a passing rerun.
- Final OBS Flatpak SDK build (`cmake --build build_flatpak -j2`), **7/7 CTest**, CMake staging and CPack ZIP passed. Use `flatpak run --devel --socket=x11 --env=LD_LIBRARY_PATH=/app/lib --env=QT_PLUGIN_PATH=/app/lib/qt/plugins ...`: inherited third-party Qt libraries and lack of an X display caused the first rerun to fail; the corrected runtime environment passed. Earlier simultaneous four-job builds exhausted memory; two jobs succeeded.
- ZIP inspection verified every one of the 83 packaged web files byte-for-byte against `data/web`, plus installed `widgetctl`, wrapper and skill. Skill frontmatter/reference validation passed.
- **Actual OBS 32.2.2 + Browser/CEF**, in a disposable config profile: two sources referencing one project and a third unrelated source. `tests/widgets/obs-cef-acceptance.py` passed atomic-save CRLF HTML, CSS and JS edits: both matching sources changed, unrelated source did not. Invalid CSS preserved the served CEF display; subsequent valid save recovered. All configured UUIDs and legacy local-file paths remained unchanged. Screenshots under `docs/validation/template-v2` show authored text, CSS and `CSS1Compat`.
- Reinstalling plugin assets and restarting this disposable OBS profile restored all three sources with the same UUIDs and original paths; switching to another scene and back passed. Real Chromium opened that selected project's isolated preview, displayed synthetic gift 23, replayed and reset; before/after captures of all three actual production CEF sources were identical. No live TikTok connection was required.

Migration fixture tests cover legacy built-ins, edited config/scripts, custom/editable relative graphs, backups, rollback, unchanged external files, unknown/missing packages and failures retaining original output. Author projects and history are retained on deletion; generated preview cleanup is bounded to validated UUID paths. Migration of the user's normal OBS profile has **not** been exercised; it occurs at next plugin startup with backups and diagnostics. Plugin installation replaces packaged files only.

Remaining validation/implementation limits: Windows/macOS and non-Chromium browsers were not run on this Linux host; live TikTok traffic, audible playback/autoplay acceptance, actual disk-full failure and the complete manual gift-widget workflow were not run. C++-only installations lack full JavaScript syntax validation without optional Node; CSS validation is lexical, not a complete standards parser. Resource discovery handles static references, not arbitrary dynamically computed URLs. JSON Schema/UI supports the documented subset, not every schema keyword. TypeScript/dependency compilation requires external tooling and precompiled output. Custom templates are trusted programs. History/releases are retained conservatively; no automatic history garbage collection is enabled. No optional MCP adapter was added. Mock OBS placement tests supplement, and do not replace, the actual CEF evidence above.

## Studio v3 and controlled widget builders (2026-10-12)

Starting branch/PR HEAD was `5bae64993e6cdd4ba97fa7fd1c6e3d39221449e0`; PR #1 remained open. This extends the existing project/domain/CLI/watch/publish system; no second TikTok connection or embedded QtWebEngine was added.

Executed on Linux:

- Locked `npm ci`: **zero audit vulnerabilities**. Initial chosen Vite/AJV versions had advisories; both were upgraded to pinned patched releases. esbuild/oxide install scripts were blocked by host policy, but the available platform binaries built successfully.
- `npm run build`, `npm run format:check`, and deterministic regeneration passed: **144 generated assets**. Studio shell is approximately 375 KB raw JS; CodeMirror is a separate lazy chunk of approximately 481 KB. AJV validators are generated at build time for shipped schemas, avoiding runtime eval under the Studio CSP.
- `WIDGETCTL=build_flatpak/widgetctl WIDGETSTUDIO=build_flatpak/widgetstudio WIDGET_BUILDER_TEST=1 PLAYGROUND_BROWSER_EXECUTABLE=/home/meme/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome npm test`: **25/25 passed, zero skips**. The opt-in builder test explicitly installed pinned tooling in disposable roots. Static regressions remain covered; TS and React were type-checked, compiled and opened with real file-based Chromium. Dynamic project imports were inlined and loaded; Viewer123 sends 23 Rose and cumulative streak remains 23. Source bytes remained unchanged, root imported assets were retained, modified policy locks/unsupported modes/protocols/missing Node failed clearly, type diagnostics referenced original files, and an external save cancelled obsolete compilation without replacing the pointer.
- Real Studio browser tests exercised cards/search, split workspace, syntax editing, drafts, external-change compare/merge and revision conflict, appearance/color controls, file-operation checkpoint Undo/Redo, mobile vertical panels, every rendered action's accessible label/title and hover/keyboard-focus tooltip (including disabled wrappers). Authentication, foreign Origin, forbidden methods, traversal and OBS_OFFLINE were checked. [Workspace screenshot](studio/workspace.png).
- OBS Flatpak SDK build at two jobs and **7/7 CTest** passed after final native changes. Existing source-persistence, bridge, dock, widget, event and connection tests remain included. CMake install and CPack ZIP passed. Archive inspection matched all 144 web files byte-for-byte and verified widgetstudio and Studio docs. Linux host-only rebuild remains unavailable without the temporary extracted LibObs SDK noted in the preceding section; Windows/macOS runners were not executed locally.
- **Real OBS 32.2.2 / CEF**, disposable profile: published vanilla TS (including a dynamic import) and React artifacts loaded. Two sources shared one TS instance; changing/publishing its CSS refreshed those two sources while the React source and an unrelated source remained unchanged. Scene switching retained identities/paths. Reinstall/restart restored all six sources (three existing static sources plus the three framework references) with original UUID/local-file paths. Authored TS dynamic text/style and React rendering remained operational. [TS CEF capture](studio/cef-typescript-0.png), [React CEF capture](studio/cef-react-2.png). Pixel identity across restart was not claimed because the existing explicit integration broadcast can change transient event text; source identity, paths and authored output were checked separately.
- After restart, file-based TS and React Playground previews displayed Rose ×23; before/after captures of **all six actual production CEF sources were unchanged**. [TS preview](studio/preview-typescript-vanilla.png), [React preview](studio/preview-react-typescript.png). The v1 generic/typed bridge and precision/cumulative tests remained passing.
- Final assets/binaries installed atomically into the normal OBS Flatpak plugin directory. Normal author projects/configuration were not edited by installation; restart loads the plugin. All acceptance scene manipulations used the disposable profile.

Scope/remaining limits: system Chromium and Linux Flatpak/CEF were executed; Windows/macOS, Firefox/Safari, audible playback, live TikTok traffic and the complete manual native dock/launcher workflow were not. No hostile compiler OS sandbox, forced disk-full/OOM or isolated-network-namespace build test was performed; the runner is constrained/least-privilege, builds do not install/fetch packages, and import/policy checks reject unapproved inputs. Dependencies remain trusted executable code. Framework auto-build needs Node in the watcher/Studio process; OBS without it can render already-published bundles and observe externally published releases. Compiler diagnostics are displayed as original-file text, not full language-server diagnostics. Visual editing is declared-property/component inspection; arbitrary HTML/JSX round-trip, drag/drop, embedded OBS Studio dock, multi-user roles and an unrestricted framework/plugin ecosystem are not implemented or advertised. Custom schemas use the documented inspector/backend subset; shipped schemas additionally use precompiled AJV. Live Events is isolated samples, not a second production subscription. File-operation Undo/Redo restores the most recent checkpoint and rejects a changed revision; CodeMirror provides multi-step draft undo. Browser uploads are bounded; larger imports use widgetctl. These limits do not constitute full general-purpose design-canvas or cross-platform production-readiness certification.


## 2026-10-12: zero-toolchain installed workflow

Installed template packages now contain seven plain HTML/CSS/JavaScript templates. TypeScript/React starter sources remain development fixtures and are not shipped. Studio hides framework templates, the shared service rejects new framework instances, and `builders install` returns `DEVELOPMENT_ONLY` without downloading dependencies. Existing source projects and published releases are preserved.

`npm run build` passed; deterministic generated-asset verification passed (126 files); formatting passed. Linux Flatpak SDK native build and all eight CTest cases passed with X11 access (the first invocation lacked X11 and failed two OBS graphics tests; rerunning with the required socket passed). CMake staging and CPack Linux ZIP creation passed. No Windows/macOS or new live OBS acceptance was performed for this policy change.

Earlier Studio fixes were exercised in a disposable OBS/CEF profile, including matching-source refresh, unrelated-source isolation, last-known-good retention and restart persistence. That evidence predates removal of framework user authoring and does not establish the full manual acceptance scenario for the final package.

Final JavaScript/real Chromium regression run: 28 tests, 27 passed, zero failures, one legacy framework compiler test skipped. Static Studio browser coverage includes external-save refresh, recovered dirty drafts, revision conflicts, accessible controls and file operations.


## UI/UX v4 — 2026-10-12

Starting PR #1 HEAD: `de6c12189a4a509d7f87e3c1fb431137afe4dd7f`. These results supersede earlier UI/policy results for this revision; historical framework tests above do not describe installed-user requirements. Installed projects remain plain HTML/CSS/JavaScript and require no Node. Existing framework source and working releases are retained.

Executed on Linux:

- `npm ci`, `npm run build`, `npm run format:check`, `npm run locales:check` and deterministic generated-asset verification passed. **131 generated files** match source regeneration; **406 English/Spanish keys** have matching placeholders and static UI lookups. Packaged native TS catalogs match the web source catalogs, and Qt `lrelease` compiled both `.qm` files. The authoring skill validator passed.
- JavaScript + real Chromium: **31 tests passed, zero failures and zero skips**, with `PLAYGROUND_NATIVE_TEST=build_flatpak/widget-test`, `WIDGETCTL=build_flatpak/widgetctl`, `WIDGETSTUDIO=build_flatpak/widgetstudio` and the installed Chromium executable. Coverage includes source/revision/draft conflicts, dirty recovery, file/code Undo/Redo, schema inspector, locale-safe enum values, action hover/focus accessibility, keyboard menus, secure adapter preferences, published-preview initialization, gift/reset/session isolation, CLI/package/migration regressions and actual declared-component pointer drag/resize/nudge/checkpoint Undo. The obsolete installed-user framework compiler test was removed because installation/new framework authoring is intentionally development-only, rather than being reported as a passing or skipped supported-user workflow.
- Studio and standalone file Playground were exercised at **320, 360, 390, 430, 768, 1024, 1280, 1440 and 1920px**, with no document horizontal overflow. English/Spanish, dark/light/system preferences, mobile panels, file search, reduced motion and a 640×450 viewport representing available space at 200% zoom were checked. This viewport test is not a claim of manual browser zoom acceptance. [Before/after and responsive screenshots](UI_V4.md#screenshots).
- Flatpak OBS SDK `cmake --build build_flatpak -j2` and `ctest --test-dir build_flatpak --output-on-failure`: **8/8 passed**, including real libobs source persistence/bridge tests and the offscreen Qt dock at 280px. Two jobs avoid this machine's four-job memory exhaustion. Native regression checks cover stable action IDs, runtime en/es switching, shared Studio preferences and accessible primary actions. [Spanish narrow dock](studio/v4/dock-spanish-280.png).
- CMake installation and Linux CPack ZIP packaging passed. Package contents include the native plugin/widgetctl/widgetstudio, compiled Studio/Playground, shared tokens, both native translations, plain built-ins, docs and skill. Web assets were compared byte-for-byte with the archive; no framework starter source is installed.

**Actual OBS 32.2.2 / CEF, disposable Flatpak profile only:** created a plain gift project and added two Browser Sources referencing its UUID. HTML/JS formatted with Prettier CRLF remained byte-identical after publication; CEF displayed authored content and `CSS1Compat`. An atomic CSS save/publication changed both matching source captures while an unrelated source (with an explicit reload counter) remained identical. A missing relative stylesheet rejected publication and retained the working stable loader; restoring the source recovered. Scene switching preserved all source IDs/paths. After reinstalling into this disposable profile and restarting OBS, all ten existing Browser Source identities/paths remained intact; both new matching captures were identical. The unrelated source's own counter advanced once for normal OBS startup, then remained unchanged. Authenticated Studio opened the selected published project, automatically initialized preview, performed isolated Replay/Reset and saved Spanish preferences. Before/after captures of the two matching sources and unrelated source were identical across preview actions and locale changes. OBS and its temporary Studio helper were shut down gracefully; normal user scenes/configuration were not edited. [Matching CEF source](studio/v4/cef-0.png), [second reference](studio/v4/cef-1.png), [unrelated reference](studio/v4/cef-2.png), [Studio with disposable OBS](studio/v4/studio-live-obs-es.png).

Unverified/limits: Windows/macOS packaging, Firefox/Safari, audible audio/autoplay playback, live TikTok traffic, and the complete manual 14-step native GUI workflow were not executed. The native narrow-dock screenshots/tests are offscreen Qt, not a manually resized live OBS dock. Real CEF edits/publish/restart were driven through the same native CLI/domain services; the browser Studio exercised preview/language in that profile, not every manual authoring step. Compiler/provider technical messages and user-authored schema/template text may remain literal; plugin UI surrounds them with localized labels. Custom HTML without `x-visual` bindings is code-only. Native appearance follows OBS's theme; web interface themes do not change widget settings. No author source or production user's files were rewritten by the UI build/package checks. This evidence does not claim cross-platform or full manual workflow completion.
