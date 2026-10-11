# OBS TikTok LIVE Widgets

A standalone C++20 / Qt6 OBS plugin that shares one in-process TikTok LIVE client across every OBS Browser Source. Widgets receive DOM `CustomEvent`s through OBS Browser's `emit_event` vendor request. No Node runtime, external TikTok service, listening port, WebSocket password, widget token, or per-widget connection is used.

## Install and use

Build using [docs/BUILD.md](docs/BUILD.md), then install the plugin, its Rust shared library, and its `data` assets together. Requires OBS 30+ with Qt6, OBS Browser and OBS WebSocket API v3. OBS's network WebSocket server can remain disabled. Linux was compiled against OBS 32.2.2; other OBS versions require compatibility verification.

1. Open **Docks → TikTok LIVE Widgets**.
2. In **Connection**, enter `@creator` and click **Connect**. The plugin automatically downloads, verifies and caches the pinned signing bundle when needed. Anonymous guest bootstrap is the default; account session configuration is optional.
3. In **Widgets**, create **chat** and **gifts** widgets, configure each, and add them to the current or a selected scene.
4. In **Events**, select a test event type (or all events), then click **Generate test events** to exercise widgets without a live room. Expand events to inspect their JSON fields or use **Copy JSON** for formatted output. **Preview widget** opens an ordinary browser in fixture mode.

Additional widgets, scene changes, and Browser Source reloads never create TikTok clients. Every loaded custom Browser Source can also subscribe directly:

```js
window.addEventListener('tiktok:gift', event => console.log(event.detail));
window.addEventListener('tiktok:event', event => console.log(event.detail));
```

Available templates: scrolling chat, gift streak alerts, follow alerts, aggregated like counter, coalesced viewer counter, and event monitor. Custom HTML pages can use the same DOM API, with or without the optional TypeScript SDK. Settings include dimensions, themes, CSS, filters, animations, and sounds. Widget configuration is local and identified by UUID; it contains no transport credentials.

See [architecture](docs/ARCHITECTURE.md), [event contract](docs/EVENTS.md), [widget development](docs/WIDGET_DEVELOPMENT.md), and [validation report](docs/VALIDATION.md).

## Verified status

Linux native compile/link and package staging passed. Four project C++ suites, eight JavaScript checks, and eleven pinned upstream native tests passed. The bridge test uses OBS's real in-process API wrapper and a mock vendor handler; it does **not** establish real CEF DOM delivery. Windows/macOS CI is configured but has not been executed here. Real OBS dock loading, multiple real Browser Source delivery, live TikTok connection, and production latency/leak verification remain acceptance checks. Do not treat this repository as a certified production release until those checks are completed.

GPL-2.0-or-later. The native dependency includes modified AGPL protobuf schemas; read [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the shipped exact license before distribution.

The Events monitor offers an event-type selector. Its default LIVE view hides state snapshots; State and All events remain available. Identical consecutive state snapshots are suppressed only in the monitor, while Browser Sources continue receiving synchronization events. Widget actions are grouped around Create, Edit, Add to current scene and Preview; More actions includes external HTML editing and reload.
