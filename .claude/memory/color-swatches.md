# Color Swatches (palette manager panel)

A **Color Swatches** dock sub-panel to manage persisted color palettes; the
chosen **default** palette drives the preset grid of every color picker in flow.
Shipped 2026-07-10 (merged to `main`, merge commit `b1ca5b7`; bundle `e67e4d7`).
Spec/plan: `docs/superpowers/specs|plans/2026-07-10-color-swatches*`. Zero fork edits.

## The key architectural fact
flow does **not** use Excalidraw's ColorPicker. Every color control (ColorPanel
Fill/Stroke/Text/Laser rows + bottombar `BackgroundControl`) renders through the
flow-native `src/ui/panels/controls/ColorSwatch.tsx`. Its preset grid used to be a
hardcoded `PRESETS` const of 16 hexes. This feature makes that grid dynamic:
`ColorSwatch` now reads `useDefaultPaletteColors()` from the store. So "the palette
used everywhere" = whichever palette is `defaultPaletteId`.

## Modules (all flow-level, `src/`)
- `lib/color-palettes.ts` — `ColorPalette {id,name,colors[]}`, `scrubHex` (forgiving
  hex: kind to missing `#`, expands 3-char shorthand, strips 8-char alpha, REJECTS
  non-hex → null; note "bad"/"abc" ARE valid 3-char hex), `isHexColor`,
  `BUILTIN_FALLBACK` (the legacy 16), `makeBuiltinPalettes()` (7 seeds: Default,
  Pastel, Vibrant, Earth, Ocean, Sunset, Grayscale), `makeDefaultPalette()`,
  `normalizePalettes`, `nextSetName`, `generatePaletteId`.
- `lib/palette-store.ts` — module-singleton external store via `useSyncExternalStore`.
  `getSnapshot()` returns a STABLE ref (only reassigned in `commit()`);
  `getDefaultPaletteColors()` caches keyed to state ref (`colorsCache.forState===state`)
  — both required or React infinite-loops. Mutations: add/remove/rename/setDefault
  Palette, add/update/removeSwatches/reorderSwatches. `reloadPaletteStore()` is the
  test seam. **Invariant: palettes is never empty** — `removePalette` re-seeds a fresh
  "Default" when deleting the last one; `load()` reseeds all 7 on empty/corrupt.
- `ui/panels/SwatchesPanel.tsx` — composes it: palette `<select>`, add-palette,
  context-trash (swatches selected → remove them; none → confirm-delete palette),
  `SwatchGrid`, `SwatchPicker`, rename input (uncontrolled, `key={id}`, commit on
  blur), set-default. Selection = swatch INDICES; cleared on palette-switch, trash,
  Delete/Backspace, AND reorder (else stale-index deletes the wrong swatch).
- `ui/panels/SwatchGrid.tsx` — presentational: pinned non-draggable "+" tile
  (`aria-label="Add swatch"`) then one button per color (`aria-label="Swatch #hex"`,
  `aria-pressed`, draggable HTML5 reorder). Index 0 is never a swatch.
- `ui/panels/SwatchPicker.tsx` — add/edit popover: native `<input type=color>` +
  hex field (Enter commits via scrubHex). Escape closes from anywhere (keydown on
  wrapper div, not just the hex field).

## Persistence & registration
- `app/preferences.ts`: keys `flow.colorPalettes` (normalized on read) +
  `flow.defaultPaletteId`. Same try/catch + readJson/writeJson pattern as siblings.
- `ui/panels/PanelsRoot.tsx`: `{ id:"swatches", label:"Color Swatches" }` inserted
  after `color`. Dock `syncPanelDefs` auto-slots it into saved layouts.
- Styling: `flow-sw*` block appended to `panels.css`, uses real flow theme tokens
  (`--flow-panel-bg/ink/border/hover/accent/radius-*`) — NOT hardcoded hex, so
  dark mode is correct. (`--flow-surface` does not exist; use `--flow-panel-bg`.)

## Test gotchas
- Store-backed vitest files MUST install the `mockLocalStorage`+`vi.stubGlobal`
  shim (jsdom's native localStorage is non-functional here) — copy from
  `preferences.test.ts`. `beforeEach`: `localStorage.clear()` + `reloadPaletteStore()`.
- tsconfig targets **ES2020** → no `Array.prototype.at()` in tests/code.
- e2e selector collision: swatch tiles are `"Swatch #hex"`, ColorSwatch presets are
  `"#hex"`. Playwright default name match is substring → use `{ exact:true }` when
  selecting a preset button (fixed 5 sites in `e2e/color-panel.spec.ts`). Any NEW
  test picking a preset color must do the same.
- e2e `e2e/color-swatches.spec.ts` proves persistence-across-reload + default-change
  updates a picker live. e2e runs on `npm run dev` (Vite); no vendor rebuild needed.

## Deferred minors (safe; from final review)
- No-op mutations (bad id) still commit() → redundant notify+write.
- `getDefaultPaletteColors()`/palette `colors` returned by reference (BUILTIN_FALLBACK
  not frozen) — all consumers read-only today; `Object.freeze` would ripple a
  `readonly` type through `ColorPalette.colors`, so skipped.
- Trash button + confirm dialog share aria-label "Delete palette" (different roles).
