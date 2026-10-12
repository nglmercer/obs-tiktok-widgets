# Studio v4 authoring

Discover installed static templates with widgetctl; create a project and read its revision before editing HTML/CSS/JavaScript. Installed users need no Node, npm, TS compiler or React installation. Do not run `builders install` or introduce framework requirements. Legacy projects and releases are preserved; do not silently convert or delete them.

Open the explicitly authenticated Studio adapter. The controller/draft manager owns project state; language/theme preferences do not change source/config revisions. Use Files/Preview/Inspector panel switching on narrow viewports. A published release initializes preview automatically; unsaved drafts are never published. Save source/settings, Validate, Build, then Publish explicitly unless the user enabled auto-publish for saved source.

External saves refresh clean buffers. Dirty buffers retain base/local/remote: compare, reload explicitly, preserve a draft, or merge non-overlapping changes. Reread revisions after conflicts; never blindly retry. History rollback restores source and requires publication to affect OBS. Format only author files, preserving CRLF and relative assets.

Visual edits require declared x-visual bindings; no arbitrary DOM/JSX reverse compilation. Preview Fit/zoom, pointer gestures, resize and keyboard nudging modify settings only. Unknown custom HTML remains editable in Code. Test the isolated Viewer123 Rose ×23 fixture and cumulative 1→5→23 without production broadcasts.

Check English/Spanish labels, hover/focus tooltips, theme/viewport, external-save conflicts and keyboard menus. Machine event names, IDs, paths and JSON keys stay unchanged. Standalone file previews use browser-local preferences; only the opt-in authenticated adapter shares native preferences. Never obtain OBS/TikTok credentials for a preview.

Get authorization for OBS scene placement/removal and destructive operations. Verify matching sources refresh and unrelated sources stay unchanged using a disposable OBS profile. Report actual OBS/CEF evidence separately from Chromium and native unit tests. See docs/UI_V4.md and docs/VALIDATION.md for exact results and limitations.
