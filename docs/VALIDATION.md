# Executed validation and remaining acceptance checks

Development platform: CachyOS Linux x86_64, GCC 16.2.1, installed Qt6, OBS 32.2.2 SDK extracted into /tmp/widgets-obs-sdk (OBS application was not installed), pinned Rust source at 886157c10350c7def971f782451462db72bc0007.

Executed successfully:

- `cargo build --release --locked -p ttl-live-native`: Rust native shared library.
- CMake configure and full native plugin compile/link using the extracted OBS SDK.
- CTest: four suites (events, connection-lifecycle, widget-config, bridge-api).
- Native event decode fixture with uint64 max ID; retained unknown data; FIFO, bounded queue, dedup and shutdown diagnostics; 10,000 enqueue/drain iterations.
- Connection manager concurrent requests and cancellation with a fake transport, asserting maximum one live client and zero after shutdown.
- Real upstream `cargo test --locked -p ttl-live-native`: four callback/lifecycle unit tests plus seven ABI/decoder fixture tests.
- TypeScript compiler and esbuild browser/ES module builds.
- Eight JavaScript checks: SDK subscription cleanup/state/version handling; all six renderers using a minimal deterministic DOM harness; safe text, independent filters, cumulative gift streaks, precise likes, viewer coalescing.
- CMake install staging and ZIP archive generation (see generated release artifact).

The bridge suite invokes the real obs-websocket API header through OBS proc handlers, validates CallVendorRequest and nested object event_data, generic/typed dispatch, response freeing, and explicit missing integration failure. The vendor callback is mocked. This is not a real obs-browser/CEF integration test.

Still incomplete:

- Launch OBS with the installed dock and native library on a desktop.
- Disable the network WebSocket server; verify the real obs-browser vendor probe succeeds.
- Add at least two Browser Sources plus a custom HTML source; generate fixture events and verify parsed event.detail on generic and typed subscriptions across all three.
- Verify widget changes refresh real browser pages, source duplication/deletion, scene switching, and full OBS restart restoration.
- Verify a real public TikTok LIVE room using guest bootstrap and optional account session.
- Verify follow display keys and gift streak artwork/sound against live traffic.
- Measure real OBS responsiveness, sustained event delivery latency/overflow and resource growth across repeated connection cycles. Current queue stress is deterministic correctness work, not a full production load/leak benchmark.
- Execute Windows/macOS workflows and inspect installed DLL/dylib resolution; sign/notarize macOS releases.

These are release gates. No live TikTok or real multi-source CEF success is claimed. CI definitions alone are not evidence of a platform build.
