# Universal Widget System — implementation evidence

Implemented locally on Windows x64, 2026-10-20, in `obs-tiktok-widgets` and
`TikTools-app`. Protocol **1**, SDK **1.0.0**, universal manifest **3**, portable
project/preset **1**. Validation used no production credentials, LIVE connection
or modifications to an installed OBS profile. Registry publication and installing
the package into OBS have not been performed.

The [inventory](current-state.md) records the original architecture; the
[ADRs](universal-widget-adrs.md) explain the refinements to the proposed plan.
The [operating guide](../UNIVERSAL_WIDGETS.md) covers import, pairing, publishing,
permissions, errors, bridge configuration and migration.

## Phase delivery

Paths below are relative to OBS unless prefixed `TikTools:`. Generated assets in
`data/web` are built from `web`, never instance author files.

| Phase | Changed implementation | Verification | Compatibility and remaining limits |
|---|---|---|---|
| 1 — discovery/contracts | `docs/architecture/current-state.md`, `universal-widget-adrs.md`; `web/universal/tools/generate.mjs`, `schemas`, `fixtures`, `native.rs`; `src/universal/SchemaValidator.hpp`, `EventProtocol.hpp`; TikTools `src/universal` with SHA-256 vendor lock | Golden valid/invalid corpus consumed by JS, C++ and Rust; schema regeneration check; vendored byte/hash checks | Explicit `contract` discriminator avoids colliding with the pre-existing OBS v3 format. Draft-07 uses the documented common assertion vocabulary, not every JSON Schema extension. |
| 2 — runtime | `web/universal/index.js`, `layout.js`, `normalize.js`, `package-loader.js`, declarations; `web/templates/universal.gift-alert/1.0.0`; `TemplateRegistry.cpp`, `BrowserEventBridge.cpp`, `WidgetProjectService.cpp`; TikTools `src/widgets/sdk/UniversalWidgetPanel.vue` | Lifecycle ordering, cancellation/disposal during initialization, bounded pending work; same compiled package in both SDK hosts; native publication and isolated Playground rendering | Original Vue templates and OBS static runtime remain available. Portable packages contain trusted compiled JS. Unsupported capabilities/dependencies fail explicitly. |
| 3 — receiver | `src/universal/ExternalEventReceiver.{hpp,cpp}`, `EventProtocol.hpp`; `PluginLifecycle`, `EventDispatcher`; `TikTokDock` and en/es catalogs; `web/universal/tools/pair.mjs`, `publish.mjs` | Native HTTP/WS tests: auth, token hashes, expiry/revocation, Origins/Host, namespace permissions, size/rate/client/queue bounds, batch order, malformed frames, duplicate acknowledgments; separate CLI/native-receiver/browser integration | Disabled by default, numeric loopback only, configurable 17453. Native pairing/rotation/revocation needs no Node. Administration stays local; no event route invokes scene or project commands. Real OBS/CEF playback remains untested. |
| 4 — optional bridge | TikTools `examples/event-gateway-process-plugin/src/gateway/obs_bridge.rs`, `config.rs`, `state.rs`, `server.rs`, `mod.rs`, `plugin.json`, Cargo files; common `transport.js` | 30 gateway Rust tests, Clippy; actual gateway executable → actual C++ receiver → Chromium; retries preserve IDs, negotiated types filter irrelevant events, gateway stop leaves separate CLI publishing functional | Reuses the existing gateway on 17452. Opt-in outbound adapter, 256 pending entries, bounded backoff, token from process environment. Best effort after enqueue; no durable replay. |
| 5 — editor | Common `editor.js`, `editor-ui.js`, `editor.d.ts`; React `UniversalPanel.tsx`, navigation/controller integration; TikTools Vue wrapper and shared history adapter; `widgets.portable.get/set` in native project/command/CLI/Studio services | Canonical project and preset round trips; settings and editor-schema controls, grid serialization, hierarchy, transforms, history, revision conflicts; Chromium export/import matches layer bounds at 320/768/1440 px | Adds a portable panel inside the existing editors. Save to an OBS instance is explicit, revision guarded and separate from publication. Layouts reference the exact package id/version; assets travel with that package. |
| 6 — compatibility | Manifest discriminator/opt-in migrator, plain-settings preset adapter, native/canonical channel adapters; preview event mapping; gallery optional metadata fix; existing project migrations preserved | Legacy renderer/gift/count/uint64 tests; native-first and bridge-first dedup with legacy delivery retained; source/settings/revision/migration/rollback tests; legacy Studio and Playground browser suite | Existing seven built-in templates retain their engines. The new universal starter is additive. Legacy conversions surface warnings. Canonical/external events target universal subscribers; legacy `tiktok:*` remains native. No forced source conversion. |
| 7 — verification/release | `tests/universal`, extended native/browser tests, CI workflows, docs, locale bundles; deterministic build checks; local npm SDK tarball and CPack ZIP | Native plugin/CLI/helper Release build; CTest; JS/Bun/Rust suites; browser integration; schema, locale, formatter, vendor and generated-asset checks | Local artifacts are reviewable release candidates. Remote publication, signing/installation and real OBS/CEF/LIVE acceptance are separate actions and have not been claimed. |

The regression run also exposed an existing publication race: QSaveFile's
temporary siblings could enter a concurrent source scan, and a watcher could
schedule its own newly committed revision twice. `ProjectIO.cpp` serializes
in-process atomic writes against enumeration; `WidgetProjectWatcher.cpp` clears
only a dirty revision matching the completed build. Repeated watcher tests cover
one debounced publication, invalid-source retention and recovery. Other editors'
external writes still use normal revision checks and watcher retry behavior.
Windows harness fixes use proper file URLs, explicit browser locales, semantic
clipboard comparison and preserve Qt DLL discovery when testing without Node.
The optional development formatter invokes npm's JS entry directly on Windows.
Generated Studio HTML is normalized to LF for reproducible packaging.
CPack normalizes the Windows install prefix before serializing its configuration.

## Supported capabilities and migration matrix

| Feature | OBS universal host | TikTools universal host | Existing widgets |
|---|---|---|---|
| `events.subscribe` | Native canonical events plus authorized external events through obs-browser | Existing `live.event` adapter, optional live subscription | Original event channels retained |
| `assets.read` | Package-relative static assets | Embedded local package assets in contained preview | Existing app asset behavior retained |
| `settings.read` | Published bootstrap and local preview updates | Validated package/project settings | Existing inspectors retained |
| `preview.inject` | Session/source/origin-validated local preview only | Selected portable preview only | Existing synthetic fixtures retained |
| Layout / presets | Text, image, group, hierarchy, transforms, settings, editor grid, canonical JSON | Same model and command semantics | No arbitrary HTML/JSX-to-layer conversion |
| Timeline | Validated metadata preserved on round trip | Same | Existing animation engines remain responsible for playback |
| Host administration / filesystem / arbitrary networking | No universal capability granted | No universal capability granted | No new authority granted by an event payload |
| Dependencies / remote modules | Must be bundled before import | Same | Existing pinned templates unaffected |

Native/bridge duplicate identity is normalized type + upstream room/message ID.
Native legacy listeners still receive the native event if the bridge arrived
first; canonical listeners see one event. Missing/zero upstream identity falls
back to producer IDs and cannot guarantee cross-producer equivalence. Gift
counts remain cumulative decimal strings and are never summed as deltas.

## Evidence and reproduction

Verified on this checkout:

- OBS SDK: 13 contract/runtime/editor/transport tests.
- TikTools frontend: 774 tests across 104 files; lint, Vue/TS typecheck and
  production build.
- Optional Rust gateway: 30 tests, debug executable build, Clippy with warnings
  denied; schema fixtures loaded from its vendored SDK.
- Native OBS: complete MSVC Release build, 9 CTest targets, including the actual
  receiver, project publishing/migrations, dispatcher, mock obs-browser bridge,
  native connection lifecycle, source persistence and 280 px Qt dock.
- Three universal Chromium integrations: native published preview; cross-SDK
  package safety/portability; separate publisher and Rust gateway through the
  native receiver with one canonical delivery and continued CLI use after stop.
- Existing suite: 31 tests passed without skips, covering Studio accessibility, revision/draft conflicts,
  settings/assets/audio controls, en/es, themes, responsive layouts and gestures.
- The watcher/project test passed twice more after the atomic-save race fix.
- Generated contracts, 417 locale keys/placeholders, vendored hashes, formatting
  and 138 generated web assets checked for consistency.

JavaScript checks:

```sh
# obs-tiktok-widgets
npm ci
npm run build
npm run contracts:check
npm run test:universal
npm run format:check
npm run locales:check
node tools/check-generated.mjs
node web/universal/tools/sync.mjs --check  # sibling checkout for comparison

# TikTools-app (independent after vendoring)
bun ci
bun run universal:check
bun run check:web
cargo test --manifest-path examples/event-gateway-process-plugin/Cargo.toml --locked
cargo clippy --manifest-path examples/event-gateway-process-plugin/Cargo.toml --locked -- -D warnings
```

Build OBS with the repository's normal platform preset. This machine used
`build_universal`, Visual Studio 18 2026 x64, bundled OBS 31.1.1 and Qt 6.8.3.
Use `cmake --build build_universal --config Release` and
`ctest --test-dir build_universal -C Release --output-on-failure`. Windows tests
need the bundled Qt/dependency/libobs/signer DLL directories on PATH. Do not
reconfigure those dependencies while an executable has their DLLs loaded.

For all legacy browser/native integrations set `WIDGETCTL`, `WIDGETSTUDIO`,
`PLAYGROUND_NATIVE_TEST` to built executables and
`PLAYGROUND_BROWSER_EXECUTABLE` to an installed Chromium executable. Then run
`node --test --test-concurrency=1 tests/widgets/*.test.mjs`.
Package-safety tests need Python (`PYTHON` can override the executable).

Universal integration additionally uses `UNIVERSAL_RECEIVER_RUNNER` and
`UNIVERSAL_TIKTOOLS_GATEWAY` pointing to their built test runner/gateway
executables. Run `node --test --test-concurrency=1 tests/universal/*.test.mjs`.
The cross-SDK test uses the sibling's vendored SDK when present; standalone OBS
CI checks the same module in two host configurations. Run with both checkouts
to verify actual vendored parity as done here.

These tests launch real C++/Rust processes and Chromium, but the receiver runner
uses an observed dispatcher sink in place of OBS's vendor callback. The separate
bridge-api test uses a mock vendor API. Neither constitutes a running OBS/CEF
session, a native TikTok LIVE test, a packaged TikTools desktop WebView test or
macOS/Linux execution. Those validations remain required for production rollout.

## Local artifacts

`release/universal-widget-sdk-1.0.0.tgz` is produced by
`npm pack ./web/universal --pack-destination release` (npm may use the scoped
name `universal-widget-sdk-1.0.0.tgz`). Run SDK tests from its extracted package;
it does not require either application checkout.

`release/obs-tiktok-widgets-1.0.0-Windows-AMD64.zip` contains the native plugin, signer library,
CLI/Studio helper, compiled web assets, authoring skill and documentation. It has
not been installed into OBS. The reference compiled package remains at
`data/web/templates/universal.gift-alert/1.0.0` for import into either host.

Publishing the SDK/tag/release to a remote service is intentionally not performed
without the user's release instruction. In-memory queues and dedup caches do
not provide persistence across restarts; acknowledgments describe enqueueing,
not proof of display. Loopback is not protection against already-authorized
local processes or an untrusted widget author.
