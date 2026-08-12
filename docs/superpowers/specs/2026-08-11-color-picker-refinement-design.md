# Color picker refinement — design

**Date:** 2026-08-11
**Status:** draft

A visual refinement pass over the two color surfaces shipped by
[the color system redesign](2026-08-11-color-system-redesign-design.md): the
docked Color panel and the tool rail's popup. Driven by two mockups —
`working/color-picker-panel-2.png` and `working/color-picker-popup-2.png`.

Four changes with substance behind them — the part artwork moves wholesale from
CSS to SVG (which is also what makes the text part a real T silhouette), the
part stack is rearranged, the palette grid gains a drag-to-delete target, and
the preview well is removed — plus a handful that are purely styling. No change
to the write path, to `useColorTarget`, to `useColorDraft`, or to how color is
derived from the selection.

## Problem

The color system landed its architecture correctly but its chrome was drawn
from a first-pass mockup. Reviewing it against the running app surfaced four
specific complaints:

1. **The part chooser doesn't read as layers.** Three boxes evenly spaced along
   one diagonal, each a flat square with a single dark border, sit ambiguously:
   nothing says which is in front, and the box outline competes with the swatch
   color it contains. Illustrator solves this with a double edge — a dark outer
   rule that separates a box from whatever it overlaps, and a light inner rule
   that holds the swatch color off that dark rule.
2. **The text part is a square pretending to be text.** It renders as a filled
   box with a `T` glyph in `mix-blend-mode: difference`, so the text color is
   shown by the box and the glyph is a label on top of it. Reading the actual
   color off it is hard, and it looks like a third edge rather than a third
   kind of thing.
3. **Deleting a swatch is undiscoverable.** The only route is ⌘/Ctrl/Shift-click
   to select swatches, then the footer trash — a gesture nothing on screen
   mentions, on a button whose meaning silently changes depending on whether
   anything is selected. The project owner did not know it existed.
4. **The preview well earns less than its space.** A 44px circle showing the
   colour that the part chooser, the saturation box, the sliders and the
   numeric fields all already show.

## Non-goals

- No change to `useColorTarget`, `useColorDraft`, `color-parts.ts`,
  `color-store.ts`, or `palette-store.ts`'s public surface. This is chrome plus
  one new call into the existing `removeSwatches`.
- No drop-position indicator for swatch reordering. Reordering already works
  and its lack of a drop indicator is a separate, known gap.
- No dark theme work. flow defines its tokens once, unconditionally
  (`src/ui/menubar/menubar.css:4`); there is no `prefers-color-scheme` block
  anywhere in `src/`.

## Design

### 1. Part chooser geometry

Today every visible part is positioned by its index among the visible parts,
along a single diagonal inside a 74×74 box
(`PartChooser.tsx:52-53`, `color.css:218-221`). That indirection exists because
fixed per-part offsets once gave `stroke` and `text` the identical position in
the three-part case, burying one of them.

The new arrangement is fixed per part and cannot collide, because
`availableParts` returns exactly three shapes and nothing else
(`src/lib/color-parts.ts:59-70`):

| Selection | Parts | Positions (units of part size) | Stack box |
|---|---|---|---|
| bare text | `["text"]` | text `(0, 0)` | `1.0 × 1.0` |
| shape / empty selection | `["fill","stroke"]` | fill `(0, 0)`, stroke `(0.5, 0.5)` | `1.5 × 1.5` |
| labelled container | `["fill","stroke","text"]` | plus text `(0, 1.25)` | `1.5 × 2.25` |

At `--flow-clr-part-size: 46px` (docked) that is 69×104 for a labelled
container and 69×69 for a shape; at 32px (rail) 48×72 and 48×48.

`offsetOf` and `CANONICAL_ORDER` are deleted. The stack's own width and height
become `calc()`s over `--flow-clr-part-size`, switched by a class modifier
derived from `available` (`--parts-1` / `--parts-2` / `--parts-3`) rather than
by inline style, so the three cases are readable in the stylesheet.

Unchanged: the active part still renders last so it paints over its neighbours,
`--active`'s `z-index: 2` still backs that up, arrow-key cycling still walks
the parts in canonical order, and the swap arrow stays pinned to the stack's
top-right corner and still appears only when both fill and stroke are
available.

**Rail height cost.** The compact control grows from 76px tall (52 stack + 8
gap + 16 quartet) to 87px for a shape and 111px for a labelled container, once
§3 and §4's sizes are applied. `RAIL_WIDTH` is untouched — this is height only,
and the rail's tool grid sits above it.

### 2. Part artwork moves to SVG

Every part gets a dark outer rule that separates it from whatever it overlaps
and a light inner rule that holds the swatch color off that dark rule. In
flow's tokens: `--flow-ink` (`#2b2b33`) outside, `--flow-panel-bg` (`#ffffff`)
inside.

**All three parts are drawn as SVG.** No `background`, no `border`, no
`box-shadow`, no `::after` — the CSS route can express the fill box and the
stroke ring only through three unrelated tricks (a background, a stack of inset
shadows, a pseudo-element hole-punch), and the T not at all. One drawing model
means one place that decides how a part is coloured and one place that decides
how its edges are built.

#### The layering rule

Each part is a `<path>` `d`, painted as concentric stroked copies of that same
`d` on a shared `viewBox="0 0 46 46"`. A stroke of width *W* straddles the path
line by *W*/2 on each side, so listing widest-first and painting in document
order produces even bands:

| Part | Layers, back to front | Reads as |
|---|---|---|
| fill | `--flow-ink` w8 → `--flow-panel-bg` w4, filled with the color, `paint-order: stroke fill` | dark 2, light 2, solid color |
| text | same two layers on the T silhouette's `d` | dark 2, light 2, solid color |
| stroke | `--flow-ink` w15 → `--flow-panel-bg` w11 → color w7, `fill: none` | dark 2, light 2, color 7, light 2, dark 2, hole |

`paint-order: stroke fill` on the filled parts is what makes the light rule
read as 2 units rather than 4: the fill paints over the inner half of its own
stroke.

The SVG's `width`/`height` are `--flow-clr-part-size` against a fixed
`viewBox`, so every rule and band scales with the box automatically. The rail's
compact variant is the *identical* markup at a smaller size — there is no
second set of stroke widths to keep in sync, which is the main thing the CSS
version could not offer.

#### Colour states

The three states are uniform across all parts, defined once and reused:

- **a colour** — the `fill` (fill/text) or the innermost `stroke` (stroke part)
  is the part colour, passed as an SVG attribute. `--flow-clr-part-color` is
  retired; there is no longer a CSS layer that needs to know the colour.
- **`--none`** — `--flow-panel-bg` plus a red diagonal, drawn as a `<line>`
  clipped to the part's own `d`. The stroke part additionally suppresses its
  ring and draws as a plain square, since a ring means nothing without a colour
  in it (unchanged intent from today's `.flow-clr-part--none::after { content: none }`).
- **`--mixed`** — filled with a checkerboard `<pattern>`, same suppression rule
  for the stroke part.

Pattern and clip-path ids must come from `useId()`. The docked chooser and the
rail chooser are both mounted at once (`PanelsRoot` and `ToolBar` each own a
`useSelectionStyle` instance — deliberate, see the color-system memory), and
hardcoded ids would make one chooser's mixed state reference the other's
`<defs>`.

The quartet's *none* chip shares the same none artwork rather than
re-expressing it as a CSS gradient, so there is exactly one definition of what
"no colour" looks like.

#### What this deletes

`.flow-clr-part`'s `background`/`border`, `.flow-clr-part--stroke::after` and
its compact override, `.flow-clr-part--none`, `.flow-clr-part--mixed`,
`.flow-clr-part--none::after, .flow-clr-part--mixed::after`,
`.flow-clr-part__glyph` and its `mix-blend-mode: difference`, and
`.flow-clr-chip--none`. What survives in CSS is position, size, cursor, and
`z-index` — layout only.

**`color.css:230-247` goes with it.** That comment argues inset shadows cannot
produce a ring, which was correct for the version it was written against (one
that kept a background on the stroke box, leaving a bullseye). It is being
deleted rather than rewritten because the trap it documents can no longer be
reached: there is no background and no box-shadow on a part any more. Its
replacement is the layering table above, restated in the component.

### 3. Quick chips become 2×2

`.flow-clr-quartet` becomes a two-column grid. Order is unchanged and still
reads left-to-right, top-to-bottom: none, white / grey, black.

### 4. Sizing: flow is desktop-only

Swatch and chip sizes are not bound by the 22px floor the current stylesheet
assumes. flow is a desktop app driven by a mouse, and the project owner has
decided precision pointing takes priority over touch-target sizing. Sizes
therefore drop and all of them move into custom properties so they are
one-line adjustable:

| Token | Docked | Rail |
|---|---|---|
| `--flow-clr-chip-size` (quartet) | 20px | 14px |
| `--flow-clr-tile-size` (palette grid, incl. trash and `[+]`) | 18px | — |

The popup's six recents are excluded: they are already fluid
(`grid-template-columns: repeat(6, 1fr)` with `aspect-ratio: 1`), sized by the
popup's 280px width rather than by a token, and §6 changes only their styling.

Density is the goal — more of the palette visible per row, a quartet that
doesn't dominate the chooser. Layout wins over pointer-target sizing
guidelines here; that is a deliberate call, not an oversight.

### 5. Palette grid: a trash tile

A trash cell is prepended to `.flow-clr-palette__grid`, ahead of the existing
`[+]`. It is a real `<button>`, not a decoration, with two ways in:

- **Drop target.** `onDragOver` (preventDefault) and `onDrop` read the
  `dragFrom` ref the grid already maintains for reordering and call
  `removeSwatches(current.id, [from])`. `dragFrom` is cleared on drop exactly
  as the tile handler does. A `--over` class highlights it while a drag is
  over it, cleared on both `dragLeave` and `drop`.
- **Click.** Removes the currently ⌘/Ctrl/Shift-selected swatches. `disabled`
  when the selection is empty, so it is never a silently inert button.

No confirmation. Re-adding a colour is one click on `[+]` with that colour
live, and a confirm on every single-swatch removal is heavier than the action.

**Documenting the existing gestures** is part of this change, because the
selection gesture and the footer trash's dual role are currently unmentioned
anywhere on screen:

| Control | `title` |
|---|---|
| grid trash | `Delete swatches — drag one here, or ⌘-click swatches to select them first` (⌃ on non-Mac) |
| footer trash, with a selection | `Remove the selected swatches` |
| footer trash, with none | `Delete the "<name>" palette` |

The footer trash's behaviour does not change; it keeps both roles. Its
`aria-label` already switches between them (`PaletteSection.tsx:197`) and the
`title` simply tracks it.

### 6. Tile styling

Palette tiles lose their hairline border and take a soft shadow instead, so a
pale swatch still has an edge without a border competing with the colour. The
trash and `[+]` cells keep a hairline border, since they sit on the panel
background rather than carrying a colour. The popup's six recents get the same
treatment; empty recent slots keep their border.

### 7. The preview well is removed

`src/ui/color/ColorPreview.tsx` is deleted, along with `.flow-clr-preview*` in
`color.css`. `PickerRow` drops its `isNone` prop — it exists only to feed the
preview — and `ColorPanel` and `ColorPopup` stop passing it.
`useColorDraft.isNone` itself stays; only the prop threading goes.

`preview.test.tsx` is **renamed** to `PickerRow.test.tsx`, not deleted: it
covers both components, and deleting it would drop `PickerRow`'s coverage
along with the preview's. (`sliders.test.tsx` is untouched — it renders
`HueSlider` and `AlphaSlider` directly and never mounts `PickerRow`.)

**Cost, accepted:** the preview well is currently the only control that renders
alpha, as a checkerboard blend. After this, opacity is legible from the alpha
slider's thumb position and from the `A` numeric field (panel only — the popup
has no numeric fields, so on the rail the slider thumb is the only indication).

### 8. Checked, nothing to do

Two things the mockup appears to change that are already in the desired state:

- **The H/S/L/A field labels.** The mockup drops the four letters under the
  numeric fields. They were never implemented — `NumericFields.tsx` passes
  `ariaLabel` to each `NumberInput` and renders no visible label. Nothing to
  remove.
- **none/white/grey/black inside the palette grid.** The earlier mockup drew
  them inside the grid as well as under the part chooser; the new one shows
  them only under the chooser. The grid has only ever rendered
  `current.colors` plus `[+]` (`PaletteSection.tsx:96-129`), and no seeded
  palette contains `transparent` (`color-palettes.ts:32-81`). Already correct.

## Files

| File | Change |
|---|---|
| `src/ui/color/PartArt.tsx` | **new** — the SVG for one part: `d` per part, the layer table, the three colour states, `useId` defs |
| `src/ui/color/PartChooser.tsx` | fixed geometry, `--parts-N` modifier, renders `PartArt`, glyph span deleted |
| `src/ui/color/PaletteSection.tsx` | trash tile, drop handling, `title`s |
| `src/ui/color/PickerRow.tsx` | `isNone` prop and preview removed |
| `src/ui/color/ColorPreview.tsx` | deleted |
| `src/ui/color/preview.test.tsx` | renamed to `PickerRow.test.tsx`, `ColorPreview` cases dropped |
| `src/ui/color/color.css` | part rules cut to layout only, stack sizing, quartet grid, size tokens, tile/recent styling, preview and `230-247` blocks deleted |
| `src/ui/panels/ColorPanel.tsx` | stop passing `isNone` |
| `src/ui/toolbar/ColorPopup.tsx` | stop passing `isNone` |
| `src/ui/color/PartChooser.test.tsx` | reworked for the new geometry |
| `src/ui/color/PartArt.test.tsx` | **new** — layer order, colour states, id uniqueness |
| `src/ui/color/PaletteSection.test.tsx` | drop-to-delete, disabled-when-empty, tooltips |
| `e2e/color-panel.spec.ts` | rail measurements re-taken; a drag-to-trash flow |

## Testing

**Unit.** `PartChooser` gets a case per `availableParts` shape asserting the
modifier class and that each part is present and clickable — in particular
that in the three-part case stroke and text are at distinct positions, which
is the regression the deleted `offsetOf` existed to prevent.

`PartArt` is where the drawing is pinned down, and it is testable in jsdom in a
way the CSS version was not — layer widths and document order are attributes,
not computed paint: each part emits its layers in the documented widest-first
order with the documented widths and paints, all layers of a part share one
`d`, the colour lands on the documented layer per part, `--none` and `--mixed`
suppress the stroke part's ring, and two mounted instances produce disjoint
`useId` defs.

`PaletteSection` gets: drop on trash removes that swatch and only that swatch;
trash is `disabled` with no selection and enabled with one; clicking it with a
selection removes exactly the selected indices; the footer trash's `title`
tracks its two states.

**E2E.** Two tests are appended to `e2e/color-panel.spec.ts`. A
drag-a-swatch-onto-the-trash flow, via Playwright's `dragAndDrop` — it drives
real HTML5 DnD in Chromium, which is what the grid uses (native `draggable`,
not pointer events). And a rail vertical-fit assertion with a labelled
container selected, which is the tallest case and the only part of §1's height
cost that nothing currently covers.

The existing exact-pixel rail assertion (`:320`) is **not** touched: it
compares `rail.x + rail.width` against `--flow-toolbar-reserved` and is a
width check, unaffected by the control growing taller.

**Visual.** Unit tests can assert the layer *order and widths* but not that the
bands actually land where intended — stroke geometry, the T's proportions, the
overlap between parts, and the drag-over highlight all have to be looked at in
the running app before this is called done. The `color.css` comment deleted in
§2 is itself a record of what happens when paint reasoning goes unchecked: the
`background`-on-the-stroke-box version was reasoned about carefully and never
rendered.

## Risks

- **SVG layer order is the whole design, and getting it backwards still looks
  deliberate.** Widest-first, painted in document order. Reversed, the stroke
  ring collapses to a solid dark square and the fill box loses its light rule —
  both plausible-looking results that no type error catches. The layer table in
  §2 is the specification; the unit tests assert against it directly.
- **`paint-order: stroke fill` is load-bearing on the filled parts.** Without
  it the light rule reads 4 units wide instead of 2 and the fill/text parts
  stop matching the stroke part's edge.
- **The rail control grows up to 35px taller** (76 → 111 with a labelled
  container selected). Verify the rail still fits its tool grid at a small
  viewport height.
- **`useId` for the `<defs>`.** Two choosers mount simultaneously
  (`PanelsRoot` and `ToolBar` each own a `useSelectionStyle` instance —
  deliberate, see the color-system memory). Hardcoded pattern or clip-path ids
  would make one chooser's mixed or none state reference the other's `<defs>`.
