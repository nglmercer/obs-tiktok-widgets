# Web-first refactor implementation status — 2026-10-21

**Partial implementation. The requested complete migration is not finished.**
Changes remain uncommitted in the supplied workspace, which was checked out on
`master`; no PR branch was selected, no PR was created and nothing was merged.

## Actual implementation

- Added a separately discriminated, bounded composition schema and exact-version
  runtime registry. Existing portable universal v3 contracts remain unchanged.
- Added native `CompositionService` command adapters over WidgetProjectService:
  CRUD, per-instance edits, duplication, explicit publish, source history/restore,
  optimistic revision enforcement, geometry/schema checks and duplicate-ID checks.
  No second registry, storage engine, backend or TikTok client was introduced.
- Added a Vite-built static compositor and `builtin.composition@1.0.0` template.
  Multiple instances reuse existing event handlers inside scoped Shadow DOM;
  custom HTML uses capability-limited opaque iframes. Canonical events use one
  EventRouter per composition, preserve uint64 strings and cumulative gift totals,
  and do not subscribe to duplicate legacy production channels.
- Added independent host lifecycle, cancellation signals, mount timeout, error
  isolation/reporting, audio/timer cleanup, bounded asynchronous event queues and
  runtime diagnostics. Geometry/visibility/order changes preserve mounted state.
- Added composition design editing inside the existing Studio controller/draft
  history: add, select, drag/grid, geometry/rotation/opacity, layer order, visibility,
  locking, duplicate/delete, undo/redo, instance JSON settings and isolated fixtures.
  Dedicated design behavior requires declared composition x-visual metadata.
- Added OBS composition aliases, scene-scoped idempotent placement and source reuse
  across scenes. Legacy placement behavior is retained. Unpublished compositions
  are never implicitly published by placement or startup.
- Extended Studio's authenticated method allowlist and scene-confirmation checks.
  Published pages receive no Studio credentials. Fixed AJV standalone Unicode
  helper packaging to produce browser-executable ESM rather than `require()`.
- Updated English/Spanish catalogs, native compiled translations, deterministic
  generated resources, packaging docs, typed API contracts and regression tests.

Architecture now: the existing native connection → normalizer → dispatcher →
in-process BrowserEventBridge → one canonical composition router → independent
widget hosts. Authoring still uses the existing authenticated Studio adapter and
project controller. Publication still uses the existing immutable releases and
atomic stable local-file entry. Production has no Studio server dependency.

## Migration and removal

No user projects, pinned author sources, external assets, releases or OBS placements
were migrated, deleted or merged. Existing portable import and optional external
receiver/TikTools paths remain intact. Native gallery/editor/monitor, standalone
Playground and legacy renderers remain because their full web replacements have
not passed parity. Only superseded generated Studio hash assets were removed and
replaced by current build outputs.

## Executed validation

Linux development environment; all results below were actually executed:

| Check | Result |
| --- | --- |
| `npm run build` | Passed; static renderer ~22 KB before gzip, ~8 KB gzip; existing Studio chunk-size warnings remain |
| `npm run typecheck` | Passed |
| Full `npm test` with CLI, Studio and Chromium configured | **43 passed, 0 failed, 0 skipped** |
| `npm run test:universal` | **13 passed, 0 failed** |
| Full native plugin/CLI/Studio/tests build | Passed in fresh `build_compositor` |
| `ctest --test-dir build_compositor --output-on-failure` | **11 passed, 0 failed**, including 280px Qt dock coverage |
| `npm run format:check` | Passed |
| `npm run locales:check` | Passed: **453** English/Spanish keys and placeholders |
| `npm run contracts:check` | Passed |
| `node tools/check-generated.mjs` | Passed: **145** deterministic assets |
| `git diff --check` | Passed |

New integration coverage uses real offline `file://` Chromium pages: multiple
independent widgets, canonical deduplication, legacy-channel isolation, gift totals
1→5→23, large string counters, opaque custom-frame boundaries and script-error
reporting, mount failure/timeouts, 50 reload cycles and teardown. A synchronous
5,000-event burst accepted all events, reported zero queue overflow and retained
30 configured chat rows. The independent run measured **307.8 ms**; the final full
suite measured **519.1 ms** under concurrent test load. These are local Chromium
measurements, not latency guarantees or OBS performance claims.

Studio browser coverage verifies draft isolation, local simulation, geometry,
revisioned saving and no document overflow at 320/768/1440px. Native source tests
use real libobs with a **mock Browser Source** to verify identity, scene reuse,
refresh, restart materialization and unpublished-source protection. They do not
prove actual CEF rendering.

The existing `build_system` Ninja tree initially asserted while updating its
C++ dependency graph. A fresh build directory with C++ module scanning disabled
built successfully. No source workaround or destructive build-tree cleanup was used.

**Not executed for these changes:** actual OBS/CEF composition event delivery,
scene switching/reload/publication/restart/audio/shutdown acceptance; live TikTok
traffic; audible playback; Windows/macOS packaging/runtime; CPU/memory leak
profiling, reconnect storms or disk-full/OOM tests. Earlier repository OBS evidence
predates this compositor and is not reused as proof of its acceptance.

## Remaining work

Milestone A is audit-only; native UI removal is intentionally pending parity.
Milestone B has a working initial compositor, persistence, publication and placement
path. C/D include contextual design and local simulation, not the complete requested
editor/Events workspaces. E reuses immutable publication and adds a Vite renderer,
not full frontend pipeline consolidation. F's composition migration and cleanup
remain unimplemented.

Missing requirements include authenticated live event streaming and diagnostics
UI; producer administration; consolidated Events/replay; primary composition
navigation; multi-selection, hierarchy/group transforms, alignment, object snapping,
pan/zoom/presets and layer drag sorting; schema-generated instance inspectors;
portable packages as composition instances; complete asset/font/video controls;
instant release rollback; explicit backed-up legacy migration; native readiness/
heartbeat correlation and reconnect snapshots; full Vite consolidation; native UI
removal; complete bilingual workflow documentation and real OBS/CEF acceptance.

Source-history rollback restores author state and requires separate publication.
Custom templates remain trusted code; synchronous scripts cannot be forcibly
preempted, and iframe containment is not hostile-code sandbox certification.

## File inventory

### Added

- `data/web/renderer/renderer.js`
- `data/web/studio/assets/Code-9Kh305Ou.js`
- `data/web/studio/assets/index-C3K2QBoG.js`
- `data/web/studio/assets/index-hJb2pPi-.css`
- `data/web/templates/builtin.composition/1.0.0/manifest.json`
- `data/web/templates/builtin.composition/1.0.0/presets/default.json`
- `data/web/templates/builtin.composition/1.0.0/schema/settings.schema.json`
- `data/web/templates/builtin.composition/1.0.0/src/index.html`
- `data/web/templates/builtin.composition/1.0.0/src/renderer.js`
- `docs/COMPOSITIONS.md`
- `docs/architecture/WEB_FIRST_AUDIT.md`
- `docs/architecture/WEB_FIRST_STATUS.md`
- `docs/studio/workspace-v4.png`
- `src/projects/CompositionService.cpp`
- `src/projects/CompositionService.hpp`
- `tests/widgets/composition-api.test.mjs`
- `tests/widgets/composition-browser.test.mjs`
- `tests/widgets/composition-studio.test.mjs`
- `tests/widgets/composition.test.mjs`
- `web/renderer/app/CompositionRuntime.d.ts`
- `web/renderer/app/CompositionRuntime.js`
- `web/renderer/app/builtins.d.ts`
- `web/renderer/app/builtins.js`
- `web/renderer/app/composition.d.ts`
- `web/renderer/app/composition.js`
- `web/renderer/app/custom.js`
- `web/renderer/main.js`
- `web/renderer/vite.config.ts`
- `web/studio/api/compositions.ts`
- `web/studio/features/CompositionEditor.tsx`
- `web/templates/builtin.composition/1.0.0/manifest.json`
- `web/templates/builtin.composition/1.0.0/presets/default.json`
- `web/templates/builtin.composition/1.0.0/schema/settings.schema.json`
- `web/templates/builtin.composition/1.0.0/src/index.html`
- `web/universal/schemas/composition.schema.json`

### Changed

- `CMakeLists.txt`
- `README.md`
- `data/web/i18n/en.qm`
- `data/web/i18n/en.ts`
- `data/web/i18n/es.qm`
- `data/web/i18n/es.ts`
- `data/web/playground/app.js`
- `data/web/playground/widget.js`
- `data/web/studio/index.html`
- `data/web/templates/builtin.follow-alert/2.0.0/src/main.js`
- `data/web/templates/builtin.likes/2.0.0/src/main.js`
- `data/web/templates/builtin.viewers/2.0.0/src/main.js`
- `data/web/widgets/widget.js`
- `package.json`
- `src/cli/widgetctl.cpp`
- `src/obs/BrowserSourceManager.cpp`
- `src/obs/BrowserSourceManager.hpp`
- `src/obs/PluginLifecycle.cpp`
- `src/projects/WidgetCommands.cpp`
- `src/projects/WidgetProjectService.cpp`
- `src/studio/StudioServer.cpp`
- `src/ui/i18n/en.qm`
- `src/ui/i18n/en.ts`
- `src/ui/i18n/es.qm`
- `src/ui/i18n/es.ts`
- `src/widgets/WidgetManager.cpp`
- `tests/widgets/source-persistence-test.cpp`
- `tests/widgets/widgetctl.test.mjs`
- `tools/package-templates.mjs`
- `tools/studio-schemas.mjs`
- `web/shared/i18n/en.json`
- `web/shared/i18n/es.json`
- `web/studio/api/validators.ts`
- `web/studio/features/workspace/ProjectWorkspace.tsx`
- `web/studio/styles/studio.css`
- `web/templates/alerts.js`
- `web/templates/likes.js`
- `web/templates/viewers.js`

### Removed (superseded generated bundles)

- `data/web/studio/assets/Code-Dz3rfLg3.js`
- `data/web/studio/assets/index-ZDzOLG9u.css`
- `data/web/studio/assets/index-r_OEfNyl.js`

## Reproduce

```sh
npm run build
cmake -S . -B build_compositor -G Ninja -DCMAKE_BUILD_TYPE=Debug -DCMAKE_CXX_SCAN_FOR_MODULES=OFF
cmake --build build_compositor -j 4
ctest --test-dir build_compositor --output-on-failure
WIDGETCTL=build_compositor/widgetctl WIDGETSTUDIO=build_compositor/widgetstudio PLAYGROUND_BROWSER_EXECUTABLE=/path/to/chrome npm test
npm run test:universal
npm run typecheck
npm run format:check
npm run locales:check
npm run contracts:check
node tools/check-generated.mjs
```

The executed native configure additionally used
`-DTTL_TARGET_DIR=/home/meme/Documents/Codex/2026-08-02/obs-tiktok-widgets/build_flatpak/rust`
to reuse the existing pinned Rust artifact cache. The executed Chromium path was
`/home/meme/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`.
These are development commands; installed users do not need Node or a dev server.

For one-source usage and command semantics, see [COMPOSITIONS](../COMPOSITIONS.md).
