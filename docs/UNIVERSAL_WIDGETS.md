# Universal widgets 1.0

The OBS plugin works independently of TikTools. The external receiver is disabled
until explicitly enabled. Neither the receiver nor its credentials are needed
for existing OBS browser widgets or native TikTok playback.

## Use a portable package

Build the repository with `npm ci` and `npm run build`. The compiled reference
package is `data/web/templates/universal.gift-alert/1.0.0`; its source is
`web/templates/universal.gift-alert/1.0.0`. It is a plain static widget responding
to `custom.alert` and canonical `tiktok.gift` events, with text-safe rendering.

OBS discovers this template normally. Create an instance in Studio or widgetctl,
then Build/Publish and place it in a browser source through the existing workflow.
Installed users need no Node or compiler. In Studio's **Portable widgets** panel
and TikTools' Widgets page, import the same **compiled package folder**. Do not
import the unbundled development sources. Acknowledge trust by choosing the
package yourself. Settings and supported layer layouts export/import as portable
project JSON with a pinned widget id/version. Assets stay in that package.

In Studio select a universal instance before using “Save portable project to
selected widget”. The save is revision guarded. The existing auto-publish policy
applies; with auto-publish disabled, Build/Publish applies it to the live source.
`widgets.portable.get` and
`widgets.portable.set` are available through the existing offline command/Studio
service; they are not remote receiver operations. Legacy HTML remains on the
original editor path. Unsupported capabilities and incompatible versions fail
with a diagnostic; `migrateManifest` returns an explicit warning for opt-in legacy
conversion and never overwrites the old runtime.

## Pair an external producer

Installed users can use **Pair local app** in the OBS widget dock. Enter a
producer name and explicitly choose whether it may forward the listed TikTok
types. Copy the token from the masked token dialog into that application's
credential storage. Pairing the same name again rotates its credential;
**Revoke local app** revokes the selected producer. Enable the receiver
separately. This native workflow requires no Node or other toolchain.

The following script is an alternative for external application developers:

Stop OBS while using the local pairing utility so its in-memory configuration
cannot overwrite an administrative edit. Substitute the actual plugin config
directory selected by your OBS installation:

```powershell
node web/universal/tools/pair.mjs pair C:/path/to/plugin/settings.json myapp C:/private/myapp-token.txt
```

The utility creates a 256-bit token in a new credential file, stores its SHA-256
verifier, and grants only read/publish of `custom.alert` for 90 days. It refuses
to overwrite a credential and never prints it. Keep credential files in your
private user directory (owner-only permissions on Unix; a private user ACL on
Windows). Start OBS and enable **External events (local)** in the widget dock;
choose a free port, default 17453. Pairing alone does not enable the listener.

Load the private token into the producer environment and send:

```powershell
$env:OBS_EVENT_TOKEN = (Get-Content C:/private/myapp-token.txt -Raw).Trim()
node web/universal/tools/publish.mjs
node web/universal/tools/publish.mjs web/universal/fixtures/custom.alert.json
```

The publisher is an **external development example**. The shipped plugin uses
native C++/Qt, and producers can use any HTTP/WebSocket client. POST JSON to
`http://127.0.0.1:17453/v1/events` with `Authorization: Bearer <token>` and
`Content-Type: application/json`. The envelope is described in
`web/universal/schemas/event.schema.json`; `custom.alert` requires `data.title`
and accepts `data.message`. Source is assigned server-side. IDs must remain
stable across retries; timestamps are UTC ISO8601 with optional three-digit
milliseconds. The service never interprets payloads as scene commands.

`pair.mjs rotate SETTINGS PRODUCER NEW_CREDENTIAL_FILE` revokes previous tokens
for that producer and creates a replacement; `pair.mjs revoke SETTINGS PRODUCER`
revokes them without issuing another. Restart OBS after file administration.
The dock's enable/port changes take effect during the running session. Disabling
the receiver closes its connections without stopping native TikTok dispatch.

## Routes and errors

| Route | Authorization / result |
|---|---|
| GET `/v1/health` | Minimal `{ok,version}`, no credentials or inventory |
| GET `/v1/events/types` | `read`, paired type list and protocol version |
| GET `/v1/metrics` | `read`, counters only; no tokens or event payloads |
| POST `/v1/events` | `publish`, 202 accepted or 200 duplicate |
| POST `/v1/events/batch` | `publish`, 1–64 envelopes, ordered per-item status results |
| GET `/v1/ws` | Bearer header checked **before upgrade**, no browser Origin |

WS text frames contain the envelope itself, with `{status,result,id}` or
`{status,error}` acknowledgments. Text fragmentation and ping/pong are supported;
binary frames, extensions and oversized frames are rejected. No token in URLs.
Read streams, remote inventory and scene control are intentionally not exposed.
Administration is local file administration, not an extra network permission.

Errors: 400 malformed request/JSON; 401 missing, revoked or expired token; 403
scope/namespace/origin/Host denial; 413 body too large; 415 non-JSON content;
422 invalid schema, loop, unregistered type or invalid batch; 429 producer quota;
503 dispatcher full/stopped. Limits: 64 KiB request/message, 8 KiB headers, 32
clients, 5-second incomplete HTTP deadline, up to 600 events/sec per paired
producer (default 60), 2048 queued OBS events, bounded duplicate cache. Batch 200
is not all-or-nothing: inspect each item's status. Delivery acknowledgment means
enqueue, not guaranteed visual presentation. Producer queues are not persisted.

## Enable the optional TikTools bridge

Use the existing Event Gateway plugin; no second TikTools server is introduced.
Pair a separate `external.tiktools` producer in OBS. Local administration must
explicitly grant `trustedTikTok: true` and the exact canonical event names to
forward (for example `tiktok.gift`, `tiktok.chat`, `tiktok.follow`, `tiktok.like`).
No ordinary `custom.alert` credential can impersonate native TikTok.

In the gateway settings, configure:

```json
{"obsBridge":{"enabled":true,"address":"127.0.0.1:17453","tokenEnv":"OBS_EVENT_TOKEN","instance":"tiktools.local"}}
```

Start TikTools with the paired secret in that environment variable. It is never
saved into gateway settings, a widget URL, browser state or logs. The bridge
negotiates protocol 1, subscribes to the existing `live.event` fanout, preserves
upstream room/message IDs, maps payloads, adds origin/hop metadata, and retries
with bounded exponential backoff and a 256-entry pending queue. It rejects OBS
origins and oversized messages. Auth/namespace rejection stops forwarding until
configuration is repaired and the gateway restarts. Stopping TikTools has no
effect on OBS's receiver or native connection. Gateway GET `/obs-bridge/status`
requires its full gateway credential and reports delivery/rejection/duplicates/
drops/reconnects/queue depth.

Native/bridge deduplication is exact when both observe the same upstream room,
message ID and normalized type. Missing/zero upstream IDs fall back to producer
IDs, so independently generated messages cannot be guaranteed identical. The
native legacy channels retain their delivery even when the canonical event was
first observed through the bridge. No additional gift-count deltas are inferred.

## Preview and platform behavior

Portable panels accept synthetic alerts and JSON fixture arrays without LIVE or
production credentials. Fixture replay stays in their selected frame. Published
native preview uses the existing session/source/origin-validated Playground path.
The reference package adapts those local legacy preview events into canonical
ones; it does not send fixtures to the receiver. HTML text uses `textContent`.

Use numeric `127.0.0.1` or `[::1]`; IPv4 and IPv6 listeners are separate. Remote
binding is unsupported. Windows firewall/profile policy, macOS app permissions,
or sandboxed Linux/Flatpak networking may deny loopback; choose a reachable local
port and check `/v1/health`. Port conflicts fail without changing the native
connection. Never fix connectivity by binding to `0.0.0.0`, disabling auth or
exposing this service through a tunnel. Shutdown closes listeners and clients
before the native queue drains. Preview packages are trusted author code, not a
hostile-template isolation guarantee.

See [architecture decisions](architecture/universal-widget-adrs.md),
[verified discovery](architecture/current-state.md), and
[implementation evidence](architecture/implementation.md).
