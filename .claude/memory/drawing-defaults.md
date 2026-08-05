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
- **Linear elements are the ONE exception to the tight chrome — deliberately.**
  `LINEAR_SELECTION_SPACING = 10` (fixed 2026-08-05). A linear element's bounding-box
  corners often ARE its vertices (always so for a 2-point line), and a vertex wins the
  hit test within `LinearElementEditor.POINT_HANDLE_SIZE + 1` = 11px
  (`getPointIndexUnderCursor`). With the margin at 0 the corner handle rendered but was
  unclickable, and a corner drag silently became a point drag — which ignores locked
  aspect ratio. That was a real capability loss, caught by
  `resize.test.tsx > line element > resizes with locked aspect ratio`
  (scaleHeight 1.26 vs scaleWidth 2.10). A corner handle offset by `m` sits `m*√2` from
  the vertex, so **m must exceed ~7.8**; 10 gives ~14.1px clearance. Do not lower it
  without re-checking `margin * Math.SQRT2 > POINT_HANDLE_SIZE + 1`. The drawn border
  uses the same value (`interactiveScene.ts`) so handles don't float outside it.
  Visual cost is small: a selected 2-point arrow shows the linear editor's point
  handles, not a bbox, so only multi-point lines display the 10px box.
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

This work added 26 failures; all 26 are now cleared (18 by the harness fix, 7 by
re-recorded render-count snapshots, 1 by `LINEAR_SELECTION_SPACING`). The failing-name
set is once again **exactly equal** to the 169-test pre-branch baseline, so this work
leaves zero vendor test debt.

See [[flow-fork-strategy]], [[transform-panel]], [[arrowhead-size]].
