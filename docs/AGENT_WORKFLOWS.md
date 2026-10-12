# Agent widget authoring

Use `skills/obs-tiktok-widget-author/SKILL.md` when skills are supported. Otherwise use this workflow with the same [widgetctl API](WIDGETCTL.md).

1. Run doctor, templates list and widgets list with --json and the correct --config/--assets. Do not guess names or paths.
2. Create from a discovered template/version. Show the UUID and read its source/settings. Preserve the returned revision.
3. Edit HTML/CSS/JS through files write --from-file --if-revision; import individual assets into assets/. Settings set accepts --set key=value and revision checks. A conflict requires rereading/merging, not forcing stale edits.
4. Validate and build. Read diagnostics; failed builds keep the previous release. Fix author code and retry. Opt-in formatting is restricted to src and requires an installed formatter.
5. Publish with a revision precondition, then preview --event gift --user Viewer123 --gift Rose --count 23. Open the returned local file URL and test completed/unfinished cumulative streaks. Never broadcast fixtures to OBS.
6. If authorized and live IPC is enabled, inspect obs scenes/sources, add/refresh the selected UUID and verify the output. OBS_OFFLINE means authoring remains available; it does not justify creating a second transport or scraping UI.
7. Duplicate/fork to create independent mutable projects. Export/import uses a checksummed package and --dry-run preview; ID conflicts fork automatically. Inspect history before rollback, then publish the restored source. Deletion and removing scene placements require user intent and --confirm.

Author sources live in projects/<uuid>/src/assets, not generated dist, stable loaders or data/web. Missing template versions or migration errors do not authorize overwriting sources or deleting external files. Templates are trusted code; no cookies, credentials, signing/session data or OBS secrets belong in public configuration. Live acceptance and platform builds must be reported honestly.
