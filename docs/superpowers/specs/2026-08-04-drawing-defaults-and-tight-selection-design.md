# Drawing defaults + tight selection box — design

**Date:** 2026-08-04
**Status:** approved, ready to plan

Four independent changes to flow's drawing defaults and selection chrome. Two are
flow-level (zero fork); two need small additive edits in `vendor/excalidraw`.

## Problem

1. A freshly drawn box gets a large corner radius — Excalidraw's stock
   `currentItemRoundness` default is `"round"`, and the adaptive algorithm uses a
   fixed 32px radius, which reads as gigantic on small shapes.
2. The default stroke for shapes and arrows is 1px; flow wants 2px.
3. flow's stroke-width slider spans 0.5–32px. Wanted: 0–10px.
4. Selection borders and transform handles sit ~4px outside the element bounds.
   Wanted: tight against the object.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Zero-width stroke | Fix both the fill degeneration **and** the stroke render | A bare 0 is unsafe on two independent axes (below) |
| Selection tightness | Border on the element's geometric bounds | Mirrors the path images already use; a stroke-aware border needs per-element lookups in the renderer and handle math |
| Arrows and lines | Zero their extra +8px handle margin too | Uniform selection chrome across every element type |
| Defaults surface | Fixed app defaults, not preferences | Smallest change; per-object controls already exist in the panels |

## Change 1 — Sharp corners by default

**flow only, 1 line.** `src/App.tsx` `initialData.appState` gains
`currentItemRoundness: "sharp"`.

Excalidraw's stock default is `"round"` (`packages/excalidraw/appState.ts:43`), and
`packages/excalidraw/components/App.tsx:7759` and `:7807` read exactly this field
when constructing a rectangle or diamond. New boxes come out sharp; the Transform
panel's corner-radius field still rounds them per-object.

## Change 2 — Default stroke width 2px

**flow only, 1 line.** Same block gains `currentItemStrokeWidth: 2`, overriding
`DEFAULT_ELEMENT_PROPS.strokeWidth`. One shared tool default covers shapes and
arrows alike.

Both seeds sit alongside the existing `objectsSnapModeEnabled` and
`currentItemFontFamily` seeds — same established pattern, no new preference
plumbing.

These are **tool defaults, not flow globals.** A saved `.excalidraw` still restores
its author's values on open, matching Excalidraw's own behavior. They are therefore
deliberately *not* added to `FLOW_GLOBAL_APP_STATE_KEYS`.

## Change 3 — Stroke slider range 0–10px

### flow side

`src/ui/panels/StrokePanel.tsx`: `MIN_STROKE_PX` 0.5 → 0, `MAX_STROKE_PX` 32 → 10.
The slider already round-trips through `displayValue`/`toPx`, so non-px units
follow automatically.

### fork side — `packages/excalidraw/scene/Shape.ts`

A bare 0 is unsafe on two independent axes, and each needs its own fix. Both land
in the same options block at `generateRoughOptions` (`Shape.ts:74-82`).

**Fill degeneration.** `fillWeight: strokeWidth / 2` and `hachureGap: strokeWidth * 4`
both collapse to 0. roughjs then clamps the gap to 0.1px
(`roughjs/bin/fillers/scan-line-hachure.js:9`), so a hachure- or cross-hatch-filled
shape generates tens of thousands of fill lines and hangs the canvas. Fix: derive
both from `Math.max(element.strokeWidth, 1)`. Only hachure and cross-hatch are
affected — `fillStyle: "solid"` never reaches the hachure filler.

**Stroke render.** `roughjs/bin/canvas.js:18` assigns `ctx.lineWidth = o.strokeWidth`
directly. Canvas ignores a non-positive `lineWidth` and retains the previous draw's
value, so a 0-width shape would paint a stray hairline at an arbitrary width. Fix:
set `stroke: "none"` when the width is 0 — roughjs maps that to `transparent` at
`canvas.js:17`.

```ts
const fillBase = Math.max(element.strokeWidth, 1);
// ...
fillWeight: fillBase / 2,
hachureGap: fillBase * 4,
stroke: element.strokeWidth === 0 ? "none" : element.strokeColor,
```

Net ~4 lines in one cold function.

**Knock-on:** arrowhead size is `strokeWidth × factor` (see
`.claude/memory/arrowhead-size.md`), so a 0-width arrow loses its heads as well.
Consistent, not a defect.

## Change 4 — Tight selection box

### Constraint

`DEFAULT_TRANSFORM_HANDLE_SPACING` (`packages/excalidraw/constants.ts:185`) is **not**
safe to zero. `SIDE_RESIZING_THRESHOLD` (`:187`) and `DEFAULT_COLLISION_THRESHOLD`
derive from it and govern edge-resize tolerance and hit-testing; zeroing it there
would quietly break side resizing.

### Approach

Add a sibling constant in `constants.ts` and swap only the five chrome sites:

```ts
/** flow: selection chrome hugs element bounds. Deliberately separate from
 *  DEFAULT_TRANSFORM_HANDLE_SPACING, which still feeds the resize/collision
 *  thresholds. */
export const SELECTION_SPACING = 0;
```

| Site | Today | Change |
|---|---|---|
| `renderer/interactiveScene.ts:377` | `DEFAULT_TRANSFORM_HANDLE_SPACING * 2` | `SELECTION_SPACING` — single-element border |
| `renderer/interactiveScene.ts:1076` | `(SPACING * 2) / zoom` | `SELECTION_SPACING` — multi-select dashed box |
| `element/transformHandles.ts:133` | `margin = 4`, `spacing = SPACING` | both `SELECTION_SPACING` |
| `element/transformHandles.ts:305-309` | linear `+8`, image `0`, else `SPACING` | `SELECTION_SPACING` for all |

### Why this is low-risk

**Images already run this exact configuration.** `interactiveScene.ts:992` passes
`padding: 0` for image elements, and `transformHandles.ts:307`/`:311` pass margin and
spacing `0`. This generalizes a proven path rather than inventing one.

**Render and hit-test cannot drift.** `getTransformHandles` feeds both the renderer
(`interactiveScene.ts:1037`) and the hit test (`resizeTest.ts:57`). The multi-select
path relies on the shared *default parameter values* of
`getTransformHandlesFromCoords`, which feed both `interactiveScene.ts:1096` and
`resizeTest.ts:161`. Changing the shared defaults keeps every pair in lockstep by
construction.

The rotation handle keeps its own `ROTATION_RESIZE_HANDLE_GAP` offset, so it stays
clear of the top edge.

### Consequences

The border lands on the element's geometric bounds, so half the stroke sits outside
it — 1px at the new 2px default. This matches how images render today.

Zeroing the linear `+8` means arrow and line handles may overlap the line itself and
its point-editing handles. Accepted for uniformity.

### Out of scope

`renderTextBox` (`interactiveScene.ts:739`) also reads the spacing constant, but it
draws the text-*editing* outline for fixed-width text, not a selection box. It keeps
`DEFAULT_TRANSFORM_HANDLE_SPACING`.

## Fork footprint

Four vendor files, ~12 lines, all additive and in cold code — the `Shape.ts` options
builder, the `transformHandles.ts` coord math, two `interactiveScene.ts` render
sites, and one new constant. No schema or format change, no edits inside
`components/App.tsx`. Consistent with the lean-and-rebasable rule in
`.claude/memory/flow-fork-strategy.md`.

## Verification

- **Unit** (`npm test`) — StrokePanel bounds. Note `vitest.config.ts` excludes
  `vendor/**`, so the fork-side `Shape.ts` and selection-spacing changes are not
  reachable from flow's suite; they are covered by e2e instead.
- **E2E** (`npm run test:e2e`) — extend `e2e/stroke-panel.spec.ts` for the 0–10
  range; new assertions that a fresh rectangle is sharp at 2px; a zero-stroke
  hachure-fill case confirming no hang and no visible stroke; a selection-geometry
  check that handles sit on the bounds.
- **Build chain** — `npm run build:excalidraw` (node 22 via nvm; node 25 fails on
  `marked@16`), then `npm run typecheck`, then the flow bundle rebuild.
