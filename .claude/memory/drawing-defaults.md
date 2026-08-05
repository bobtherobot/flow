---
name: drawing-defaults
description: "flow's drawing defaults — square corners, 0-10px stroke slider, and selection chrome that hugs element bounds"
metadata:
  type: project
---

Shipped 2026-08-04. Four asks, one of which turned out to be a no-op.

- **Square corners** — `src/App.tsx` seeds `currentItemRoundness: "sharp"` in
  `initialData.appState`. Excalidraw ships `"round"`, whose ADAPTIVE_RADIUS
  algorithm applies a fixed 32px radius (verified: fresh rects reported 32).
  Zero fork.
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
- **Linear-element corner handles can be preempted.** With the linear margin zeroed, a
  corner resize handle whose position coincides with an extremal vertex (a vertex that is
  the max on BOTH axes) is rendered but unreachable — hover gives point-drag priority, so
  clicking it moves the vertex instead of resizing. Accepted consequence of the
  "zero it everywhere" choice for arrows/lines. Optional follow-up if it ever bites: omit
  corner handles that coincide with a vertex, or restore a small linear-only margin.
- **The vendor's own `resize.test.tsx` / `binding.test.tsx` fail after this change — and
  that is a test-harness artifact, not a regression.** `tests/helpers/ui.ts` builds
  side-handle click points with an EMPTY `omitSides` while production passes
  `DEFAULT_OMIT_SIDES` (n/e/s/w are never real handles; side-resize goes through the
  untouched `SIDE_RESIZING_THRESHOLD` line-proximity check). And `Pointer.downAt()` fires
  `pointerDown` with no preceding `pointerMove`, which no real mouse does — inserting the
  missing `mouse.moveTo` makes `binding.test.tsx` pass 8/8 with byte-identical binding
  output. Do not "fix" production code to satisfy these tests.

Render and hit-test can't drift: `getTransformHandles` feeds both the renderer
and `resizeTest.ts`, and the shared default params feed both multi-select paths.

See [[flow-fork-strategy]], [[transform-panel]], [[arrowhead-size]].
