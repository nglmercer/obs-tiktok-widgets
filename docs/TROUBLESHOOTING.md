# Widget health troubleshooting

Open the OBS dock's Events → Widget Health section. **OBS vendor accepted** means the plugin's in-process request succeeded; it does not establish that a particular page processed an event. No live events and transparent idle overlays are normal.

A page with no reporting channel is **unobservable**, not automatically broken. Reporting is experimental and disabled by default. Legacy releases, custom CSP restrictions and unsupported CEF configurations may leave it unavailable. Do not enable the network OBS WebSocket server to repair this telemetry path. Studio is independent of production playback.

Use the existing Integration test button for a synthetic native broadcast and inspect OBS output separately. Copy sanitized diagnostics for a report. With authorized local IPC enabled, `widgetctl widgets health --json` includes bridge history and source activity while leaving page-to-source identity unmapped. A project refresh may affect multiple sources with the same UUID; verify placements before manually refreshing. Avoid global cache clearing.

Missing assets, JS/mount errors, blocked audio and font degradation have separate runtime reports when instrumentation can run. Audio/font errors do not alone prove a blank widget. A script blocked before instrumentation cannot diagnose itself; unavailable reports must remain uncertain. Failed builds retain the previous published release.

The Linux test environment displayed intentionally visible fixture output only after browser hardware acceleration was disabled in a disposable profile. This is limited evidence, not a universal fix or an automatic settings change. See [validation](VALIDATION.md) and [experimental health limitations](WIDGET_HEALTH.md) before changing an installation.
