# Color picker refinement — design

**Date:** 2026-08-11
**Status:** draft

A visual refinement pass over the two color surfaces shipped by
[the color system redesign](2026-08-11-color-system-redesign-design.md): the
docked Color panel and the tool rail's popup. Driven by two mockups —
`working/color-picker-panel-2.png` and `working/color-picker-popup-2.png`.

Four changes with behaviour behind them (a drag-to-delete target in the palette
grid, a T-shaped text part, a rearranged part stack, a removed preview well) and
a handful that are purely styling. No change to the write path, to
`useColorTarget`, to `useColorDraft`, or to how color is derived from the
selection.

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

### 2. Part chooser double edge

Each box gets a dark outer rule that separates it from whatever it overlaps and
a light inner rule that holds the swatch color off that dark rule. In flow's
tokens: `--flow-ink` (`#2b2b33`) outside, `--flow-panel-bg` (`#ffffff`) inside.

- **fill** — `border: 2px solid var(--flow-panel-bg)`,
  `box-shadow: 0 0 0 2px var(--flow-ink)`, background = the part color.
- **stroke** — the same border and outer shadow, **no background**, plus three
  inset layers listed thinnest-first: the part color, then `--flow-panel-bg`,
  then `--flow-ink`. Because `box-shadow` paints first-listed on top and every
  inset grows inward from the same edge, the *spreads* are cumulative while the
  *visible bands* are their differences. The untouched centre falls through to
  the panel, which is what makes it read as a ring.
- **text** — see §2b.

Box sizing moves to `border-box` so `--flow-clr-part-size` stays the rendered
size. Spreads scale with it:

| | inset spreads | visible bands | hole |
|---|---|---|---|
| docked (46px) | 7, 9, 11 | 7 color / 2 light / 2 dark | 20px |
| rail (32px) | 4, 5.5, 7 | 4 color / 1.5 light / 1.5 dark | 14px |

**This supersedes the argument in `color.css:230-247`,** which currently says
inset shadows cannot produce a ring. That reasoning was correct *for the
version it was written against*, which kept `background: var(--flow-clr-part-color)`
on the stroke box: with the interior already painted, insets growing from the
edge leave the solid centre showing and the result is a bullseye. Dropping the
background is the whole difference. The comment must be rewritten rather than
deleted, so the next person to try `background` on the stroke box learns why it
breaks; the `::after` hole-punch it introduced is removed.

`--none` and `--mixed` keep their current treatment (red slash, checkerboard)
and keep suppressing the ring, since a ring only means something with a real
color in it.

### 2b. The text part becomes a T

The text part stops being a box. It renders as a T silhouette carrying the
same two-rule edge as the boxes: two `<path>` elements sharing one `d`, the
back one stroked `--flow-ink` at 8 units, the front stroked `--flow-panel-bg`
at 4 with `paint-order: stroke` and filled with the part color. Half of each
stroke lies outside the path, so the visible edge is 2px dark then 2px light —
matching the boxes exactly.

The same silhouette is used on the rail; the compact variant is the identical
SVG at a smaller `--flow-clr-part-size`, with the stroke widths scaled to hold
the 2px/2px reading.

Two edge states:

- `--mixed` fills the T with a checkerboard `<pattern>`. Pattern ids must come
  from `useId()`, because the docked chooser and the rail chooser are both
  mounted at once and duplicate ids would cross-reference.
- `--none` fills the T with `--flow-panel-bg`, leaving just the two rules. This
  is close to unreachable in practice — Excalidraw text colour lives on
  `strokeColor` and is never `"transparent"` — but `partColor` can return it,
  so it needs a defined rendering rather than an accident.

The `T` glyph span, `.flow-clr-part__glyph`, and its `mix-blend-mode: difference`
are deleted.

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

Recorded honestly: this puts the palette tiles and the rail chips below WCAG
2.2's 24×24 Target Size (Minimum, 2.5.8) AA threshold. Every one of these
controls remains keyboard-reachable and the grid is arrow-navigable, so the
functionality is not gated on pointer precision — but the pointer targets
themselves are under the guideline, deliberately.

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

`src/ui/color/ColorPreview.tsx` and `src/ui/color/preview.test.tsx` are
deleted, along with `.flow-clr-preview*` in `color.css`. `PickerRow` drops its
`isNone` prop — it exists only to feed the preview — and `ColorPanel` and
`ColorPopup` stop passing it. `useColorDraft.isNone` itself stays; only the
prop threading goes.

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
| `src/ui/color/PartChooser.tsx` | fixed geometry, `--parts-N` modifier, T silhouette, glyph span deleted |
| `src/ui/color/PaletteSection.tsx` | trash tile, drop handling, `title`s |
| `src/ui/color/PickerRow.tsx` | `isNone` prop and preview removed |
| `src/ui/color/ColorPreview.tsx` | deleted |
| `src/ui/color/preview.test.tsx` | deleted |
| `src/ui/color/color.css` | part edges, stack sizing, quartet grid, size tokens, tile/recent styling, preview rules deleted, `230-247` comment rewritten |
| `src/ui/panels/ColorPanel.tsx` | stop passing `isNone` |
| `src/ui/toolbar/ColorPopup.tsx` | stop passing `isNone` |
| `src/ui/color/PartChooser.test.tsx` | reworked for the new geometry and the T |
| `src/ui/color/PaletteSection.test.tsx` | drop-to-delete, disabled-when-empty, tooltips |
| `src/ui/color/sliders.test.tsx` | preview-less `PickerRow` |
| `e2e/color-panel.spec.ts` | rail measurements re-taken; a drag-to-trash flow |

## Testing

**Unit.** `PartChooser` gets a case per `availableParts` shape asserting the
modifier class and that each part is present and clickable — in particular
that in the three-part case stroke and text are at distinct positions, which
is the regression the deleted `offsetOf` existed to prevent. The T renders two
paths with one shared `d`; `--mixed` uses a `useId`-derived pattern id, and two
mounted choosers do not collide. `PaletteSection` gets: drop on trash removes
that swatch and only that swatch; trash is `disabled` with no selection and
enabled with one; clicking it with a selection removes exactly the selected
indices; the footer trash's `title` tracks its two states.

**E2E.** `e2e/color-panel.spec.ts`'s exact-pixel rail assertion is re-measured
against the taller control (it compares a real `boundingBox()` against the
canvas gutter, so it will fail loudly rather than silently drift). A
drag-a-swatch-onto-the-trash flow is added via Playwright's `dragAndDrop`,
which drives HTML5 DnD in Chromium — the grid uses native `draggable`, not
pointer events.

**Visual.** The stroke ring, the T's two rules, and the drag-over highlight are
all paint-order-dependent and none of them are visible to jsdom. They must be
confirmed in the running app before this is called done — the `color.css`
comment being superseded here is itself a record of what happens when
paint-order reasoning goes unchecked (`background` on the stroke box was
reasoned about correctly but never looked at).

## Risks

- **The stroke ring is paint-order-dependent and easy to get backwards.**
  `box-shadow` layers paint first-listed on top, and every inset grows inward
  from the same edge, so the three bands only appear if they are listed
  thinnest-first *and* the box has no background. Either mistake yields a
  bullseye that still looks deliberate.
- **The rail control grows up to 35px taller** (76 → 111 with a labelled
  container selected). Verify the rail still fits its tool grid at a small
  viewport height.
- **`useId` in the T pattern.** Two choosers mount simultaneously
  (`PanelsRoot` and `ToolBar` each own a `useSelectionStyle` instance —
  deliberate, see the color-system memory). A hardcoded pattern id would make
  one chooser's mixed state reference the other's `<defs>`.
