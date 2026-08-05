---
name: drawing-defaults
description: "flow's drawing defaults — square corners, 0-10px stroke slider, and selection chrome that hugs element bounds"
metadata:
  type: project
---

Shipped 2026-08-04. Four asks, one of which turned out to be a no-op.

- **Square corners** — `src/App.tsx` seeds `currentItemRoundness: "sharp"` in
  `initialData.appState`. Excalidraw ships `"round"`, whose ADAPTIVE_RADIUS
  algorithm sizes the radius from the shape's own dimensions — not a fixed
  value (verified: a fresh rect reported 32, a diamond reported 35). Zero
  fork.
- **2px stroke — ALREADY UPSTREAM, no change made.** `DEFAULT_ELEMENT_PROPS.strokeWidth`
  is 2 (`constants.ts:394`) and `appState.ts:46` seeds `currentItemStrokeWidth`
  from it. Verified live before planning. Only a stale `?? 1` display fallback
  in `StrokePanel.tsx` was corrected.
- **Stroke slider 0-10px** — `MIN_STROKE_PX`/`MAX_STROKE_PX` in
  `src/ui/panels/StrokePanel.tsx`. The old 0.5 floor displayed as "1" because
  `displayValue` rounds px to 0 decimals.
- **Tight selection chrome** — fork edit. New `SELECTION_SPACING = 0` in
  `constants.ts`, used at the two `interactiveScene.ts` border sites and the
  `transformHandles.ts` margin/spacing defaults.

## Fork gotchas worth remembering
- **Do NOT zero `DEFAULT_TRANSFORM_HANDLE_SPACING` itself.** `SIDE_RESIZING_THRESHOLD`
  and `DEFAULT_COLLISION_THRESHOLD` derive from it; zeroing breaks edge resizing
  and hit-testing. That is why `SELECTION_SPACING` exists as a sibling.
- `renderTextBox` (`interactiveScene.ts:739`) keeps the old spacing — it is the
  text-editing outline, not a selection box.
- Removing the old margin expression orphans the `isImageElement` and
  `DEFAULT_TRANSFORM_HANDLE_SPACING` imports in `transformHandles.ts`; the fork's
  eslint runs `--max-warnings=0`, so they must be deleted.
- **A 0 stroke width needs two guards** (`scene/Shape.ts`): floor `fillWeight`/
  `hachureGap` at 1px, or roughjs clamps the hachure gap to 0.1px and hangs on
  hachure/cross-hatch elements from opened docs; and map a 0 width to
  `stroke: "none"`, because canvas ignores a non-positive `lineWidth` and keeps
  the previous draw's value.
- **KNOWN REGRESSION, still open — locked-aspect corner resize is lost on some linear
  elements.** With the linear margin zeroed, a corner resize handle whose position
  coincides with an extremal vertex (a vertex that is the max on BOTH axes) is rendered
  but unreachable: hover gives point-drag priority, so clicking it moves the vertex
  instead of resizing. This is not merely cosmetic — the vendor test
  `resize.test.tsx > line element > resizes with locked aspect ratio` fails on it
  (scaleHeight 1.26 vs scaleWidth 2.10, i.e. the aspect lock never applies), and that
  test is a **true positive left deliberately red**. It is the only vendor test this
  work leaves failing. Fixes if it bites: omit corner handles that coincide with a
  vertex, or restore a small linear-only margin (partially reversing "zero it
  everywhere" for arrows/lines).
- **The vendor test harness was fixed on 2026-08-05** (fork commit `aa8bc5e7`) — do not
  re-derive this. It had drifted from production in two ways, which together accounted
  for 18 of the 19 `resize.test.tsx`/`binding.test.tsx` failures this work first caused:
  `transform()` in `tests/helpers/ui.ts` derived n/e/s/w click points from a phantom
  handle rect, but production omits those four handles entirely
  (`getOmitSidesForDevice` → `DEFAULT_OMIT_SIDES`) and resizes from sides via a
  border-proximity test — the two coincided only while the chrome margin happened to be
  2. And `Pointer.downAt()` pressed without first moving, which no real pointer does and
  which starved the app of the hover state (`hoverPointIndex`) that arbitrates
  point-drag vs resize. The harness now targets the real border segment
  (`getSelectionBorders`, exported for that purpose) and moves before pressing.
- **9 `renderInteractiveScene` call-count snapshots in `linearElementEditor.test.tsx`
  were re-recorded** (+1 each) — that extra render is the hover render a real pointer
  would always have caused. Behavioral assertions in those tests were passing
  throughout; only the instrumentation counts moved.

Render and hit-test can't drift: `getTransformHandles` feeds both the renderer
and `resizeTest.ts`, and the shared default params feed both multi-select paths.

## Vendor suite baseline (measured 2026-08-05)

The fork's own suite is **substantially red independent of flow's work** — 169 failing
tests at fork commit `0759a501`, i.e. before any of this. Never read a raw failure count
as a verdict; always diff the failing *names* against a baseline. Capture with
`yarn test:app --watch=false 2>&1 | grep '^ FAIL ' | sort -u` and `comm` the two lists.

This work added 26 failures, of which the harness fix cleared 25 (18 resize/binding +
7 linear-editor snapshot tests). **The 1 remaining is the locked-aspect regression
above** — genuinely broken behavior, not noise.

See [[flow-fork-strategy]], [[transform-panel]], [[arrowhead-size]].
