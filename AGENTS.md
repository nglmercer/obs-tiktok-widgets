# OBS TikTok Widgets

For widget authoring, read `skills/obs-tiktok-widget-author/SKILL.md`. Agents without custom skill support use `docs/AGENT_WORKFLOWS.md` and `docs/WIDGETCTL.md`.

Instance author files live only in `projects/<uuid>/src` and `assets` under the selected plugin config directory. Use widgetctl or the shared C++ project services with revision preconditions. Do not customize instances by editing packaged `data/web`, stable `widgets/<uuid>/index.html`, runtime releases/dist, or preview output.

Repository development sources are in `web/runtime`, `web/templates` and `web/playground`. Regenerate `data/web` with `npm run build`; `node tools/check-generated.mjs` verifies determinism in a temporary tree. Build does not format author files. Never silently change/move/delete user source or external assets during generation or restore.

Keep one TikTok connection, the v1 DOM envelope, uint64 strings, cumulative gift totals and the in-process OBS bridge. Preview fixtures remain local to the preview frame. No HTTP/WebSocket servers or credentials are required. Local IPC is explicit opt-in and per-user authenticated. Custom templates are trusted code, not a hostile-code sandbox.

Run available web/native/browser tests and report actual OBS/CEF evidence separately. Do not claim unrun OS or live tests passed. Work on the current open PR branch and do not merge without explicit approval.
