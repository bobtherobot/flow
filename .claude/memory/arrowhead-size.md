# Arrowhead size (per-end, stroke-relative)

Adjustable arrow start/end head size, controlled by a number-less slider under
each Start/End arrowhead icon row in the Stroke sub-panel. Size is **relative to
stroke width**: `size = strokeWidth × factor`. Shipped 2026-07-09.

## Fork change (schema — the most invasive fork edit so far)
0.18.1 has NO per-element arrowhead size — `getArrowheadSize` was a fixed
per-type constant. Added a per-element factor:
- `element/types.ts`: `ExcalidrawLinearElement` gains optional
  `startArrowheadSize?: number` / `endArrowheadSize?: number`.
- `element/bounds.ts` `getArrowheadPoints`: replaced `getArrowheadSize(arrowhead)`
  with `size = element.strokeWidth * (perEndFactor ?? DEFAULT_ARROWHEAD_SIZE_FACTOR)`.
  Exported `DEFAULT_ARROWHEAD_SIZE_FACTOR = 6`. (`getArrowheadSize` left in place,
  now unused.) `minSize = min(size, length×lengthMultiplier)` still caps on short
  segments. This is the SINGLE sizing path (canvas render + bounds).
- `data/restore.ts`: thread both fields through the `line` and `arrow` branches —
  REQUIRED or restore's allowlist strips them and size wouldn't survive save/reload.
- Rebuild dist: `packages/excalidraw` → `node ../../scripts/buildPackage.js` (Node 22).
  The compiled code lands in a CHUNK (`dist/*/chunk-*.js`), NOT index.js — grep all
  dist files to verify, not just index.js.

## flow side
- `SliderInput`: new `hideValue` prop → renders only the range slider (no numeric
  field), for relative values where the number is meaningless.
- `StrokePanel`: size slider stacked under each Start/End icon group (reused the
  existing `.flow-ctl-row__control--stack` CSS). Range 2–12, step 0.5, default 6
  (MUST match the fork's DEFAULT_ARROWHEAD_SIZE_FACTOR). Writes
  `start/endArrowheadSize` via `setProp` (newElementWith → history), NO
  currentItemKey (no appState default field — so the slider only applies to
  selected linear elements; disabled when no linear selection or that head is
  "none"). Field not in the vendor .d.ts → read via a small cast.

## New-arrow tool default (added 2026-07-09)
Arrowhead size (and head TYPE) are now editable as tool defaults with an EMPTY
selection, so new arrows inherit them:
- Fork: added AppState `currentItemStartArrowheadSize`/`currentItemEndArrowheadSize`
  (types.ts + appState.ts default 6 + APP_STATE_STORAGE_CONF browser:true). New
  arrows pick them up — `newArrowElement` gained `start/endArrowheadSize` opts
  (element/newElement.ts), passed from `this.state.currentItem*` in App.tsx's
  linear-element creation (~L7715). Head TYPES already flowed via
  currentItem*Arrowhead — only the UI was gated.
- flow: `arrowDefaultsDisabled = hasSelection && !hasLinear` (disabled ONLY for a
  non-linear selection; enabled on empty or linear). Head-type groups + size
  sliders use it; the arrow TYPE row (sharp/round/elbow) still uses
  `arrowsDisabled` (needs a selection — dispatches via executeAction). Size
  slider reads/writes `currentItem*ArrowheadSize` (fallback) + the element.
- Existing arrows still re-size to the stroke-relative model on load (undefined →
  default 6).

## Labels (cosmetic, 2026-07-09)
Stroke panel visible labels: "Start"→**Tail**, "End"→**Head**. Text only — the
aria-labels stay "Start/End arrowhead[ size]" and prop names unchanged (tests +
a11y identifiers rely on them).

## Tests
`SliderInput.test` hideValue case; `e2e/stroke-panel.spec.ts` "arrowhead size
sliders track the arrowhead state" (enable/disable by head + resize commits).
Rendering proven by before/after screenshot (head visibly grew at factor 12).
Full: 293 unit + 52 e2e green.
