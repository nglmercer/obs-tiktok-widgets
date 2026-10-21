# Current compact-design evidence

The latest target is editing in an actual **480×480 window**, with repeated controls removed. See the [focused result and recording](compact480/README.md). The wider-screen and 320px walkthrough below was also recaptured against the current UI on 2026-10-21. See the [screenshot inventory](../../SCREENSHOTS.md).

# Composition usability evaluation

Executed on Linux with Chromium and the real native `widgetctl` / `widgetstudio`
helpers, using a fresh temporary plugin configuration. The walkthrough created its
composition through the gallery, not through preseeded test data. Playwright drove
visible controls. Screenshots were visually inspected in addition to assertions.
No production user's projects or OBS scenes were changed.

**Result: 14/14 automated checkpoints passed; zero browser script errors.**
This is an engineering evaluation with **zero human participants**, not proof that
first-time users will find the product intuitive. Step timings in `results.json`
are automation timings, not human task-completion measurements.

- [Illustrated user guide](../../COMPOSITION_GUIDE.md)
- [Guía en español](../../COMPOSITION_GUIDE.es.md)
- [Studio recording](studio-walkthrough.webm)
- [Offline renderer recording](offline-renderer.webm)
- [Machine-readable results](results.json)

## Judgment and changes

The desktop flow is usable with a short guide. The original recording exposed
missing empty-state guidance, technical template IDs as display labels, weak panel
identification, detached checkbox labels and an incorrect “Source saved” status
while a visual draft was unsaved. These were corrected, with English/Spanish labels.
Save and Publish remain separate actions; hover/focus tooltips explain the compact controls.

Visual inspection of the 320px screenshot caught a problem the original width-only
responsive test missed: the composition editor did not use Studio's panel-switch
controls, and its canvas scale was fixed to a desktop width. Canvas/Layers/Inspector
now control the composition panels, with an explicit Inspector interaction check;
the canvas responds to its available width and height through ResizeObserver.

The walkthrough also established that reload already reopens the project from its
URL. Choosing another project requires **All widgets**. The guide documents that
actual behavior rather than implying that clicking My Widgets closes the editor.

Remaining friction:

| Area | Assessment |
| --- | --- |
| Finding compositions | Moderate: still inside Templates / My Widgets; no dedicated Compositions navigation |
| Empty canvas | Improved: visible add-widget guidance; samples still require Simulate composition |
| Selecting and positioning | Desktop pointer + numeric Inspector worked; Undo restored the starting position |
| Saving versus publishing | Clearer hint and correct dirty status; three distinct Save/Build/Publish actions still require learning |
| Small screens | Panel controls now work and fit the canvas; large overlays become tiny and still need zoom/pan |
| Detailed configuration | Several properties remain technical and per-instance advanced editing is incomplete |
| OBS setup | Requires explicit local IPC enablement; actual scene placement was not evaluated here |

No usability score or improvement percentage is claimed. A subsequent human study
should ask first-time users to complete the same tasks without coaching and record
where they hesitate or need assistance.

## Evidence frames

| Checkpoint | Frame |
| --- | --- |
| Find the Composition template | [01](01-find-composition-template.png) |
| Create an empty composition | [02](02-create-empty-composition.png) |
| Add and position Chat and Gifts, retaining unsaved drafts | [03](03-add-chat-and-gifts.png) |
| Simulate local chat and Rose ×23 | [04](04-simulate-without-tiktok.png) |
| Select, drag and undo | [05](05-select-drag-and-undo.png) |
| Hide/show and lock/unlock | [06](06-visibility-and-lock.png) |
| Save author settings | [07](07-save-draft.png) |
| Publish and verify the stable release pointer | [08](08-publish.png) |
| Reload, return to the gallery and reopen | [09](09-reopen-saved-composition.png) |
| Fit a 320px viewport without document overflow | [10](10-mobile-320.png) |
| Open and reach the mobile Inspector | [11](11-mobile-inspector.png) |
| Use Spanish on mobile | [12](12-spanish-mobile.png) |
| Use Spanish on desktop | [13](13-spanish-desktop.png) |
| Render the published local file offline after Studio stops | [14](14-published-renderer-studio-closed.png) |

The final renderer had two ready instances, accepted two locally injected fixture
events, and reported no rejected events, mount/handling errors or queue overflow.
Those fixtures were sent only to a disposable Chromium page, never the native OBS
dispatcher. Video records page viewports; no network trace or authoring session
credential is included. Recordings can be paused alongside the illustrated guide.

## Manual OBS acceptance checklist — not executed

Use a disposable OBS profile and scene collection, not a live stream:

- Enable the plugin's authenticated local CLI/IPC access explicitly.
- Follow the guide to publish a two-widget composition and add it to a scene.
- Confirm one Browser Source shows both independent instances.
- Repeat Add to scene; confirm it does not create a duplicate placement.
- Add the composition to another scene and verify source identity/scene transforms.
- Exercise real in-process obs-browser event delivery through an explicitly chosen
  integration-test action; verify each intended widget visually.
- Close Studio; reload/switch scenes and confirm the published source still works.
- Save an edit without publishing; verify production stays unchanged.
- Publish and verify matching-source refresh without changing scene transforms.
- Introduce an invalid author build and verify the previous release stays visible.
- Restart OBS; verify source persistence, startup ordering and event delivery.
- Check audio/autoplay and shutdown cleanup separately.

Real OBS/CEF, live TikTok traffic, audio, restart/scene switching and Windows/macOS
were **not** validated by this Playwright run. Chromium screenshots and successful
native commands must not be treated as that evidence.

## Reproduce

```sh
npm run build
WIDGETCTL=build_compositor/widgetctl WIDGETSTUDIO=build_compositor/widgetstudio PLAYGROUND_BROWSER_EXECUTABLE=/path/to/chrome npm run test:composition-guide
```

The native helpers must be built first. Set `COMPOSITION_GUIDE_OUTPUT` for a separate
artifact directory. The script fails rather than silently skipping unavailable
prerequisites, cleans up its temporary configuration/helper and writes `results.json`.

## Earlier regression checks executed after the usability changes

- Full web/browser suite with configured native helpers and Chromium: **43 passed,
  zero failures/skips**.
- Native plugin/helper build and CTest: **11 passed**, including the 280px Qt test.
- Frontend build and TypeScript checks: passed.
- Formatting and English/Spanish catalogs: passed (**455** matching keys).
- Generated asset determinism: passed (**145** files).
- `git diff --check`: passed.

The new guide and its recordings/frames are included in CMake documentation
installation. These checks still do not establish real OBS/CEF acceptance.

## SVG controls and tooltip follow-up

Composition actions now use the shared SVG button/tooltip component, including
simulation, Add, Undo/Redo, Save, Duplicate and Delete. Undo/Redo are icon-only;
primary actions retain visible labels. Layer headings and lock/visibility states
also use decorative SVGs. Screen-reader button names remain localized.

Playwright verified hover and keyboard-focus titles and `aria-hidden` on decorative
SVGs. The [hover frame](hover-undo-title.png) and updated Studio video show the result.
The recorded 14-step walkthrough passed again with zero page errors.

A concurrent full-suite run hit two pre-existing short-timer checks (custom-frame
mount error versus its 20ms test timeout, and native atomic-save debounce). These
are not reported as a passing concurrent run. The complete suite was rechecked
sequentially with the freshly built native fixture binary.

Sequential follow-up: 42 tests passed; the CLI formatting check failed because the
standalone `node --test` command lacked npm's `node_modules/.bin` PATH. Rerunning
that CLI test with the development-tool PATH restored passed. Thus every test
passed on recheck, while the concurrent timing failures above remain documented.
Build, typecheck, formatting, 456-key localization validation and 145-file generated
asset determinism also passed for the SVG changes.

## Screenshot refresh — 2026-10-21

The 14-step walkthrough and hover frame were recaptured with updated recordings.
All 14 checkpoints passed with zero browser errors. The focused 480×480 editing
check was also rerun to refresh its two frames and recording. This refresh does
not claim a new full-suite or real OBS/CEF acceptance run.
