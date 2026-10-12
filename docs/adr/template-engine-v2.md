# Template Engine v2

Status: implemented on PR #1, based on inspected open HEAD 44788e5.

Templates are immutable versioned packages discovered from shipped/user manifests. Projects own editable src/assets and settings. The C++ project service is shared by WidgetManager, the Qt editor, watcher, and widgetctl; OBS integration stays in the plugin. No Node is required to render/build plain projects. Optional Node syntax validation runs offline without executing author scripts.

Builds validate and copy a bounded, symlink-free project tree into an immutable runtime release. Head bootstrap preserves the author document and loads public configuration before the renderer. A single atomically replaced compatibility HTML file at widgets/<uuid>/index.html redirects to the chosen release. Existing OBS source UUIDs and paths do not change. Failed builds do not update that pointer. Preview uses the same release with its own bootstrap, local event bus, and session handshake.

Revision tokens combine monotonic metadata revision and source content hash: they detect edits made outside the UI/CLI. Cross-process mutation uses QLockFile. Source deletion explicitly tombstones metadata and retains projects/history; only generated runtime/cache releases may be collected. Migration backs up legacy state and preserves unknown/missing templates; external custom/editable locations are not recursively copied or deleted. Relative dependency import is explicit and bounded.

Local IPC is off by default, uses QLocalServer user permissions and a per-user random token, and exposes an allowlist without connection/session settings. OBS operations run on the Qt thread. Publish notifications refresh only sources with the matching widget UUID. Playground checks a local script pointer for updates without HTTP/WebSocket services.

Real CEF validation found that OBS routes local pages through http://absolute and refreshes the current redirected release. Generated links stay relative. Targeted Browser Source recreation uses one replaceable inert CSS nonce while keeping the authored CSS and original local_file setting. No additional event transport or parent-page renderer is introduced.
