# Color Swatches — design spec

**Date:** 2026-07-10
**Status:** Approved design, ready for implementation plan
**Author:** brainstorming session

## Summary

Add a new dockable controls sub-panel, **Color Swatches**, that lets the user
manage the color palette used everywhere a color can be set. Today every color
control routes through a single flow-native component, `ColorSwatch.tsx`, whose
preset grid is a hardcoded 16-color `PRESETS` array. This feature turns that
array into a live, user-managed, persisted set of palettes: the user can create,
rename, and delete any number of palettes, add/remove/edit/reorder the swatches
in each, and choose one palette as the **default** that drives every picker.

This is a **flow-level** feature. No fork edits to `vendor/excalidraw` are
required — the palette source and every color control already live in flow code.

## Background / current state

- `src/ui/panels/controls/ColorSwatch.tsx` owns a compact flow-native picker
  (preset grid + OS color dialog + hex field + optional "None"). Its preset grid
  is `const PRESETS = [...16 hex...]`.
- Consumers of `ColorSwatch` (all of them):
  - `src/ui/panels/ColorPanel.tsx` — Fill / Stroke / Text / Laser rows.
  - `src/ui/bottombar/BackgroundControl.tsx` — canvas background.
- Panels register as `PanelDef[]` in `src/ui/panels/PanelsRoot.tsx`; the dock
  (`panel-dock-state.ts` → `syncPanelDefs`) auto-slots any new panel id.
- Preferences persist via `src/app/preferences.ts` — one `flow.*` localStorage
  key per concern, `get*/set*` pair, normalize-on-read, safe try/catch fallback,
  `readJson`/`writeJson` helpers for JSON blobs.

## Requirements

1. A **Color Swatches** sub-panel appears in the controls dock accordion.
2. The panel shows the swatches of the currently-selected palette.
3. The user can create, rename, and delete palettes (delete requires a confirm).
4. The user can add, remove, edit, and reorder swatches within a palette.
5. Exactly one palette is the **default**; it drives every color control's preset
   grid. Setting a new default replaces the previous one (last write wins).
6. Palettes and the default selection persist across reloads.
7. Color-setting must never break: if no palettes exist or the default id is
   missing, pickers fall back to a hardcoded built-in palette.

## Data model

```ts
interface ColorPalette {
  id: string;      // stable unique id
  name: string;
  colors: string[]; // ordered "#rrggbb" hex values
}
```

### Persistence (two new `flow.*` keys, mirroring `preferences.ts`)

- `flow.colorPalettes` → `ColorPalette[]`
- `flow.defaultPaletteId` → `string`

`preferences.ts` gains: `getColorPalettes()` / `setColorPalettes()` and
`getDefaultPaletteId()` / `setDefaultPaletteId()`, each with the established
try/catch + normalize pattern.

### Normalization & fallback (`src/lib/color-palettes.ts`)

- `isHexColor(s)` — accepts `#rrggbb` (case-insensitive), normalizes to lowercase.
- `normalizePalettes(raw)` — coerce unknown blob to `ColorPalette[]`: drop
  entries without a string id/name, filter each `colors` array to valid hexes,
  drop palettes that end up with no valid fields. Guarantee unique ids.
- `BUILTIN_FALLBACK: string[]` — the current 16 presets. Used when the palette
  list is empty or the resolved default palette has zero colors, so
  `ColorSwatch` always has something to render.
- `BUILTIN_PALETTES: ColorPalette[]` — the 7 seed palettes (below).
- First run (no stored `flow.colorPalettes`): seed `BUILTIN_PALETTES` and set
  `flow.defaultPaletteId` to the "Default" palette id.

### Seed palettes (7)

All seeds are ordinary editable palettes (no locked/read-only palette).

| Name | Colors (`#rrggbb`) |
|---|---|
| **Default** | `1e1e1e 343a40 495057 868e96 ced4da ffffff e03131 e8590c f08c00 2f9e44 099268 1971c2 4263eb 7048e8 ae3ec9 c2255c` |
| **Pastel** | `ffd6e0 ffe5b4 fff3b0 d0f4de b8e0d2 a9def9 cddafd d3c4f5 e4c1f9 fcd5ce` |
| **Vibrant** | `ff004d ff8500 ffd500 00c853 00b8d4 2962ff 651fff aa00ff ff1493` |
| **Earth** (muted) | `4b3621 6f4e37 a0785a c19a6b d2b48c 8a9a5b 556b2f b7410e 8d6e63 5d4037` |
| **Ocean** (cool) | `03045e 023e8a 0077b6 0096c7 00b4d8 48cae4 90e0ef caf0f8 2a9d8f` |
| **Sunset** (warm) | `03071e 370617 6a040f 9d0208 dc2f02 e85d04 f48c06 faa307 ffba08` |
| **Grayscale** | `000000 1e1e1e 343a40 495057 868e96 adb5bd ced4da dee2e6 f1f3f5 ffffff` |

("Default" is exactly today's `PRESETS`. Pastel + Earth cover the "some pastel /
muted" note; final hexes may be nudged during implementation for even contrast.)

## Reactivity — external store

`ColorSwatch` is a leaf rendered in ~5 places, so prop-drilling the active
palette everywhere is undesirable. Introduce a small external store.

### `src/lib/palette-store.ts`

A module-level store backed by the `preferences.ts` getters/setters, exposing the
`useSyncExternalStore` contract plus mutations. Every mutation persists and then
notifies subscribers.

```ts
// read
subscribe(listener: () => void): () => void
getSnapshot(): PaletteState               // { palettes, defaultPaletteId }
getDefaultPaletteColors(): string[]        // resolves default → colors, else BUILTIN_FALLBACK

// mutate (each: persist + notify)
addPalette(name?: string): ColorPalette    // "color set N" auto-numbered if name omitted
removePalette(id: string): void            // if it was default, re-point default to first remaining
renamePalette(id: string, name: string): void
setDefaultPalette(id: string): void
addSwatch(paletteId: string, color: string): void
updateSwatch(paletteId: string, index: number, color: string): void
removeSwatches(paletteId: string, indices: number[]): void
reorderSwatches(paletteId: string, from: number, to: number): void
```

- `ColorSwatch` consumes the default palette via a tiny hook
  (`useDefaultPaletteColors()` → `useSyncExternalStore(subscribe, getDefaultPaletteColors)`).
  Its preset grid maps over those colors instead of the const array. The rest of
  `ColorSwatch` (native OS picker, hex field, "None"/transparent) is unchanged.
- The panel reads the full snapshot and calls the mutations.
- Because both read from the same store, editing the default palette or changing
  which palette is default updates every open picker live.

*Alternative considered:* React Context provider around the app. Rejected in
favor of the store because it keeps persistence + reactivity colocated and leaves
`ColorSwatch` self-contained (no provider wiring in `App.tsx`).

## UI — panel layout

Registered in `PanelsRoot.tsx` as `{ id: "swatches", label: "Color Swatches",
render: () => <SwatchesPanel /> }`.

```
┌─ Color Swatches ───────────────────────────┐
│ [Palette ▾ Default]        [+]   [🗑]        │  top row
│                                             │
│  [ + ] ■ ■ ■ ■ ■                            │  swatch grid
│  ■ ■ ■ ■ ■ ■ ■                              │  ("+" tile pinned first)
│  ■ ■ ■                                      │
│                                             │
│ [ Default________________ ]  [★ Set default] │  bottom row
└──────────────────────────────────────────────┘
```

### Top row
- **Palette dropdown** — selects which palette the panel is editing. Independent
  of which palette is the default.
- **[+] Add palette** — creates a palette named `color set N` (N = smallest
  integer avoiding a name clash), selects it, shows an empty grid (only the "+"
  tile), and focuses the name input for immediate rename.
- **[🗑] Context-trash** — behavior depends on swatch selection:
  - **≥1 swatch selected** → remove those swatches from the current palette.
  - **no swatch selected** → delete the whole palette after a confirm dialog
    ("Do you really want to delete this color palette?"). Reuses the existing
    Radix dialog pattern used elsewhere in flow. If the deleted palette was the
    default, the default re-points to the first remaining palette (or the
    built-in fallback if none remain).

### Swatch grid
- **"+" tile** — always the first cell, static: not selectable, not draggable,
  never a drop target (index 0 is special-cased). Clicking it opens the existing
  `ColorSwatch` picker popover anchored to the tile; choosing a color appends a
  new swatch to the current palette.
- **Swatch** — a colored cell for one palette color:
  - **click** → select (highlight), replacing any prior selection.
  - **shift-click** → extend/toggle multi-selection.
  - **double-click** → open the picker popover to edit that swatch's color
    (`updateSwatch`).
  - **drag & drop** → reorder within the grid (`reorderSwatches`); the "+" tile
    stays pinned.
- **Delete / Backspace** with ≥1 swatch selected also removes the selection
  (same as the context-trash in swatch mode).

### Bottom row
- **Name input** — reflects the current palette's name; commits the rename on
  blur / Enter (mirrors the grid-size input commit-on-blur pattern), not per
  keystroke.
- **[★ Set default]** — makes the currently-selected palette the default. Shown
  disabled/active-styled when the selection is already the default. Only one
  palette is ever the default (last write wins).

## Files

**New**
- `src/lib/color-palettes.ts` — `ColorPalette` type, `BUILTIN_PALETTES`,
  `BUILTIN_FALLBACK`, `isHexColor`, `normalizePalettes`, id generation.
- `src/lib/palette-store.ts` — external store + mutations + `useDefaultPaletteColors`.
- `src/ui/panels/SwatchesPanel.tsx` — the panel (extract `SwatchGrid` /
  `SwatchTile` if the file approaches ~300 lines).
- `src/ui/panels/SwatchesPanel.test.tsx`
- `src/lib/color-palettes.test.ts`, `src/lib/palette-store.test.ts`

**Modified**
- `src/ui/panels/controls/ColorSwatch.tsx` — preset grid sourced from
  `useDefaultPaletteColors()`; keep OS picker / hex / "None".
- `src/ui/panels/PanelsRoot.tsx` — register the `swatches` panel.
- `src/app/preferences.ts` — `flow.colorPalettes` + `flow.defaultPaletteId`
  keys and their `get*/set*` pairs.
- `src/ui/panels/panels.css` — swatch grid, "+" tile, selection highlight,
  drag-over affordance, top/bottom row styles.

## Edge cases

- **Empty palette** → grid shows only the "+" tile.
- **Delete last palette** → list empty; pickers use `BUILTIN_FALLBACK`; the panel
  offers add-palette. (Consider auto-seeding "Default" back — decide in plan; the
  fallback already keeps color-setting working either way.)
- **Delete the selected/default palette** → selection and default both re-point
  to the first remaining palette.
- **Duplicate colors in a palette** → allowed (no dedupe); reorder/remove operate
  by index, not by color value.
- **Invalid stored JSON** → `normalizePalettes` returns a clean list; a fully
  empty result triggers re-seed on next read.
- **`transparent` / "None"** → a picker concern only; not stored as a palette
  swatch. Swatches are opaque `#rrggbb`.

## Testing

**Unit (`color-palettes.test.ts`, `palette-store.test.ts`)**
- `isHexColor` accept/reject; `normalizePalettes` drops malformed, keeps valid,
  ensures unique ids; first-run seeding; `getDefaultPaletteColors` fallback when
  empty / default id missing.
- Every mutation: `addPalette` auto-numbering, `removePalette` default re-point,
  `renamePalette`, `setDefaultPalette` last-write-wins, `addSwatch`,
  `updateSwatch`, `removeSwatches` (multi-index), `reorderSwatches`; each
  persists and notifies.

**RTL (`SwatchesPanel.test.tsx`)**
- Add palette → grid empty but for "+" tile, name focused.
- Add swatch via "+" tile → appended.
- Click / shift-click selection highlight; delete-selected via trash and via
  Delete key.
- Delete palette → confirm dialog appears; confirm removes it.
- Rename commits on blur/Enter.
- Set default toggles state; button reflects already-default.
- `ColorSwatch` renders the default palette's colors (change default → grid
  reflects it).

**e2e**
- Create/edit a palette, reload → palettes and default persist.
- Change the default palette → an open color picker's preset grid updates live.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `useSyncExternalStore` new to this repo | Low | Standard React 18 hook; thin wrapper; unit-test the store directly. |
| Drag-reorder + "+" tile index math off-by-one | Med | Special-case index 0 in one place; unit-test `reorderSwatches`; cover in RTL. |
| Fallback path silently masks a corrupt store | Low | Normalizer is explicit and tested; fallback only triggers on empty/invalid. |
| Palette hexes vs. `transparent` in fills | Low | Swatches are opaque `#rrggbb`; "None" stays a separate picker affordance. |

## Acceptance

- [ ] Color Swatches panel registered and visible in the dock.
- [ ] Create / rename / delete (with confirm) palettes.
- [ ] Add (via "+" tile) / edit (dbl-click) / multi-select+remove / reorder swatches.
- [ ] Set-as-default; exactly one default; drives all pickers live.
- [ ] Palettes + default persist across reload.
- [ ] Pickers fall back to built-in palette when list empty / default missing.
- [ ] Unit + RTL + e2e green; no fork edits.
