# Universal widget decisions

All decisions below are implemented additively. Original author source, pinned
templates, project UUIDs, revisions and native TikTok channels are retained.

1. **Distribution:** `web/universal` is the authoritative versioned SDK workspace
   inside OBS, vendored into TikTools `src/universal`. `tools/sync.mjs` records
   SHA-256 hashes and checks byte identity. This avoids a sibling checkout or
   package registry requirement for either application's releases. Extract to a
   dedicated repository when both release pipelines can pin its published tag.
2. **Versions:** protocol 1, SDK 1.0.0, universal manifest 3 with the mandatory
   `contract` discriminator. Existing OBS manifest 3 is a different contract.
   Portable project 1 separates settings, layout, optional runtime state and
   timeline metadata. Unknown versions fail explicitly; migrations never rewrite
   pinned author sources automatically.
3. **Trust:** native TikTok owns `tiktok.*`. Paired producers receive exact type
   lists and independent read/publish scopes. Only explicit local administration
   may grant `trustedTikTok`. Receiver source identity is assigned from pairing;
   payload strings cannot grant privileges. No scene/control API is reachable.
4. **Transport:** HTTP is the bridge/CLI transport; WS carries one envelope per
   text message and a JSON status acknowledgment. Both share one loopback port,
   the same auth, schema validation, quotas and dispatcher. Qt Core/Network are
   sufficient; the OBS Qt distribution lacks Qt WebSockets. WS implements bounded
   RFC6455 text/continuation/control framing without compression or binary data.
   Browser Origins are refused on the producer service; browser previews receive
   events through the host adapter. There is no unauthenticated browser stream.
5. **Delivery:** FIFO enqueue acknowledgment, best effort after enqueue, no disk
   replay. HTTP 202 does not prove CEF rendered the event. Duplicate acknowledgments
   are HTTP 200. The receiver/dispatcher remember bounded identities; bridge
   retries preserve IDs and use capped exponential backoff. Original upstream
   room/message identity matches native and bridged TikTok. Without that identity,
   independently generated IDs cannot establish cross-producer equivalence.
   Native legacy delivery is retained even if a bridge event arrived first.
6. **Packages:** trusted compiled HTML/CSS/JS under the existing `src`, `assets`,
   `schema`, `presets` allowlist. No runtime compiler, arbitrary dependency resolver
   or Node/Bun in OBS. Portable import rejects paths, oversized trees, unsupported
   capabilities and unbundled module/style imports. Preview iframes use opaque
   origins and restrictive CSP; this is not a certification for hostile authors.
7. **Editors:** retain the existing React Studio and Vue style editor. Add thin
   framework wrappers over common commands, history, serialization and a small
   portable editor panel. The original source controller and per-file revision
   manager remain authoritative for OBS author files. Only supported portable
   layouts round-trip; arbitrary HTML/JSX does not become editable component data.
8. **Pairing:** explicit local pairing utility, hashed token verifiers, expiry,
   rotation and revocation in plugin config. The TikTools bridge reads the secret
   from a named process environment variable, never from browser storage. Default
   receiver port 17453 differs from the verified gateway port 17452; conflicts
   fail visibly, never fall back to a public address. Receiver and gateway can
   bind numeric IPv4/IPv6 loopback; remote publishing is deliberately unsupported.
9. **Release:** source SDK and compiled demonstrator are versioned local release
   artifacts. Existing template/project ZIP controls remain in use for native
   installation. Portable browser import uses the same compiled package folder;
   portable project JSON references its exact widget id/version. Publication to
   Git/npm or installation into a user's OBS profile is a separate release action.

## Schema compilation

`web/universal/tools/generate.mjs` defines draft-07 schema data and generates the
JSON schemas and C++ embedded constants. JS, C++ and Rust validate that same data.
The portable execution vocabulary supports scalar types, objects/properties/
required/additionalProperties, homogeneous arrays/items, local references,
const/enum, lengths, unique items, patterns and inclusive numeric bounds.
Settings schemas using other assertion keywords or external references fail
registration rather than silently weakening validation. Descriptive annotations
and `x-*` editor metadata are retained. Use portable regular expressions (no
engine-specific lookbehind/backreferences). Native legacy schemas keep their
existing validation behavior.

Shared mapping tables normalize gifts, chats, follows and likes across the native
and TikTools field conventions. Counters and identities are decimal strings;
gift repeat counts remain cumulative. Original data remains in `metadata.legacy`.
Additional trusted native types retain their payload and can gain versioned
mapping tables later. External nonstandard types require an explicit local
`payloadSchemas[type]` registration in addition to the producer permission.
