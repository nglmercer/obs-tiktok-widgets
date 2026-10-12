# widgetctl API 1

`widgetctl` is a C++ executable installed by CMake, sharing the plugin's `widget-domain` library. It needs Qt Core/Network and zlib, not Node. Select `--config DIR` (or `--profile DIR`, a plugin-config directory, not an OBS profile name) and `--assets DIR` when multiple installations exist. The default config is `$XDG_CONFIG_HOME/obs-studio/plugin_config/obs-tiktok-widgets`; default assets resolve beside the installed plugin or its installation prefix. For this repository use `build/widgetctl --config /tmp/my-widgets --assets "$PWD/data/web"`.

Every command supports `--json`; domain commands always emit JSON except `files read` without that flag, which emits source text. Output: `{apiVersion:1,ok:true,data,warnings:[]}`. Error: `{apiVersion:1,ok:false,error:{code,message,details}}`. Exit codes: 0 success, 2 usage, 3 revision conflict, 4 domain/offline error, 5 unexpected failure. `--help` lists methods; `--version` reports executable/API version.

Revision tokens include monotonic metadata counter plus source/metadata hash. Use the `revision` returned by show/read/settings get as `--if-revision TOKEN`. External editor changes cause a conflict even before watcher publication. QLockFile prevents overlapping writers. A failed build leaves the previous served release intact. `--dry-run` is available for mutations and returns a plan; template/project installs also inspect and validate package contents during preview. Deletion/removing placements requires `--confirm` (or explicit `--noninteractive`). Source/history is retained when a widget is tombstoned.

## Commands

```sh
widgetctl doctor --json
widgetctl templates list --json
widgetctl templates inspect builtin.gift-alert --version 2.0.0 --json
widgetctl templates install template.tiktokwidget --dry-run --json
widgetctl templates install template.tiktokwidget --json
widgetctl templates export builtin.gift-alert --output alert.tiktokwidget --json
widgetctl templates create my.alert --from builtin.gift-alert --json
widgetctl widgets list --json
widgetctl widgets create --template builtin.gift-alert --name RoseAlert --json
widgetctl widgets show UUID --json
widgetctl widgets project get UUID --json
widgetctl widgets project set UUID --set 'events=["gift"]' --set entry=src/index.html --if-revision TOKEN --json
widgetctl widgets duplicate UUID --if-revision TOKEN --json
widgetctl widgets fork UUID --if-revision TOKEN --json
widgetctl widgets delete UUID --dry-run --json
widgetctl widgets delete UUID --confirm --if-revision TOKEN --json
widgetctl widgets settings get UUID --json
widgetctl widgets settings set UUID --set color=#ff77cc --set animation=false --if-revision TOKEN --json
widgetctl widgets files list UUID --json
widgetctl widgets files read UUID src/index.html --json
widgetctl widgets files write UUID src/style.css --from-file ./edited.css --if-revision TOKEN --json
widgetctl widgets files mkdir UUID src/nested --if-revision TOKEN --json
widgetctl widgets files rename UUID src/old.js --to src/main.js --if-revision TOKEN --json
widgetctl widgets files remove UUID src/unused.css --if-revision TOKEN --json
widgetctl widgets files format UUID src/main.js --check --json
widgetctl widgets files format UUID src/main.js --if-revision TOKEN --json
widgetctl widgets assets import UUID ./rose.png --as assets/rose.png --if-revision TOKEN --json
widgetctl widgets validate UUID --json
widgetctl widgets build UUID --if-revision TOKEN --json
widgetctl widgets publish UUID --if-revision TOKEN --json
widgetctl widgets preview UUID --event gift --user Viewer123 --gift Rose --count 23 --json
widgetctl widgets history UUID --json
widgetctl widgets rollback UUID --revision OLD_TOKEN --if-revision CURRENT_TOKEN --json
widgetctl widgets export UUID --output project.tiktokwidget --json
widgetctl widgets import project.tiktokwidget --dry-run --json
widgetctl widgets import project.tiktokwidget --json
widgetctl migration report --json
widgetctl migration apply --dry-run --json
widgetctl migration apply --json
widgetctl migration rollback --dry-run --json
widgetctl migration rollback --json
widgetctl obs status --json
widgetctl obs scenes list --json
widgetctl obs sources list --json
widgetctl obs sources add UUID --scene MyScene --json
widgetctl obs sources refresh UUID --json
widgetctl obs sources capture UUID --name "OBS source name" --json
widgetctl obs scenes select --scene MyScene --json
widgetctl obs shutdown --confirm --json
widgetctl obs sources remove UUID --scene MyScene --confirm --json
```

`--set` accepts JSON primitives/arrays/objects, otherwise treats the value as a string. File operations are restricted to source/assets/presets; identity/template pins are immutable through settings. Formatting uses an installed `prettier` executable, is opt-in, and never touches output. Preview returns a file URL to open in a system browser; fixture controls initialize from the query. It uses the published release, not unsaved editor buffers. Build validates and creates a candidate release; publish validates/builds current saved source and atomically changes the stable serving entry. Rollback explicitly restores author files/settings, then publish to serve the restored version. Import conflicts get a new UUID. Project exports include pinned template definition, schema, settings and source/assets; import previews execute no author code.

## Live OBS

Enable **Enable authenticated local widgetctl control** in the Widgets dock. Local IPC is off by default. It uses a per-process Unix/domain socket or named pipe with Qt UserAccessOption, owner-only cache credentials, a random token, method allowlist, 64 KiB requests, 20 requests/second, short timeouts and a bounded audit log. The CLI reads authentication automatically; do not copy/print token files. No HTTP/WebSocket server or TikTok credentials are involved.

Only OBS placement methods cross IPC. The Qt UI thread executes scene/source operations; offline authoring uses the same C++ service and registry lock. With OBS stopped or IPC disabled, live operations return OBS_OFFLINE. Code/metadata edits remain available. Successful CLI publication is observed by the plugin watcher and refreshes sources matching that UUID. Remove with a scene removes the placement in that scene; remove without a scene removes matching OBS sources.

For Flatpak, the running application has a private local socket namespace. Use `tools/widgetctl-flatpak.sh` (installed beside widgetctl) to enter the running sandbox, or `flatpak enter INSTANCE env LD_LIBRARY_PATH=/app/lib /absolute/plugin/bin/64bit/widgetctl ...`. For offline work run `flatpak run --command=/absolute/plugin/bin/64bit/widgetctl com.obsproject.Studio --config /absolute/plugin-config --assets /absolute/plugin/data/web ...`. The installer places it next to the plugin libraries. Other OS CLI runtime-library packaging still needs platform validation; basic plugin editing does not depend on the CLI executable.

`obs.sources.capture` returns a bounded PNG data URL through the existing in-process OBS screenshot API. It needs no WebSocket server. Scene selection and confirmed graceful shutdown support isolated acceptance/restart tests. Shutdown is always opt-in with `--confirm`.

Custom projects declare supported event types explicitly with `widgets project set --set 'events=["gift"]'`. The custom starter declares no handlers; Playground reports unsupported combinations until declarations are saved. This changes project metadata, not author source. The editor exposes the same event declarations and entry selection.

## Studio/builders (API 1 extensions)

`builders status --json` reports installed tooling and Node availability. `builders install --confirm --json` explicitly installs the shipped pinned toolchain with lifecycle scripts disabled; `--dry-run` reports without fetching. `studio start --confirm` launches the installed widgetstudio adapter and returns an ephemeral browser URL, keeping the local service running. Its URL is a credential; do not share it. Existing create/files/revision/build/publish/preview commands work with schema-v3 TypeScript/React templates. Vue/Svelte, unapproved dependencies/plugins/config and modified policy locks return errors. See [Studio v3](STUDIO_V3.md).
