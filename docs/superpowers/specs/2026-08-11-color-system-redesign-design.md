# Color system redesign — design

**Date:** 2026-08-11
**Status:** shipped 2026-08-11

One Color panel that owns everything about color — an Illustrator-style part
chooser, a real HSV picker with eyedropper and alpha, numeric entry in
HSLA/RGBA/HEX, and the palette manager folded in. A clone of the part chooser
pins to the bottom of the tool rail with a compact picker popup, and both
surfaces read and write the same thing: the current selection.

## Problem

Color in flow is spread across four surfaces that don't agree with each other.

1. **The Color panel is three disconnected rows.** `src/ui/panels/ColorPanel.tsx`
   renders Fill / Stroke / Text, each a small `ColorSwatch` well plus a separate
   opacity `NumberInput`. There is no way to see a color, only to replace it —
   the "picker" is a grid of palette presets, the OS color dialog, and a hex
   field (`src/ui/panels/controls/ColorSwatch.tsx:80-126`). No hue slider, no
   saturation field, no eyedropper.
2. **Palettes live in a second panel.** `SwatchesPanel` is registered separately
   in the dock (`src/ui/panels/PanelsRoot.tsx:43`) and has its own picker
   (`SwatchPicker.tsx`). Choosing a color and curating the palette you choose
   from are the same activity split across two panels.
3. **Nothing is reachable without opening the dock.** Setting a fill means
   finding the Color panel. Illustrator puts fill/stroke permanently in the
   tool rail for exactly this reason.
4. **There is no notion of "the part I'm working on."** Every write names its
   own property, so the concept that makes Illustrator's color model legible —
   one active part, one color, one picker — has nowhere to live.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where the color lives | **Derived from the selection**, never stored | The panel is a view of the current object, so there is no second copy to sync. `useSelectionStyle` already gives live values with `currentItem*` fallback |
| Shared UI state | flow-level external store, `useSyncExternalStore` | Same pattern as [[color-swatches]]' `palette-store`; the dock and the rail are different subtrees, so context would sit at the root anyway |
| Picker internals | Local HSV draft inside the picker | Hue survives a drag through S=0 / V=0; a hex round-trip destroys it |
| Alpha storage | Unchanged — 8-digit hex per color | `color-alpha.ts` already does this and the canvas honors it; the picker just gains a slider onto the same value |
| Panel + popup composition | Share **logic** (`useColorDraft`), not a composed component | The saturation box sits beside the part chooser in the panel and full-width in the popup; one component doing both means a layout-variant prop that fights us later |
| Palettes | Merge `SwatchesPanel` into the Color panel | "There should be only one color panel" |
| "Set as default" palette | Removed — the dropdown selection **is** the active palette | One concept instead of two; the selection persists |
| Recents | 6 slots, MRU, persisted to `flow.recentColors` | A cross-document cache of colors the user actually reaches for, independent of any file |
| Recents format | Opaque `#rrggbb`, dedup on hue | Nudging alpha shouldn't burn a slot; renders as a flat chip like every other swatch |
| Eyedropper | Vendor's, via an additive fork export | `LayerUI` renders the overlay whenever the atom is set, so flow needs only the setter |
| Text part | Third box, shown only when the selection has text | Excalidraw text has one color (`strokeColor`); without this, a labeled container's text becomes unreachable |
| Quartet (none/white/grey/black) | Under the part chooser only | Not pinned into palette grids |
| Rail width | 48 → 88px, two tool columns | Makes room for the part chooser and the shapes coming later |

## Mechanism

### 1. State

Four kinds of state, deliberately kept apart.

| State | Home | Notes |
|---|---|---|
| The color | derived via `useSelectionStyle` | `currentItem*` fallback when nothing is selected |
| `activePart` | `src/lib/color-store.ts` | `"fill" \| "stroke" \| "text"`, shared panel ↔ rail |
| `recents` | `color-store` + `flow.recentColors` | ≤6, MRU, cross-document |
| `numericMode` | `color-store` + `flow.colorNumericMode` | `"hsla" \| "rgba" \| "hex"`, default HSLA |
| HSV draft | local to the picker | seeded from the derived color, re-seeded when it changes from outside |

`color-store.ts` mirrors `palette-store.ts`: module-level state, a listener set,
`subscribe`/`getSnapshot`, thin `use*` hooks, and forgiving reads of
localStorage on load.

### 2. Pure modules

**`src/lib/color-convert.ts`** — hex ⇄ HSV ⇄ HSL ⇄ RGB plus parse/format for
the numeric fields. Sits on top of `color-alpha.ts`, which keeps owning the
alpha byte, so the storage convention is untouched.

**`src/lib/color-parts.ts`** — the part model, the piece that makes the rest
declarative. Given `elements` + `selectedIds` it answers:

- which parts are **available**: `fill` and `stroke` for shapes; `text` only
  when `resolveTextTargetIds` (`src/lib/selection-style.ts`) is non-empty; a
  text-only selection has **`text` alone**, since Excalidraw text has no fill or
  outline of its own
- for a part: target ids, element prop, `currentItem*` key, fallback color

| Part | Prop | Ids | `currentItem*` |
|---|---|---|---|
| fill | `backgroundColor` | `selectedIds` | `currentItemBackgroundColor` |
| stroke | `strokeColor` | `selectedIds` | `currentItemStrokeColor` |
| text | `strokeColor` | `textTargetIds` | `currentItemTextColor` |

Plus `normalizeActivePart(available, active)` — a text-only selection forces
`text`; an active part that isn't available falls back to `fill` — and
`swapParts`, which computes the fill↔stroke exchange for both the elements and
the `currentItem*` defaults as one update.

**`src/lib/recent-colors.ts`** — `pushRecent(list, color)` (unshift, dedup,
truncate to 6) and `normalizeRecents(raw)`, the forgiving reader for untrusted
localStorage, same job `normalizePalettes` does in `color-palettes.ts`.
`"transparent"` never enters the list.

### 3. Components

```
src/ui/color/
  SaturationBox.tsx     2D S/V field, pointer drag + arrow keys
  HueSlider.tsx         0–360
  AlphaSlider.tsx       checkerboard under a ramp of the current hue
  ColorPreview.tsx      the round well
  EyeDropperButton.tsx
  NumericFields.tsx     HSLA / RGBA / HEX + mode switcher
  PartChooser.tsx       overlapping boxes + swap arrows + quartet
  PaletteSection.tsx    dropdown + [+] + trash + grid
  useColorDraft.ts      HSV draft, commit rules
  useColorTarget.ts     the write path (below)
```

The panel composes these as: part chooser beside the saturation box, quartet
under the chooser, then eyedropper + preview + hue/alpha, then numeric fields,
then the palette section. The popup composes saturation box, then eyedropper +
preview + hue/alpha, then the six recents. Layout is owned per surface;
`useColorDraft` is the shared part.

### 4. Part chooser

Two overlapping boxes, front one active. Fill renders as a solid square, stroke
as a thick ring, matching Illustrator and the reference screenshot. Clicking a
back box brings it forward and switches the active part; the double-headed
arrow swaps fill and stroke.

The text part is deliberately not a fourth visual language:

- **text-only selection** → a single solid square, part `text`. Visually the
  fill box, which is what a glyph's color is — and satisfies "automatically
  swap to the fill block when text is selected"
- **labeled container** → three boxes: fill square, stroke ring, and a text
  square carrying a `T`
- **MIXED across a multi-selection** → the box renders a checker; the picker
  seeds from the first element rather than blanking

### 5. Numeric fields

Three modes, HSLA by default. H/S/L/A and R/G/B/A reuse `NumberInput`, so they
inherit drag-to-scrub and the spin buttons from [[scrub-numeric-inputs]] for
free; HEX is a plain text field spanning the row.

| Mode | Fields |
|---|---|
| HSLA | H 0–360 int · S 0–100 % · L 0–100 % · A 0–1, two decimals |
| RGBA | R/G/B 0–255 int · A 0–1, two decimals |
| HEX | one field, accepts `#rgb` / `#rrggbb` / `#rrggbbaa` via `scrubHex`-style forgiving parse |

The reference screenshot draws the switcher as a small chevron stack. It is
implemented as a labelled `<select>` styled to look like that — a cycle button
would be unreachable by keyboard and unnamed to a screen reader. A MIXED
selection shows the resolved first-element values rather than blanking the
fields, consistent with the part chooser seeding from the first element too
(§4) — blank numeric fields sitting beside a populated saturation box and
sliders would be incoherent, not more honest.

### 6. Write path

`useColorTarget(sel)` → `{ part, setPart, available, color, setColor, adjustColor, swap, quickSet }`.

`setColor` and `adjustColor` both resolve the part through `color-parts`, combine
the alpha into 8-digit hex, and write through `sel.setProp` / `sel.update` — they
share one write implementation and differ only in whether the write also joins
recents. Slider and saturation-field drags pass `transient: true`, so
`deferred-commit` batching makes one drag one undo entry — the pattern
[[scrub-numeric-inputs]] established.

Recents record a *whole colour*, never a *channel adjustment* — even a settled,
non-transient one. A hue slider, an alpha slider, and the saturation box (drag
**and** arrow-key steps alike) are channel adjustments, and so are the H/S/L,
R/G/B, and A numeric fields: each moves one component of a color still being
worked on. None of these call `setColor`; they all route through `adjustColor`,
which writes identically but never touches recents. Only four paths call
`setColor` and do record: the Hex field commit (a typed hex names a whole color
outright), a palette swatch pick, an eyedropper pick, and a click on an existing
recent. The white/grey/black quartet under the part chooser is the same rule
applied to `quickSet`: those three colors already have permanent dedicated
chips one click away, so `quickSet`'s non-`"none"` branch calls `adjustColor`
directly rather than `setColor`, and caching them would just evict colors the
user actually chose.

The risk this guards against: without the split, an arrow-key step is
non-transient (`transient: false`) exactly like a drag release, so it looks
identical to a deliberate commit from the write path's point of view. Six
ArrowRight presses on the hue track would replace the entire six-slot recents
strip with six adjacent hues, and reaching one color by dragging hue then
saturation would burn two slots for a single choice.

`quickSet` carries the baseline colors, and the stroke rules are the sharp edge:

| Part | none | white / grey / black |
|---|---|---|
| fill | `backgroundColor: "transparent"` | the color |
| stroke | `strokeColor: "transparent"` **and** `strokeWidth: 0`, one `sel.update` | the color; if `strokeWidth` is currently 0, bump to 1 in the same write |
| text | no-op (invisible text is a footgun) | the color |

Grey is `#808080`. The none chip is a white square with a red diagonal.

> **Care required.** [[drawing-defaults]] records that flow's 0-width stroke has
> already cost three fork edits from falsy coercions on `strokeWidth` — the
> fill-maths floor, `"transparent"` rather than `"none"` (else curved arrows
> crash), and `??` rather than `||` in `restore.ts`. Every `strokeWidth` read on
> this path uses `??`, and the width-0 round trip needs an explicit test.

### 7. Tool rail

`RAIL_WIDTH` 48 → 88 (`src/ui/toolbar/ToolBar.tsx:14`), tools in a two-column
grid. `App.tsx:464` and `--flow-toolbar-reserved` follow the constant, so the
canvas gutter needs no separate change. The part chooser pins to the bottom via
`margin-top:auto`.

Clicking the frontmost box opens the popup in a portal anchored right of the
rail, dismissed on outside pointerdown or Esc — mirroring `ToolbarConfigMenu`
and `PanelShell`. A floating rail anchors off its own rect.
`shouldRedock` (`ToolBar.tsx:79`) is tuned against a 48px rail. **Correction
(shipped):** it tests the left edge of the rail, not its width, so it needed no
retuning for 88 — this risk dissolved on inspection.

### 8. Eyedropper

`activeEyeDropperAtom` is defined at
`vendor/excalidraw/packages/excalidraw/components/EyeDropper.tsx:35`, and
`LayerUI.tsx:512` renders the overlay whenever it is set. flow therefore needs
**only the setter**, not the component — an additive export of the atom and the
editor jotai store from the package index, the same shape as the
`getSearchMatches` export in [[search-panel]]. `App.tsx:2975` (`openEyeDropper`)
shows the payload.

Fallback if the export needs more than an index re-export: the browser
`EyeDropper` API behind a support check, with the button hidden where absent.
**Correction (shipped):** the fallback was never needed — both symbols
(`activeEyeDropperAtom`, `editorJotaiStore`) were already exported from their
own modules, so the fork edit is a two-line additive re-export in
`packages/excalidraw/index.tsx`.

### 9. Palette section

The merged bottom half of the panel: a palette `<select>`, `[+]` to add a new
palette, and the existing context-sensitive trash (delete selected swatches,
else delete the palette). The grid's **first cell is `[+]`, which adds the
current color** to the selected palette. `SwatchGrid`'s drag-reorder logic is
absorbed rather than rewritten.

The dropdown selection is the active palette and persists — `setDefaultPalette`
becomes the selection itself and the "★ Set as default" button goes away.
Renaming is in-place: double-click the select and it swaps for a text input.

## Retired and migrated

| Item | Fate |
|---|---|
| `src/ui/panels/SwatchesPanel.tsx` | deleted; dock entry `swatches` removed from `PanelsRoot.tsx:43` |
| `src/ui/panels/SwatchPicker.tsx` | deleted — the real picker replaces it |
| `src/ui/panels/SwatchGrid.tsx` | absorbed into `PaletteSection` |
| `ColorPanel`'s three rows + opacity `NumberInput`s | deleted — alpha lives in the picker |
| `src/ui/panels/controls/ColorSwatch.tsx` | **kept** — `PreferencesDialog.tsx:207` and `BackgroundControl.tsx:15` use it as the generic small well for non-element colors |
| Saved dock layouts naming `swatches` | **Correction (shipped):** no `panel-dock-state` migration was written or needed — `syncPanelDefs` already drops unknown panel ids on load, so a stale `swatches` entry is silently dropped by existing code |
| `flow.defaultPaletteId` | reused as the active-palette id; no migration needed |

## Testing

**Unit** — `color-convert` round-trips, with explicit hue-preservation cases at
S=0 and V=0/100; `color-parts` availability, auto-switch, and swap; `recent-colors`
MRU dedup and truncation; `color-store` persistence and forgiving reads.

**Component** — part chooser click-to-front, swap, and text auto-selection;
saturation/hue/alpha drag emitting transient writes then one commit;
`quickSet` stroke coupling in both directions (none ⇒ width 0, color ⇒ width 1);
MIXED rendering.

**E2E** — pick a color in the rail popup and see the panel and the element
follow; swap fill and stroke; none-on-stroke zeroes the width; a recent color
survives a reload; the widened rail still docks and floats.

## Risks

1. ~~**Eyedropper fork export** — the only item not verified end-to-end.~~
   **Dissolved (shipped):** both symbols were already exported from their own
   modules; the fork edit is a two-line additive re-export, verified
   end-to-end in Task 18.
2. ~~**`shouldRedock` at 88px** — needs retuning, easy to miss.~~ **Dissolved
   (shipped):** `shouldRedock` tests the rail's left edge, not its width, and
   is width-independent — no retuning was needed.
3. ~~**Stale `swatches` in persisted dock layouts** — covered by the
   migration.~~ **Dissolved (shipped):** no migration was written; `syncPanelDefs`
   already drops unknown panel ids, so this was already covered by existing code.
4. **`strokeWidth` falsy coercions** — see the [[drawing-defaults]] warning.
   **Materialized:** the plan's own reference implementation for Task 11 wired
   the fix/revival coupling in only one direction, breaking the empty-selection
   tool-defaults path outright until review caught it. Fixed via a shared
   `needsRevival()` used by all four write paths, `??` not `||`.

## Out of scope

New shapes for the widened rail; layers; grid-line color; swatch drag-and-drop
refinements; a palette dropdown or quartet inside the rail popup (the popup is
exactly what the reference screenshot draws: saturation box, eyedropper,
preview, hue, alpha, six recents).
