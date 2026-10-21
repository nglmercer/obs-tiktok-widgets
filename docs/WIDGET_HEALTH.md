# Widget health (experimental)

This change provides observability foundations, not a production-ready automatic recovery system. OBS vendor acceptance is distinct from browser receipt, processing, DOM rendering and video output. The original intermittent blank-source problem has not been established as fixed.

## Use

Open **TikTok LIVE Widgets → Events → Widget Health** in OBS. The existing Integration test button broadcasts synthetic events through the native dispatcher and obs-browser vendor bridge. It affects subscribed sources; it is not a targeted per-page test. Inspect the OBS output separately. The health rows list reporting page instances with expandable build, asset and event-stage details. **Copy sanitized diagnostics** copies those page reports without event payloads or session credentials.

With the existing authenticated, opt-in widgetctl IPC enabled:

```sh
widgetctl widgets health --json
widgetctl doctor --json
```

Health uses live IPC and returns `OBS_OFFLINE` when IPC is unavailable. Enable the existing Widgetctl IPC option in the dock rather than starting an OBS WebSocket network server. Doctor remains an offline integrity/capability report; its live health is explicitly unknown. It does not claim an offline inspection checked OBS.

Existing project refresh actions remain available. A project refresh can affect multiple sources sharing its UUID. There is no deterministic page-to-source mapping; page rows explicitly say `unmapped`. There is no new automatic refresh, rollback, targeted-page recovery, durable backlog or cross-reload alert replay in this implementation.

## Optional transport

The experimental adapter is disabled by default. Developers testing disposable profiles may set `widgetHealth.experimentalTelemetry` to the JSON boolean `true` in plugin settings before starting OBS. Other values do not enable it. Restart OBS to change this option. No network OBS WebSocket server or Studio process is needed.

New publications reference `runtime-session/health.js` and `health-client.js`, using encoded relative paths calculated from the actual immutable entry. The native lifecycle atomically replaces transient configuration, restricts the session directory and capability file to the owner, and removes session configuration on shutdown. The capability and random port never enter author source, general settings, public event envelopes or immutable releases. Stale session reports are rejected. Already published releases are not rewritten: explicitly publish a new release to adopt the bootstrap. Old releases and legacy/custom HTML continue playing without health.

The in-process Qt listener binds an ephemeral IPv4 loopback port and exposes only `POST /widget-health/v1/report` and CORS preflight. Host must be its exact literal loopback address and port. Origins are restricted to `null` and OBS's virtual `http://absolute`; a per-session capability header is still mandatory for reports. There are no editing, file reading, event injection or OBS-control methods. Bounds include 8 KiB reports, 4 KiB headers, 16 concurrent sockets, a two-second socket timeout, 200 authenticated reports/s globally, 20 reports/s per page and at most 256 page identities. No keepalive, transfer encoding or duplicate headers are accepted. Client buffers cap at 32 outgoing reports and 100 local diagnostics. Reports are asynchronous, limited to four requests/s per client and may be dropped; rendering never awaits them.

Custom template CSP is preserved. A `connect-src 'none'` template cannot report and remains unobservable. Existing pinned universal starter CSP is unchanged. This implementation does not circumvent CSP or enable reverse OBS vendor requests. The actual CEF-to-loopback path has **not passed** acceptance here; do not enable it as a production recovery dependency. Read the platform evidence in [VALIDATION.md](VALIDATION.md).

## Semantics

| Stage | Meaning |
| --- | --- |
| `vendorAccepted` | OBS accepted the in-process request; no browser acknowledgement implied |
| `event.received` | A page's participating listener saw the event |
| `event.processed` | Its handler returned, or an awaited universal handler completed |
| `event.rendered` | Built-in handler mutated its root, then the connected nonempty root remained after two animation-frame callbacks |
| `event.skipped` | Explicit filter, duplicate, or bounded-queue outcome |
| `event.failed` | Handler threw/rejected |
| `visualVerified` | Never inferred; requires separate OBS capture evidence |

A DOM rendering report is not evidence of OBS compositing or the viewer seeing a frame. Asynchronous DOM updates without an explicit author report can remain unverified. Universal/custom handlers are not marked rendered by guessing from arbitrary existing DOM. Authors can opt into readiness with `window.TikTokWidgetHealth?.ready()` and report through the optional client. Full mounted readiness is not inferred from HTML load.

Each page generates an instance ID. The immutable production bootstrap supplies its actual build ID and widget UUID. Native records reject instance identity changes, stale sessions and invalid report kinds/identifiers. Heartbeat expiry changes ready/loading to unresponsive, while pagehide remains suspended. Missing telemetry alone never triggers recovery. The manager retains at most 100 redacted stage records per page, 256 pages, and evicts records older than five minutes. Native vendor history retains 100 redacted events independently.

Errors cover resource loading, uncaught JavaScript, unhandled rejection, CSP, required built-in root absence, mount/handler failure, audio rejection and bounded font readiness timeout. Image failure removes optional artwork while retaining alert text. Audio failure does not erase successful DOM processing. Text, URLs, file paths, exceptions and event payloads are not included in reports. Only allowlisted diagnostic fields and bounded safe identifier strings are retained.

Gift deduplication uses message identity plus the cumulative repeat count; it never sums repeat totals. State/counter and chat handling retain existing coalescing/feed semantics. The universal router retains its existing independent deduplication. This is same-page duplicate protection, not exactly-once delivery across a browser crash. Fonts never gate normal alert processing.

## Remaining work

A verified CEF reporting transport, per-instance native pending ACK deadlines, bounded replay/resync with per-page routing, build mismatch comparison, source-specific recovery controls/circuit breakers, optional rollback, targeted synthetic testing with bounded ACK waiting, validated configuration for those features, and broader platform/failure-injection acceptance remain outstanding. Do not infer those capabilities from the foundational class names or from passing HTTP/mock tests.
