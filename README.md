# OBS TikTok LIVE Widgets

**Development preview:** Linux/OBS Flatpak builds and offline tests pass. Real multi-source Browser/CEF delivery, live TikTok acceptance, and Windows/macOS builds remain unverified. See [validation status](docs/VALIDATION.md) before using this in a production stream.

A standalone C++20 / Qt6 OBS plugin that shares one in-process TikTok LIVE client across every OBS Browser Source. Widgets receive DOM `CustomEvent`s through OBS Browser's `emit_event` vendor request. No Node runtime, external TikTok service, listening port, WebSocket password, widget token, or per-widget connection is used.

## Install and use

Build using [docs/BUILD.md](docs/BUILD.md), then install the plugin, its Rust shared library, and its `data` assets together. Requires OBS 30+ with Qt6, OBS Browser and OBS WebSocket API v3. OBS's network WebSocket server can remain disabled. Linux was compiled against OBS 32.2.2; other OBS versions require compatibility verification.

1. Open **Docks → TikTok LIVE Widgets**.
2. In **Connection**, enter `@creator` and click **Connect**. The plugin automatically downloads, verifies and caches the pinned signing bundle when needed. Anonymous guest bootstrap is the default; account session configuration is optional.
3. In **Widgets**, create **chat** and **gifts** widgets, configure each, and add them to the current or a selected scene.
4. In **Events**, select a test event type (or all events), then click **Broadcast synthetic events to OBS (integration test)** to exercise widgets without a live room. Expand events to inspect their JSON fields or use **Copy JSON** for formatted output. **Preview widget** opens an ordinary browser in fixture mode.

For isolated simulation, select a gift widget and choose **More actions → Open Event Playground**. It automatically shows Viewer123 sending 23 Rose, supports replay and cumulative streaks, and leaves OBS sources unchanged. See [Event Playground](docs/EVENT_PLAYGROUND.md).

Additional widgets, scene changes, and Browser Source reloads never create TikTok clients. Every loaded custom Browser Source can also subscribe directly:

```js
window.addEventListener('tiktok:gift', event => console.log(event.detail));
window.addEventListener('tiktok:event', event => console.log(event.detail));
```

Available templates: scrolling chat, gift streak alerts, follow alerts, aggregated like counter, coalesced viewer counter, and event monitor. Custom HTML pages can use the same DOM API, with or without the optional TypeScript SDK. Settings include dimensions, themes, CSS, filters, animations, and sounds. Widget configuration is local and identified by UUID; it contains no transport credentials.

See [architecture](docs/ARCHITECTURE.md), [event contract](docs/EVENTS.md), [widget development](docs/WIDGET_DEVELOPMENT.md), and [validation report](docs/VALIDATION.md).

## Verified status

Linux native compile/link and package staging passed. Seven project C++ suites, sixteen JavaScript/browser checks, and eleven pinned upstream native tests passed. The bridge test uses OBS's real in-process API wrapper and a mock vendor handler; it does **not** establish real CEF DOM delivery. Windows/macOS CI is configured but has not been executed here. Real OBS dock loading, multiple real Browser Source delivery, live TikTok connection, and production latency/leak verification remain acceptance checks. Do not treat this repository as a certified production release until those checks are completed.

GPL-2.0-or-later. The native dependency includes modified AGPL protobuf schemas; read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the shipped exact license before distribution.

The Events monitor offers an event-type selector. Its default LIVE view hides state snapshots; State and All events remain available. Identical consecutive state snapshots are suppressed only in the monitor, while Browser Sources continue receiving synchronization events. Widget actions are grouped around Create, Edit, Add to current scene and Preview; More actions includes external HTML editing and reload.

### Editable widget projects (Template Engine v2)

Create from discovered versioned templates, then use **Open widget project** to edit `projects/<uuid>/src`. Save and publish are separate; optional auto-publish watches external editor saves and refreshes matching OBS sources and open Playground previews. User source survives restart/reinstallation; failed builds keep the last served release. Existing Browser Source UUIDs and file paths remain stable through backed-up migration.

The installed C++ `widgetctl` provides template/project CRUD, source/settings edits with revision checks, validation, build/publish, isolated preview, history/rollback, packages and opt-in authenticated local OBS placement. No Node or network server is required for basic runtime authoring. Start with [Template Engine v2](docs/TEMPLATE_ENGINE_V2.md), [CLI](docs/WIDGETCTL.md), or [agent workflows](docs/AGENT_WORKFLOWS.md). The agent skill is in `skills/obs-tiktok-widget-author/SKILL.md`.

Widget Studio opens in your system browser through an explicitly enabled authenticated local bridge. It includes a split preview/inspector workspace, syntax editor, retained drafts/conflict handling, history and accessible actions. Plain widgets need no build tools. Installed templates and user authoring use plain HTML/CSS/JavaScript and require no Node.js, npm or compiler. React/TypeScript are used only to develop the plugin's prebuilt Studio UI. Studio v4 adds responsive panels, shared themes and English/Spanish interfaces. See [Studio v4](docs/UI_V4.md) for workflows, screenshots and trust boundaries.

Experimental [Widget Health diagnostics](docs/WIDGET_HEALTH.md) distinguish OBS vendor acceptance from browser processing. Telemetry is opt-in and has not passed real CEF acceptance on the test system; automatic recovery and cross-reload replay are not enabled. Existing playback remains independent of diagnostics and Studio.

Composition work is available as an [initial multi-widget canvas implementation](docs/COMPOSITIONS.md). See the [repository audit](docs/architecture/WEB_FIRST_AUDIT.md) for migration gates and retained legacy workflows.

[Illustrated composition walkthrough and recording](docs/COMPOSITION_GUIDE.md) · [Guía en español](docs/COMPOSITION_GUIDE.es.md)
