---
name: rotate-cursor
description: "Circular-arrow cursor on the rotation transform handle — the two-half CSS-variable seam and why CSS alone can't do it"
metadata:
  type: project
---

# Rotation-handle cursor (shipped 2026-08-25)

Excalidraw shows a grabber hand on the rotation transform handle. flow shows a
circular arrow instead (reference art: `working/rotate.png`).

## The seam is two halves, and both are required

1. **Fork edit** — `packages/element/src/resizeTest.ts`,
   `getCursorForResizingElement`: `case "rotation"` returns
   `var(--flow-rotate-cursor, grab)` instead of the literal `"grab"`. A CSS
   custom property resolves inside the inline style App writes onto the canvas.
2. **flow CSS** — `src/index.css` defines `--flow-rotate-cursor` as an inlined
   32x32 SVG data URI with a hotspot of `15 18` (the ring centre).

Losing either half silently restores the hand, so **`scripts/build-excalidraw.mjs`
stage 8** fails the build unless `--flow-rotate-cursor` appears in *both* files.

## Why CSS alone cannot do this

App writes the cursor as an **inline style**, so the only stylesheet hook is an
attribute substring match — and `[style*="cursor: grab"]` **also matches
`cursor: grabbing`**, which is what a middle-button pan sets. A CSS-only
override would have followed panning around too. `e2e/rotate-cursor.spec.ts`
pins that: middle-drag must still compute to `grabbing`.

## Two fallbacks, for two different failures

`var(--flow-rotate-cursor, grab)`'s own fallback fires only when the variable is
**undefined**. If the variable is defined but the data URI fails to decode, the
browser instead falls back to the last keyword in the *value's* own list — which
is why the variable's value ends `..., grab` as well.

## Measured facts (probed, not assumed)

- The handle band sits at **y~282-288** for a top edge of y=300, above the
  n-resize band (y~292-298), and is narrow in x — only the exact bbox midpoint
  hit it; +/-15px read `auto`.
- The cursor **persists through the whole rotate drag**: the hover cursor is the
  one the gesture keeps, nothing re-sets it on pointerdown.
- **Multi-selection has a rotation handle too** (`OMIT_SIDES_FOR_MULTIPLE_ELEMENTS`
  does *not* omit it — only `OMIT_SIDES_FOR_FRAME` does), and it goes through the
  same `getCursorForResizingElement` call, so one fork edit covers both.
- **flow has no reachable plain `grab` cursor**: space-panning sets no cursor at
  all here, middle-drag sets `grabbing`, and there is no Hand tool in the rail.
  A first draft of the e2e asserted space-pan -> `grab` and was wrong.

## Art notes

Dark glyph (`#1e1e1e`) with a white halo, which is standard cursor practice and
optimises for flow's light canvas. On a dark canvas background it reads as a
white *outline* rather than a solid shape — inherent to a dark glyph, and
thicker halos help, which is why the halo is stroke-width 6 against the glyph's
3 (compared 4.6/5/6 side by side on both backgrounds).
