# Web-first migration audit

Inspected 2026-10-21, working tree initially clean, checked-out branch `master`.
No PR branch has been selected or merged by this change.

## Reuse and ownership

- `src/core/TikTokConnectionManager.cpp` owns one native client. Keep it and
  `EventNormalizer.cpp` / `EventDispatcher.cpp` unchanged. IDs are decimal strings;
  gifts carry cumulative repeat counts.
- `src/core/BrowserEventBridge.cpp` emits `universal:event` and legacy
  `tiktok:event` / typed channels through the in-process obs-browser vendor API.
  A composition must listen only to the canonical channel; preview needs a
  local legacy-to-canonical adapter, never a native broadcast.
- `src/projects/WidgetProjectService.cpp`, `ProjectIO.*`, `WidgetBuilder.cpp`
  already implement UUID projects, optimistic revisions, locking, snapshots,
  static compilation, immutable runtime releases and atomic stable HTML pointers.
  Composition documents should live in these projects, not a second registry.
- `src/projects/WidgetProjectWatcher.cpp` watches author files and auto-publication.
  Composition projects must explicitly disable auto-publish initially.
- `src/projects/WidgetCommands.cpp`, `WidgetLocalIPC.cpp` and
  `src/studio/StudioServer.cpp` provide command dispatch, per-user authenticated
  IPC, loopback session/origin/host validation and file allowlists. Extend their
  allowlists together. Never give renderer pages Studio credentials.
- `src/obs/BrowserSourceManager.cpp` places/refreshes stable local-file entries
  and identifies existing source settings. Reuse placements for compositions;
  preserve source identities, transforms and legacy entries.
- `web/studio/features/useStudioProject.ts` owns project/draft state. Its
  per-file revisions and stale-request guards must survive composition work.
  Canvas/Inspector/Layers currently edit declared visual settings, not arbitrary DOM.
- `web/universal/index.js`, `normalize.js`, `layout.js`, schemas and
  `package-loader.js` own canonical events, deduplication, portable v3 manifests,
  portable layout and trusted-package containment. A composition gets a separate
  discriminator; portable schemaVersion 3 must retain its existing meaning.
- `web/templates/{chat,gifts,alerts,likes,viewers,events}.js` expose reusable
  handlers, but their `start()` functions and `web/runtime/renderer.js` assume
  global document/root/listeners. Composition hosts need scoped contexts and
  tracked resource cleanup while reusing those handlers.

## Native parity gates

`src/ui/TikTokDock.cpp` still creates WidgetGallery, WidgetEditor, EventMonitor,
placement controls, synthetic production integration tests, CLI enablement,
external receiver pairing/revocation and health diagnostics. `PluginLifecycle.cpp`
feeds its monitor. Deleting these now loses workflows. Studio has project editing,
templates, assets, preview, history and source placement; it does not yet replace
all pairing/monitoring workflows. Retain native code until replacement tests pass.
`CMakeLists.txt` globs native UI sources, including dock-test; deletion must update
both functional expectations and packaging/translations.

## External integration

`src/universal/ExternalEventReceiver.cpp` is optional and separately authenticated.
`PluginLifecycle.cpp` starts it from `externalEvents` settings and feeds the same
dispatcher. TikTools does not own the TikTok native connection. Keep receiver,
producer scopes and pairing material out of public composition settings.

## Build and tests

`package.json` combines TypeScript, esbuild, template packaging and Studio Vite.
`tools/check-generated.mjs` regenerates in a temporary tree. New compositor output
must participate in that deterministic build. Installed projects remain static
HTML/CSS/JS, without Node. Existing suites: `tests/widgets/*.test.mjs`,
`web/universal/tests/*.test.mjs`, native CTest targets in `CMakeLists.txt`,
`tests/universal`, Playwright scripts under tests/tools and actual OBS acceptance
instructions in `docs/VALIDATION.md`. Browser tests do not establish CEF parity.

## Migration risks and order

1. Add composition contracts, renderer and command adapters on existing projects.
2. Exercise static publication/rollback and one-source routing before UI removal.
3. Add composition editing to the existing controller, authenticated live stream,
   preview/replay parity and external integration administration.
4. Only then remove native gallery/editor/monitor and redundant browser bundles.
5. Existing projects, pinned template versions, source UUIDs and releases remain
   untouched; never merge scene placements automatically. A future migration must
   report, back up and validate before replacing any placement.

This audit is not a claim that the complete migration or OBS acceptance is done.
