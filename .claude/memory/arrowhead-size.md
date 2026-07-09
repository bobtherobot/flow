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

## Behavior note
No appState `currentItem*ArrowheadSize`, so NEW arrows use the default factor (6);
per-arrow sizing is set by selecting the arrow. Existing arrows re-size to the new
stroke-relative model on load (undefined factor → default 6), a deliberate
consequence of "proportional to stroke width".

## Tests
`SliderInput.test` hideValue case; `e2e/stroke-panel.spec.ts` "arrowhead size
sliders track the arrowhead state" (enable/disable by head + resize commits).
Rendering proven by before/after screenshot (head visibly grew at factor 12).
Full: 293 unit + 52 e2e green.
