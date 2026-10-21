# 480×480 editing evidence

Current target: a genuinely editable composition designer in a 480×480 browser
window, with repeated controls removed. This supersedes the earlier 320px-wide,
900px-high screenshot as the primary compact-design check.

- [Canvas frame](canvas-480.png)
- [Inspector frame](inspector-480.png)
- [Editing recording](editing-480.webm)
- [Measured result](results.json)

One focused Playwright case passed. It used the real native Studio helper in a
fresh disposable configuration, not a mocked API. It resized the composition itself
to 480×480, added a widget, edited name/geometry, dragged it, simulated a local chat
and saved. The native service confirmed a 480×480 composition and a 220×160 instance
at x=70/y=45. The usable canvas area was 464×286 pixels. The main geometry fields
were visible within the window; only the contextual panel scrolls. No page overflow
or browser script errors occurred. Video export and temporary-helper cleanup passed.

The designer now has one design undo/redo pair, one contextual panel switch, one
compact action toolbar and a single saved/draft status. Irrelevant preview-resolution
controls and global disabled undo/history duplicates are absent in Design mode.
Advanced actions remain in More actions. Navigation preferences collapse into the
navigation menu, leaving the canvas/Inspector usable in the small square window.
The artboard retains its real aspect ratio and fits both available dimensions.

Validation scope was deliberately narrow: frontend build, locale validation,
formatting and this one actual browser editing case. No full browser/native matrix
was rerun, and this does not claim OBS/CEF or human-usability-study acceptance.
