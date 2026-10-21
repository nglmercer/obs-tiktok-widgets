# Compositions (initial implementation)

A composition is a revisioned `builtin.composition@1.0.0` project. It contains
multiple independent widget instances and renders through one OBS Browser Source.
This is an incremental implementation, **not completion of the web-first migration**.
The native gallery/editor/monitor remain until their web replacements have parity.

## Use in Studio

1. Build/package the updated plugin and static assets. Open Widget Studio.
2. In Templates, open **Composition**. It starts with a 1920×1080 transparent canvas.
3. Add widgets. Select a layer or drag it on the canvas (5px grid). Use the inspector
   for geometry, rotation, opacity, layer order, visibility, locking and accent color.
   Arrow keys nudge a selected unlocked widget while the canvas has keyboard focus;
   Shift changes the nudge to 10px. Duplicate/Delete and design Undo/Redo are available.
4. **Simulate composition** uses the existing local fixture engine: Viewer123,
   Rose ×23, chat, follow, likes and viewers. These events stay in this canvas.
5. **Save design** commits the existing project revision. **Publish** separately
   validates and applies an immutable release. Add that project to the desired scene
   with the existing Add to scene action. Publish before placement; placement and
   OBS restart never implicitly publish a new composition.
6. One placement renders every enabled instance. Repeated composition placement
   in the same scene is idempotent; another scene reuses the existing OBS source.
   Existing legacy widget placements retain their previous behavior.

The contextual design editor shares Studio's project controller, optimistic
revision base and undo history. Code/Events/History still use the existing project
workspace. Instance settings can also be edited as JSON. Custom instances accept
an `html` setting (maximum 64 KiB); their HTML can listen for `universal:event`.
The custom frame has an opaque origin, `allow-scripts`, no network capability,
source/origin/session validation and bounded event messages. It is containment for
trusted author code, not certification for hostile scripts. Built-in CSS is scoped
with Shadow DOM; it is not a JavaScript security boundary.

## Contracts and persistence

`web/universal/schemas/composition.schema.json` defines
`contract: "obs-widget-composition"`, `schemaVersion: 1`. The document contains
viewport/background/widgets. The surrounding existing project owns UUID, name,
revision token, sources, assets, history and publication. Revision tokens remain
content-hash strings; they are not replaced with JavaScript numbers. The existing
`universal-widget` v3 portable manifest/project discriminators are unchanged.

Each widget has a stable ID, pinned template version, settings, geometry, ordering,
visibility, lock and enabled state. Optional `events` overrides its subscription;
an empty list receives all canonical events. Optional `group` is persisted metadata;
hierarchical group transforms and group editing are not implemented yet.

Renderer implementations currently cover exact `2.0.0` versions of `builtin.chat`,
`builtin.gift-alert`, `builtin.follow-alert`, `builtin.likes`, `builtin.viewers`,
`builtin.events` and `builtin.custom`. Unsupported versions fail validation before
publication. Portable package import remains available through its existing Studio
workspace; arbitrary portable packages cannot yet become composition instances.

Author files stay under `projects/<uuid>/src` and `assets`. Settings remain in the
existing project metadata. Releases remain under `runtime/<uuid>/releases/<build-id>`;
`widgets/<uuid>/index.html` is the existing atomically replaced stable loader.
Production never uses the Studio server. Published HTML/JS runs without Node,
network access to Studio, or an authoring session. Runtime media URLs explicitly
configured as remote URLs naturally still need their remote assets.

## Commands

All command responses use API v1 and existing project/build response objects:

| Commands | Preconditions / result |
| --- | --- |
| `compositions.list`, `.create`, `.get` | Existing project objects; create accepts `name` |
| `compositions.update` | `id`, `ifRevision`, `patch` containing viewport/background/widgets |
| `compositions.duplicate`, `.remove` | `id`, `ifRevision`; remove additionally requires `confirm` and retains history/source |
| `compositions.widgets.add` | `id`, `ifRevision`, complete `widget` without ID; server generates the instance ID |
| `compositions.widgets.update`, `.remove` | `id`, `ifRevision`, `widgetId`; update accepts `patch` |
| `compositions.publish` | `id`, `ifRevision`; existing atomic build/publication result |
| `compositions.history`, `.rollback` | Existing source history; rollback requires `ifRevision` and historical `revision` |
| `obs.compositions.list`, `.add`, `.refresh`, `.remove` | Existing opt-in authenticated OBS IPC; add/remove require Studio confirmation |

Rollback restores source/settings and **requires separate publication**. Instant
release-pointer rollback is not implemented. The frontend typed adapter is
`web/studio/api/compositions.ts`. Studio uses its existing authenticated loopback
adapter; CLI authoring uses the locked offline domain, not live IPC. No renderer
receives Studio credentials. Live IPC continues to expose OBS operations only.

CLI example (replace UUID/revision with returned values):

```sh
widgetctl --config CONFIG --assets ASSETS compositions create --name 'Main Overlay' --json
widgetctl --config CONFIG --assets ASSETS compositions get UUID --json
widgetctl --config CONFIG --assets ASSETS compositions publish UUID --if-revision REVISION --json
widgetctl --config CONFIG --assets ASSETS obs compositions add UUID --scene Scene --json
```

For command-line widget edits, `--set key=JSON` populates the composition patch or
widget object. Widget updates take a second positional widget ID. Use Studio for
convenient construction of complete widget objects.

## Rendering and diagnostics

One `universal:event` listener and the existing universal EventRouter serve each
composition. Production does not listen to legacy channels as well, preventing
canonical/legacy double delivery. Local preview translates the existing fixture
v1 envelopes to canonical events. IDs remain strings and gift repeat counts remain
cumulative. Each built-in host reuses the existing template event handler with
independent counters, timers, audio resources and gift maps.

Geometry/visibility/order changes preserve matching mounted instances. Settings or
template changes remount the affected instance. Mounts have an AbortSignal and
5-second timeout. Mount/event failure disposes the affected host. Synchronous
handlers run directly; asynchronous handlers serialize with at most 64 waiting
events per host and an overflow counter. Stop/destroy aborts, unsubscribes, clears
timers, stops audio and removes containers. Lifecycle implementations must cooperate
with AbortSignal; trusted synchronous scripts cannot be forcibly preempted.

`window.TikTokCompositionDiagnostics()` exposes runtime state, per-widget mount
state/errors, routed/duplicate/rejected counts, handling errors and queue overflow.
These observations do not prove on-screen pixels or audible sound. Native heartbeat
correlation and a Studio diagnostics panel are still outstanding.

## Compatibility and remaining migration work

No existing project/source is converted, deleted, merged or republished. No native
UI is removed. No optional TikTools/external receiver code or credentials change.

Outstanding: minimal native dock and removal of native UI after web parity;
authenticated live monitoring; consolidated Events/replay workspace; producer
administration; hierarchical/multi-selection/group transforms; snapping to other
objects, pan/zoom controls and alignment; schema-generated per-template inspectors;
portable-package composition instances; asset/font/video tooling; release rollback;
legacy-source migration planning/backups; restart/reconnect state snapshots;
renderer/native readiness acknowledgements; complete Vite consolidation; and actual
OBS/CEF composition acceptance on available platforms. Existing standalone
Playground and legacy renderers are retained deliberately.

For an illustrated, recorded walkthrough, see the [English guide](COMPOSITION_GUIDE.md) or [guía en español](COMPOSITION_GUIDE.es.md).
