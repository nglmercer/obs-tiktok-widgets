---
name: obs-tiktok-widget-author
description: Discover, author, validate, preview, publish, and manage OBS TikTok widget projects through widgetctl. Use for this plugin's templates and instances, not generic OBS configuration or TikTok account access.
---

Use the installed `widgetctl` or the repository's configured build executable. Select `--config` and `--assets` explicitly when working across multiple OBS installations. Run `doctor --json`; discover templates/instances before choosing an ID.

Read [CLI and project lifecycle](references/cli.md) for operations and errors, [manifest and event contract](references/contracts.md) for author code, and [troubleshooting](references/troubleshooting.md) for failures and offline OBS.

Create from a discovered pinned template. Read the project's current revision and source files. Use `widgets files write ... --from-file ... --if-revision TOKEN` and `widgets settings set ... --if-revision TOKEN`. Handle `REVISION_CONFLICT` by rereading and merging; do not retry blindly. Source is under `projects/<uuid>/src`, with imported assets under `assets`. Never edit `data/web`, packaged templates, `widgets/<uuid>/index.html`, or runtime releases to customize an instance.

For custom code, declare supported types and entry with `widgets project set ... --set 'events=["gift"]' --set entry=src/index.html --if-revision TOKEN`; the custom starter intentionally declares none. Validate, build, and preview isolated synthetic Viewer123 ×23 Rose. Publish with a revision precondition; verify the returned output and build ID, then inspect `obs sources list` and refresh only the chosen instance where IPC is enabled. Auto-publish is optional; saving settings/source and explicit publishing are separate operations. Failed builds retain the served release; fix the author source and retry.

Use export/import previews for transfer. Duplicate/fork creates independent mutable sources. Inspect history before rollback; rollback restores source, then publish to apply it. Deletion requires user intent and `--confirm`, retains project/history, and does not remove external files. Do not remove OBS placements without authorization.

OBS IPC is opt-in, authenticated, per-user, local-only, and limited to placement operations. Do not read its token or print private configuration; use the CLI normally. `OBS_OFFLINE` permits offline authoring, not UI scraping or a new network transport. Templates are trusted code; iframe permissions do not sandbox hostile authors. Playground events must never enter the OBS dispatcher. Never expose connection cookies, signing/session data, credentials, or secrets in widget settings or source.
