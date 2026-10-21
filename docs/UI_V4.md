# Widget Studio v4

Installed users edit **HTML, CSS and JavaScript**. The plugin ships compiled Studio, Playground and built-in templates; Node, npm, TypeScript, React installation and a development server are unnecessary. React/TypeScript/Vite remain repository development tools.

## Workspace and publication

The compact navigation opens Templates, My Widgets, Live Events, Assets and Settings. Gallery cards retain real thumbnails, descriptions and category filtering. Source files are grouped into searchable folders. Design and Code share the same project controller and draft manager. Files, Preview and Inspector have independent scroll areas; smaller screens switch contextual panels instead of stacking a fixed-height editor. The preview starts automatically **only when a published release already exists**. Studio's adapter rejects preview requests for unpublished projects and never publishes a draft implicitly.

Save commits author source/settings using the captured revision. Build validates a candidate. Publish atomically applies the candidate and refreshes matching OBS sources. An explicitly enabled auto-publish preference still applies to saved source; an unsaved browser draft never triggers it. Failed builds retain the working release. Per-file drafts survive navigation and browser reload; external saves refresh clean buffers and retain dirty base/local/remote conflicts. History restores author source separately from publication.

The source controller lives in `features/useStudioProject.ts`; shell/navigation, gallery, file explorer, source editor and project workspace are focused UI modules. They do not introduce another project store. Shared UI primitives cover status, empty states, search, disclosures, contextual menus, preferences, dialogs and actions. Action IDs remain machine values and labels/tooltips are localized separately. Keyboard users can open a menu with Enter, navigate with arrow keys and close with Escape. Icon-only controls retain accessible names and focus tooltips.

Design changes only properties declared by `x-visual` metadata; custom HTML without bindings remains code-editable. Preview Fit scales the published viewport to the available width, with explicit zoom/grid options. Pointer gestures create a single undo checkpoint; keyboard nudging and resize use declared bindings. No DOM/JSX reverse compilation occurs. Inspector appearance controls preserve unknown settings and expose multiline CSS/HTML, color, range/number, event filters and asset/audio inputs.

## Appearance and languages

Studio and standalone Playground share `web/shared/tokens.css` and bundled English/Spanish catalogs. Dark, light and system themes, keyboard focus and reduced motion are supported. A language/theme selector is always available. English is the fallback; `tools/check-locales.mjs` validates matching keys, placeholders and static lookups. Unknown author-provided labels fall back to their original text. Event names, JSON keys, file names, IDs, revisions and API methods remain unchanged; rendered labels alone are translated. Dates/numbers/plurals use `Intl` helpers; source/diagnostic data remains literal.

Native Qt uses the plugin-specific `TikTokWidgets` translation context and packaged `en.qm` / `es.qm`, not a replacement OBS translator. The dock has four compact primary actions—Create widget, Open Studio, Preview and Add to scene—and Manage/Project/Advanced menus. Every route uses a stable ID. Native gallery/editor and the session-owned StudioLauncher remain available. The narrow dock supports 280px and keeps connection state and diagnostics visible.

The authenticated Studio adapter's `studio.preferences.get` and `studio.preferences.set` methods share non-secret `ui-preferences.ini` with the native dock. Locale/theme are allowlisted and never include OBS/TikTok credentials. Studio reconciles preferences periodically; native language updates on the existing status tick. Preferences do not change widget themes or project revisions. The old `settings.json` locale is used as a native migration fallback. Standalone `file://` Playground stores preferences in browser storage (when allowed), accepts explicit `lang`/`theme` query preferences and does not gain filesystem/OBS IPC access. Embedded previews receive preferences through the existing source/origin/session-checked draft channel.

## Playground

The same fixture engine supplies Viewer123 sending **23 Rose**, cumulative 1 → 5 → 23 and finished/unfinished streaks. Gift-specific controls disappear for other events. Advanced identifiers, renderer options and JSON are collapsible; playback controls, loading/retry status and the bounded timeline stay available. Replay, Stop, Reset, JSON copy fallback, v1 envelopes and uint64 decimal strings are unchanged. The preview frame alone receives synthetic events; no OBS dispatcher or additional TikTok connection is involved. Opaque file origins still use mandatory source/session/payload validation where a wildcard postMessage target is required.

## Screenshots

Current Studio and Playground frames were refreshed on 2026-10-21 using Playwright and the native authoring adapter. These are actual Chromium renders, not mockups. The earlier Studio screenshot is preserved for comparison. See the [complete screenshot inventory](SCREENSHOTS.md).

| | Current UI |
| --- | --- |
| [Studio v3](studio/v4/before-studio.png) | [Studio v4 desktop](studio/v4/studio-v4-en-1440.png) |
| | [Studio v4 mobile 320px](studio/v4/studio-v4-en-320.png) |
| | [Spanish Studio](studio/v4/studio-v4-es-1440.png) |
| | [Spanish Playground mobile](studio/v4/playground-v4-es-320.png) |
| | [Spanish Playground desktop](studio/v4/playground-v4-es-1440.png) |

The current composition editor is also captured in a real [480×480 window](validation/compositions/compact480/canvas-480.png), including its [Inspector](validation/compositions/compact480/inspector-480.png).

Template artwork opens in a larger preview on hover, keyboard focus or tap. Escape, scrolling or leaving the preview dismisses it. Hovering does not execute templates or create projects. See [480px](studio/v4/template-hover-480.png) and [desktop](studio/v4/template-hover-1440.png) captures.

## Development and limitations

Run `npm ci`, `npm run build`, `npm run format:check`, `npm run locales:check`, `node tools/check-generated.mjs` and the web/native/browser tests. To regenerate native translations after a catalog change, run `node tools/package-locales.mjs --compile` (set `LRELEASE` if Qt's executable is outside PATH); `.qm` files are packaged with web resources. No translation compiler is needed by installed users. See [validation](VALIDATION.md) for exact executed checks and OBS evidence.

Trusted custom templates may contain their own untranslated text or animations; Studio does not rewrite their author source. Compiler/provider diagnostics retain original filenames, locations and technical messages, with localized surrounding UI. Browser preferences are scoped to its profile/origin; a standalone file preview cannot write native preferences without the explicitly launched Studio adapter. Preview is an author-code trust boundary, not a hostile-code sandbox. Windows/macOS behavior and platform packaging require their runners; Linux evidence must not be described as cross-platform validation.
