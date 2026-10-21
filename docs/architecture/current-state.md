# Verified discovery — 2026-10-20

Both working trees were clean at discovery. Neither repository has `.codegraph/`.

| Area | OBS TikTok Widgets | TikTools |
|---|---|---|
| Discovery / packages | `src/templates/TemplateRegistry.cpp`: immutable id/version templates, ZIP import/export, path and checksum checks. Existing schemas **already use versions 2 and 3**. `src/projects/WidgetProjectService.cpp`: revision guarded author projects, snapshots, publication. | `src/widgets/sdk/templates.ts`: compiled Vue catalog, five standalone Vite entries. No general HTML package importer in the existing catalog. |
| Execution | `src/widgets/WidgetManager.cpp`, `src/obs/BrowserSourceManager.cpp`: published local HTML in OBS browser sources. `web/runtime/renderer.js`, `web/sdk`: browser runtime; no Node runtime dependency for static widgets. | `src/widgets/sdk/WidgetHost.vue`: template controller lifecycle, Vue render, preview samples and optional test hook. `src/widgets/shared/widget-runtime.ts`: authenticated gateway client. |
| Editor | `web/studio/features/useStudioProject.ts`: one project controller; `drafts.ts`: per-file revision/draft merge; `Inspector.tsx`: JSON-schema settings; Canvas/Layers use declared visual bindings. | `src/web/components/WidgetStyleEditor.vue`: template-driven style inspector, layers, preview, bounded undo; `widgets-editor/history.ts`. No arbitrary HTML/JSX round trip. |
| Events | `src/core/EventNormalizer.cpp`: v1 DOM envelopes, string uint64 IDs, cumulative gifts; `EventDispatcher.cpp`: bounded queue and room/method/messageId dedup; `BrowserEventBridge.cpp`: **in-process** obs-browser vendor emit, `tiktok:event` and `tiktok:*`. | `crates/tiktools-core/src/events.rs`, `plugin_events/fanout.rs`: domain bus; `src/widgets/shared/event-types.ts`: `{topic,data}` gateway envelope, original `data.msgId` identity. |
| Transport | `src/projects/WidgetLocalIPC.cpp`: opt-in authenticated per-user IPC. `src/studio/StudioServer.cpp`: explicitly launched authenticated ephemeral loopback HTTP authoring server. Neither is an external event receiver. | `examples/event-gateway-process-plugin/src/gateway`: optional Rust gateway, default **17452**, explicit origins, separate widget/admin credentials, HTTP/WS; 256-event broadcast and 64-client bounds. |
| Persistence | `src/core/PluginConfig.cpp`: plugin `settings.json`; projects/source, assets, immutable runtime releases and migration backups below plugin config. | `crates/tiktools-core/src/paths.rs`, `persistence.rs`; gateway per-plugin settings via SDK data directory. URL fragments carry widget credentials, never query strings. |
| Tooling | C++20, Qt6 Core/Network/Widgets, CMake/CTest, React/TS/Vite tooling, Node tests, Playwright; `tools/check-generated.mjs` verifies packaged assets. | Rust workspace plus separately built gateway example; Vue/TS/Vite, Bun tests, Playwright, generated Rust/TS automation contracts. |

## Gaps and compatibility decisions

The proposed v3 name collides with OBS's existing v3 template format. Universal manifests therefore require `contract: "universal-widget"` as well as `schemaVersion: 3`; existing unmarked templates retain their exact meaning. Static packages use `src/` entries, `schema/`, `assets/`, `presets/`, and precompiled JavaScript to fit the established safe package layout.

The first integration is additive: common schemas/runtime/editor commands, a separate disabled-by-default receiver on configurable 17453, and forwarding in the existing TikTools gateway. External publishing is independent from scene placement and the authoring IPC. No event receiver invokes WidgetCommands or OBS administrative APIs.

Highest migration risks: v3 ambiguity; differences between TikTools camelCase domain data and native OBS data; upstream IDs absent or zero; native versus domain gift totals; editor capabilities that cannot represent arbitrary source; package trust (existing templates execute author code); cached generated web assets; credentials in user settings. Preserve original event payloads and native channels; capability failures are explicit, never silently coerced. Dedupe can only match both producers when upstream room/message identity is available.

## Baseline limitations

This checkout initially has no installed JS dependencies, Qt/CMake on PATH, or running OBS/CEF evidence. Tests and native build availability are recorded separately in `implementation.md`; source inspection does not establish live acceptance.
