# Troubleshooting

- REVISION_CONFLICT: reread source/settings and reconcile; preserve human edits.
- MISSING_ASSET / UNSAFE_PATH / UNSAFE_RESOURCE: check relative references and import the exact required asset under assets. Do not copy arbitrary external directories.
- JS_SYNTAX / CSS_SYNTAX / HTML_SYNTAX: fix author code. The current served release is retained. Node syntax checking is optional; C++ CSS checking catches unbalanced blocks/strings/comments, not every CSS semantic error.
- FORMATTER_UNAVAILABLE: install Prettier for opt-in formatting or use an external editor. Source build works without it.
- OBS_OFFLINE: select the correct configuration and enable local widgetctl control in the plugin dock if authorized. No WebSocket password or TCP server is needed.
- TEMPLATE_NOT_FOUND: inspect template diagnostics/install the pinned version. Existing project source and served output remain intact.
- Migration errors: inspect migration.report and cache/migration-v1/report.json. Original widgets.json and referenced user files are backed up and retained. Use migration.rollback --dry-run before explicit rollback.
