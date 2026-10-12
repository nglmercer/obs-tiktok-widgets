# Widget Studio and controlled builders

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

Inspector supports JSON Schema types/enums/ranges/descriptions and `x-ui.control` (`color`, `slider`, `asset`), `group`, and `visibleWhen: {field, equals}`. Unknown settings/schema keys stay preserved. `x-visual.components: [{id,label,properties:[...]}]` declares inspectable components. Visual editing changes declared properties such as position/font/color/size; it does not rewrite arbitrary DOM or reverse-compile JSX. Arbitrary templates without that metadata are source-edit-only. Drag/drop, unrestricted DOM canvases and embedded OBS browser docks are not advertised.

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

The native fallback remains a Qt form/source dialog. The default dock Create/Edit actions now launch Studio, with the selected UUID in the URL when available. Studio separates appearance from Code, provides resizable preview/inspector panels, syntax-aware editing and explicit draft/conflict states. [Workspace](studio/workspace.png) and [typed preview](studio/preview-react-typescript.png) are captured from executed browser sessions. File operations create shared-service checkpoints; Undo/Redo restore the most recent operation under revision checks. `widgets snapshot <uuid> --if-revision TOKEN` exposes the same checkpoint service to CLI authors. Watchers in OBS and the standalone Studio process share the same registry; framework auto-publish requires Node in the process doing compilation.
