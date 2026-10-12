# Widget Studio

## Installed-user requirements

The supported user workflow is plain HTML/CSS/JavaScript. All built-in templates and Studio assets ship compiled. Installing the plugin, creating widgets, editing source, previewing and publishing require no Node.js, npm, React or TypeScript compiler. React/TypeScript remain repository development dependencies only. Framework starters are excluded from installed packages; new framework projects and toolchain installation are disabled. Existing projects and published releases are preserved; existing framework sources are not converted or deleted. To distribute a framework-authored widget, compile it during development and package its static HTML/CSS/JavaScript output.

The framework sections below describe legacy compatibility/development internals, not supported installed-user authoring options.

Studio is a static React/TypeScript application packaged by Vite/Tailwind. It uses accessible Radix tooltips, Lucide actions, resizable panels, React Hook Form/AJV and lazy CodeMirror 6. OBS executes prebuilt HTML/JS/CSS, not Node or a Vite development server. No Qt WebEngine or private CEF interfaces are used.

## Opening and trust

Use **Open Studio** in the native dock or:

```
widgetctl --config /path/to/plugin-config --assets /path/to/installed/web studio start --confirm
```

The launcher returns a session URL; open it in the system browser. Keep the process running; closing it stops the bridge. The installed `widgetstudio` helper is the adapter behind this command. The dock keeps the helper alive only during its OBS session. Launching requires explicit opt-in. Native settings/gallery remain available as fallback.

The adapter binds only 127.0.0.1 on an ephemeral port, authenticates an unguessable per-process credential supplied in the initial URL fragment, removes the fragment, then uses an HttpOnly SameSite cookie plus a session header. It rejects foreign Origin/Host, cross-site fetches, unknown methods, missing revisions, oversized bodies and excessive requests. No wildcard CORS. Private OBS IPC credentials remain in C++; the browser never receives them. OBS placement is available only with the existing opt-in authenticated local IPC, and scene changes require confirmation. Flatpak live IPC must be launched within the same sandbox namespace.

Localhost is not a hostile-template sandbox: templates are trusted author code and preview frames allow scripts and same-origin resources. A trusted template can execute browser code; never install hostile templates or place secrets in author projects. The bridge serves only Studio, allowlisted packaged resources and validated generated widget paths, not arbitrary host files. Mutations are audited without arguments/tokens. The initial Studio URL is a short-lived credential; do not share or record it.

## Authoring

Templates / My Widgets / Live Events / Assets / Settings navigation leads to a project/file panel, renderer preview and schema inspector. Gallery preserves shipped thumbnails, categories, descriptions and Vanilla/TS/React badges. Code supports HTML/CSS/JS/TS/TSX highlighting, local undo/redo, search, file CRUD and draft markers. Browser-session drafts are never production output. External saved changes preserve code drafts and offer compare/reload/manual merge. Writes use the revision captured when the file/settings were read; conflict errors require rereading/merging rather than blind retries.

Build creates a candidate; Publish validates/builds and commits the stable output pointer. Preview uses the last published renderer with the existing isolated Playground session protocol and Viewer123 Rose ×23 fixture. It refuses an unpublished project rather than silently publishing. No synthetic events are sent to the OBS dispatcher. Live Events currently exposes isolated samples, not a second TikTok subscription. History rollback restores author source; publishing is a separate action. Package import validates/previews before confirmed installation; browser uploads have a 700 KB UI limit (1 MB request bound); larger files/packages use widgetctl. Asset uploads stay inside the selected project's assets tree.

Inspector supports JSON Schema types/enums/ranges/descriptions and `x-ui.control` (`color`, `slider`, `asset`), `group`, and `visibleWhen: {field, equals}`. Unknown settings/schema keys stay preserved. `x-visual.components: [{id,label,properties:[...]}]` declares inspectable components. Visual editing changes declared properties such as position/font/color/size; it does not rewrite arbitrary DOM or reverse-compile JSX. Arbitrary templates without that metadata are source-edit-only. Declared position/size bindings support the canvas described below; unrestricted DOM canvases and embedded OBS browser docks are not advertised.

Actions share `web/shared/actions.json` IDs, descriptions, icons and shortcuts, compiled to Qt SVGs and browser controls. Primary tasks show text. Icon-only actions have labels, title fallbacks, hover/focus tooltips and focus outlines; disabled controls explain their reason.

## Builder modes

Missing build metadata remains static v2 behavior. Schema v3 accepts:

```json
{"mode":"vite","language":"typescript","framework":"react","target":"obs-browser","assetBase":"./"}
```

Framework is `vanilla` or `react`; Vue/Svelte, arbitrary plugins/options and dependencies receive explicit errors. Shipped starters: existing static-vanilla templates, `builtin.typescript-vanilla@3.0.0`, `builtin.react-typescript@3.0.0`. Projects retain v2 identity/history metadata and pin their v3 template without rewriting existing projects.

Framework builders are optional, dev-time tooling. Node/npm are required on the machine/process that performs builds, not for OBS rendering or plain editing. Inspect `widgetctl builders status --json`. Installing the pinned Vite/React/TypeScript/type definitions requires:

```
widgetctl builders install --confirm --json
```

This command may fetch dependencies. Third-party tooling is executable trusted code; `--ignore-scripts` disables package lifecycle scripts but does not make third-party compilers safe. Builds never install or fetch packages. Source `src/package.json` and `src/package-lock.json` must match the shipped policy exactly; arbitrary dependencies/config/plugins are deliberately unsupported. A policy upgrade requires explicit toolchain reinstallation. Toolchain caches are build-owned, never author source.

The C++ runner takes an immutable source snapshot, checks policy/revision, starts the trusted runner with a constrained environment (no OBS/TikTok credentials), 256 MB Node heap, 30-second compile timeout and 2 MB process-output bound. TypeScript diagnostics retain original source line/column. Type checker reads only snapshot/toolchain files; author-controlled references are rejected. Trusted Vite configuration has no author config/env files or plugins and a resource-boundary guard. Source import AST checks allow only project-relative paths and audited SDK/React imports. Dynamic imports must be static project paths; they are inlined into the single output bundle.

Vite uses relative base and emits a self-contained IIFE, converting only the compiler-owned module script to a deferred classic script. This supports local-file browsers without module CORS and OBS's http://absolute handler. Source maps are generated; runtime code contains no framework CDN or Node dependency. Compiled artifacts pass existing static resource/HTML/CSS/JS validation and bounded-tree checks before atomic publication. Stale results fail the existing revision comparison. Failed compiler/type/resource checks preserve the active release and author source.

OBS processes without Node cannot compile framework source themselves: build with the external CLI/Studio process where Node is available, then OBS's watcher observes publication and refreshes matching sources. Auto-publish is off by default for framework starters; enabling it requires tooling in the watcher process. Static projects retain their existing preference. The subprocess is least-privilege/config-constrained, not an OS sandbox against malicious compiler dependencies.

See [validation](VALIDATION.md) for executed tests and platform limits. Studio/browser shell and compiler acceptance are distinct from real CEF acceptance.

## Before and after

The native fallback remains a Qt form/source dialog. The default dock Create/Edit actions now launch Studio, with the selected UUID in the URL when available. Studio separates appearance from Code, provides resizable preview/inspector panels, syntax-aware editing and explicit draft/conflict states. [Workspace](studio/workspace.png) and [typed preview](studio/preview-react-typescript.png) are captured from executed browser sessions. File operations create shared-service checkpoints; Undo/Redo restore sequential file-operation checkpoints under revision checks. `widgets snapshot <uuid> --if-revision TOKEN` exposes the same checkpoint service to CLI authors. Watchers in OBS and the standalone Studio process share the same registry; framework auto-publish requires Node in the process doing compilation.

## Studio fixes and declarative canvas

The dock owns one `StudioLauncher` helper per session. Repeated clicks reuse it, including the latest selected UUID; stdout is newline-framed and bounded, with a 15-second startup timeout. Startup, ready, stopped and error states remain visible. Closing the dock terminates/reaps the child; the helper also watches the launching OBS PID to exit after an OBS crash. Its session URL stays in memory and is never logged. System-browser tab reuse depends on the browser; helper process reuse does not.

Code drafts use a versioned per-project/per-file record containing base, local text and revision. Clean buffers follow external and atomic formatter saves automatically, preserving CRLF. Dirty buffers retain base/local/remote comparison. Reload is explicit; Merge combines independent changed lines, while overlapping/structural changes remain available for manual merge. Keep Draft advances the reviewed base without saving. Poll results are invalidated on navigation and commits, and overlapping polls are suppressed. Storage failure keeps in-memory drafts. CodeMirror history follows file/tab switches; file operation Undo/Redo walks revision-checked checkpoints and refuses restoration after unrelated mutations.

The inspector accepts `x-ui.widget` and `x-ui.control`: `textarea`/`html`/`css`/`multiline`, color plus hexadecimal text, slider plus numeric field, searchable enum/filter arrays, and `asset`/`image`/`font`/`audio`. `group`, descriptions and `visibleWhen: {field, equals}` remain the supported safe subset. Unknown settings are preserved by patching declared editable keys. Audio tests use published local preview resources, with playback failures shown as errors. Save Appearance and Save Design persist author settings; Build and Publish refuse unsaved drafts.

The 3.0.1 typed starters add explicit visual bindings and reactive preview settings. Existing 3.0.0 packages and projects remain intact; source is never auto-upgraded. Custom renderers can subscribe to `tiktok:preview-settings` to reflect draft values. Design sends bounded, public settings through a separate source/origin/session-validated channel to the existing Playground; its frame still validates the active preview session. This never writes production settings or emits production events.

```json
{"x-visual":{"components":[{"id":"alert","label":"Gift alert","properties":["x","y","width","height","color"],"bindings":{"x":"x","y":"y","width":"width","height":"height"}}]}}
```

Canvas overlays represent declared components, not arbitrary DOM inspection. Select a layer or overlay, drag to move, use the corner handle to resize, or arrow keys (Shift for 8px) to nudge. Grid snapping, zoom, viewport presets and design history operate on the same settings draft as the inspector. Save then Publish explicitly. Templates without position/size bindings explain the Code-mode fallback. Parent labels may describe hierarchy; this is not JSX reverse compilation or an unrestricted page designer.

Builder provider API 1 exposes `static`, `vite-vanilla` and `vite-react`, backed by the existing snapshot/validation/publish services. `builders status` reports provider discovery. Type errors include `details.locations` with source file, line, column, TS code and message alongside legacy diagnostic text. Studio opens the corresponding source and scrolls to the location. The trusted toolchain policy changed to add structured diagnostics; explicitly reinstall the toolchain cache before compiling with the new policy. Existing published output remains usable without that installation.
