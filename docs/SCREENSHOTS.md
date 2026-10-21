# Screenshot inventory

Current UI screenshots were refreshed on **2026-10-21** on Linux. Captures use
fresh temporary project configurations; no user projects or OBS scenes change.

| Current capture set | Frames | Reproduction |
| --- | ---: | --- |
| [Composition walkthrough](validation/compositions/README.md#evidence-frames), including SVG hover tooltip | 15 | `node tools/evaluate-composition.mjs` |
| [480×480 Canvas and Inspector](validation/compositions/compact480/README.md) | 2 | `node --test tests/widgets/composition-studio.test.mjs` |
| Studio English at [320](studio/v4/studio-v4-en-320.png), [768](studio/v4/studio-v4-en-768.png), [1440](studio/v4/studio-v4-en-1440.png); [Spanish desktop](studio/v4/studio-v4-es-1440.png) | 4 | Responsive Studio case in `tests/widgets/ui-v4.test.mjs` |
| Spanish Playground at [320](studio/v4/playground-v4-es-320.png) and [1440](studio/v4/playground-v4-es-1440.png) | 2 | Standalone Playground case in `tests/widgets/ui-v4.test.mjs` |
| [Code workspace](studio/v4/workspace-code.png), also used at [workspace-v4](studio/workspace-v4.png) | 2 copies | `node --test tests/widgets/studio-builder.test.mjs` |
| [Native Spanish dock at 280px](studio/v4/dock-spanish-280.png) | 1 | `ctest --test-dir build_compositor -R '^tabbed-dock$' --output-on-failure` |

**28 current screenshot files** were regenerated, plus three composition recordings.
An unchanged frame may remain byte-identical after capture. The native dock frame
comes from the Qt offscreen fixture, not a running OBS instance.

For browser commands set `WIDGETCTL=build_compositor/widgetctl`,
`WIDGETSTUDIO=build_compositor/widgetstudio` and
`PLAYGROUND_BROWSER_EXECUTABLE=/path/to/chrome`. Set
`UI_SCREENSHOT_DIR=docs/studio/v4` for the responsive and code-workspace cases.
Build the native helpers and run `npm run build` before capturing.

The template-hover follow-up adds [480px](studio/v4/template-hover-480.png) and [1440px](studio/v4/template-hover-1440.png) captures from the actual gallery using a temporary native Studio adapter. A focused Playwright hover/focus/Escape/viewport test passed; frontend build and 461-key localization checks passed.

## Historical evidence

The following captures remain unchanged intentionally. They document earlier
executed validations or before/after comparisons, rather than the current UI:

- `docs/studio/v4/before-studio.png`, `docs/studio/workspace.png` and
  `docs/studio/before-*.png`: earlier UI comparisons.
- `docs/studio/cef-*.png`, `docs/studio/fixes-*.png`,
  `docs/studio/preview-*.png`, `docs/studio/v4/cef-*.png` and
  `docs/studio/v4/studio-live-obs-es.png`: historical renderer/OBS evidence.
- `docs/validation/template-v2/*.png` and
  `docs/validation/widget-health/*.png`: evidence attached to earlier acceptance runs.

See [validation records](VALIDATION.md) for their original context. Real OBS/CEF
captures require a new actual OBS acceptance run; replacing them with Playwright
screenshots would misrepresent the evidence. No new OBS/CEF, live TikTok or
Windows/macOS validation is claimed by this refresh.

## Executed capture checks

- Composition walkthrough: 14 checkpoints passed, zero browser script errors.
- Compact composition editing: one focused Playwright test passed.
- Responsive Studio and standalone Playground: two Playwright tests passed.
- Code workspace/native Studio adapter: one Playwright test passed.
- Native 280px dock: one CTest passed.

The full test suite was not rerun for this screenshot-only refresh. Representative
mobile/desktop/compact frames were visually inspected.
