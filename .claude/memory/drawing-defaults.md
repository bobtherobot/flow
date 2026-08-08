---
name: drawing-defaults
description: "flow's drawing defaults — square corners, 0-10px stroke slider, and selection chrome that hugs element bounds"
metadata:
  type: project
---

Shipped 2026-08-04. Four asks, one of which turned out to be a no-op.

**The 0–10px stroke slider has been the most expensive of the four by far**: allowing a
0 stroke width has now required three separate fork edits (`scene/Shape.ts` fill-maths
floor, `scene/Shape.ts` transparent stroke, `data/restore.ts` `??`), each because some
upstream code treats 0 as absent or as a no-op. Expect more; see the gotchas below.

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
  hachure/cross-hatch elements from opened docs; and map a 0 width to a
  **`stroke: "transparent"`**, because canvas ignores a non-positive `lineWidth`
  and keeps the previous draw's value, painting a stray hairline.
- **That second guard must be `"transparent"`, NEVER roughjs's own `"none"`**
  (was "none" until 2026-08-08; fixed after a crash report). roughjs's *canvas
  renderer* paints "none" as transparent, so the pixels are identical — but its
  *generator* reads "none" as "emit no stroke path at all". `curve()` (curved
  arrows/lines) then returns a Drawable with an empty `sets`, while
  `linearPath()` (sharp arrows) still emits one — which is why only the curved
  variants broke. Everything downstream derives geometry from that Drawable:
  `getCurvePathOps` (`packages/utils/geometry/shape.ts`) reads `shape.sets[0].ops`
  unguarded → **"Cannot read properties of undefined (reading 'ops')"** thrown
  out of the render loop via `getArrowheadPoints`, and the bounds/hit-test call
  sites would otherwise reduce over zero ops and collapse to the ±Infinity seed.
  Repro: any 0-width curved arrow (e.g. set a shape's width to 0, which drifts
  into the tool defaults, then draw one). Locked by two e2e tests in
  `drawing-defaults.spec.ts` — one for the crash, one that the outline still
  paints nothing.
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

- **A 0 stroke width is a *legitimate value*, and upstream code does not expect one.**
  Audit falsy coercions (`||`, `!x`, truthiness guards) on `strokeWidth` whenever
  touching vendor code. Found 2026-08-08 in `data/restore.ts`:
  `strokeWidth: element.strokeWidth || DEFAULT_ELEMENT_PROPS.strokeWidth` rewrote every
  legitimate 0 to 2 — **third fork edit from this feature**, now `??` (every sibling field
  on that object already used `??`/`== null`). `restoreElement` runs on **paste, on file
  open, and on library insert**, so a 0-width shape lost its styling on copy/paste *and*
  a saved flow document came back at 2px on reload. Upstream never hit it because its own
  picker only offers 1/2/4. Reported as a paste bug; the file-open half was found by
  checking the other callers of the same line. Checked and clean in the same file: flow's
  own added props (`cornerRadius`, `padding`, `startArrowheadSize`, `endArrowheadSize`)
  are passed straight through, and `opacity` uses an `== null` test, so a 0 survives.
  Locked by two e2e tests in `drawing-defaults.spec.ts`.

## Rebuilding the vendor dist

`cd vendor/excalidraw/packages/excalidraw && node ../../scripts/buildPackage.js`
— cwd matters (from the submodule root esbuild fails with "entry point
index.tsx cannot be marked as external"). Do **not** reach for `yarn build:esm`:
it wraps the same call in `rm -rf dist` plus a `gen:types` tail that fails on
pre-existing fork type debt (`data/restore.ts` `cornerRadius` vs `Required<…>`),
so it leaves the build looking broken when it is not. The `dist/types` that
flow's own `tsc` consumes comes from `buildPackage.js`, not `gen:types`.

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
