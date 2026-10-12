# OBS TikTok Widgets

For widget authoring, read `skills/obs-tiktok-widget-author/SKILL.md`. Agents without custom skill support use `docs/AGENT_WORKFLOWS.md` and `docs/WIDGETCTL.md`.

Instance author files live only in `projects/<uuid>/src` and `assets` under the selected plugin config directory. Use widgetctl or the shared C++ project services with revision preconditions. Do not customize instances by editing packaged `data/web`, stable `widgets/<uuid>/index.html`, runtime releases/dist, or preview output.

Repository development sources are in `web/runtime`, `web/templates` and `web/playground`. Regenerate `data/web` with `npm run build`; `node tools/check-generated.mjs` verifies determinism in a temporary tree. Build does not format author files. Never silently change/move/delete user source or external assets during generation or restore.

Keep one TikTok connection, the v1 DOM envelope, uint64 strings, cumulative gift totals and the in-process OBS bridge. Preview fixtures remain local to the preview frame. No public HTTP/WebSocket server or WebSocket credentials are required for widget playback or the TikTok connection. Studio may use its explicitly launched, authenticated loopback authoring adapter. Local IPC is explicit opt-in and per-user authenticated. Custom templates are trusted code, not a hostile-code sandbox.

Run available web/native/browser tests and report actual OBS/CEF evidence separately. Do not claim unrun OS or live tests passed. Work on the current open PR branch and do not merge without explicit approval.

Studio sources are in web/studio; shared action metadata in web/shared/actions.json. Framework builder policy/runner lives in web/builder. Only explicitly consented pinned tooling may be installed; builds are offline and must not read author Vite configs, execute install scripts, expose IPC credentials or bypass project revision checks. Read docs/STUDIO_V3.md and the skill's references/studio.md for typed SDK/build/preview acceptance. Do not advertise arbitrary DOM/JSX round-trip or hostile-template isolation.

Studio regression work: preserve per-file draft bases and revision preconditions, and invalidate stale asynchronous reads after navigation or commits. Only declared x-visual bindings may drive design edits. Draft preview settings must stay inside the source/origin/session-validated local preview channel. Keep pinned starter versions intact when adding new visual behavior.

User authoring is plain HTML/CSS/JavaScript with zero Node/compiler prerequisites. Do not ship framework source starters or offer toolchain installation. Framework code is development-only; preserve legacy projects and published releases.
