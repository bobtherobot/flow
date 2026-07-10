# Grid Size Preference — Design

**Date:** 2026-07-09
**Status:** Approved (brainstorm), pending implementation plan
**Type:** flow-level preference (zero fork changes)

## Summary

Add a global, app-wide **Grid size** preference to `File ▸ Preferences` letting the
user define the size (in pixels) of the canvas grid used by the grid option.

Excalidraw already exposes `appState.gridSize` (native field, default 20) which the
grid renderer and grid-snapping both read. Today it is fixed at the built-in default
and there is no UI to change it. This feature surfaces it as a flow preference,
mirroring the existing **Sloppiness** and **Select** preferences.

## Goals

- A number input in `File ▸ Preferences` (General) to set the grid size in px.
- Global app-wide value persisted in flow's localStorage (`flow.gridSize`).
- Applied to every drawing: on load (via `initialData`) and live whenever changed.
- Values validated/clamped so the stored and applied grid size is always valid.

## Non-Goals (YAGNI)

- No control over `gridStep` (the bold-line-every-N-cells value). It stays at its
  default of `5`; bold gridlines auto-track at every 5th cell as `gridSize` changes.
- No per-document grid size. This is a single global preference, consistent with
  Sloppiness/Select.
- No changes to the grid on/off toggle (already handled by the bottom bar's
  `gridMode` action).

## Behavior

| Aspect | Decision |
|--------|----------|
| Control | Number input (px) with `−`/`+` steppers |
| Range | min **5**, max **100**, step **5** |
| Default | **20** (Excalidraw's existing default — no behavior change out of the box) |
| Scope | Global app-wide (localStorage key `flow.gridSize`) |
| Applied to | Visible grid **and** grid-snapping increment (both read `appState.gridSize`) |
| Commit | On change/blur; out-of-range input is clamped (e.g. `500` → `100`, `2` → `5`) |

Because Excalidraw's grid renderer computes minor lines every `gridSize` and bold
lines every `gridStep * gridSize` (with `gridStep` = 5, untouched), changing
`gridSize` transparently rescales both. Grid-snapping in `dragElements` also reads
`gridSize`, so the snap increment follows the preference automatically.

## Architecture

All changes are flow-level. **No `vendor/excalidraw` fork edit and no type cast are
needed** — unlike `selectionMode`, `gridSize` already exists in the vendor
`.d.ts`, so `updateScene`/`initialData` accept it directly.

### New: `src/lib/grid.ts`

Pure module (mirrors `roughness.ts` / `selection-mode.ts`):

```ts
export const MIN_GRID_SIZE = 5;
export const MAX_GRID_SIZE = 100;
export const GRID_SIZE_STEP = 5;
export const DEFAULT_GRID_SIZE = 20;

/** Clamp to [MIN, MAX], round to the nearest step, and guard NaN → default. */
export function clampGridSize(value: number): number;

/** True when value is a finite number within the valid grid-size range. */
export function isGridSize(value: unknown): value is number;
```

`clampGridSize` behavior:
- `NaN` / non-finite → `DEFAULT_GRID_SIZE`.
- Below `MIN` → `MIN`; above `MAX` → `MAX`.
- Otherwise rounded to the nearest multiple of `GRID_SIZE_STEP`.

### `src/app/preferences.ts`

Add, mirroring the `selectionMode` block:

```ts
const GRID_SIZE_KEY = "flow.gridSize";

/** Read the app-wide grid-size preference, falling back to the default. */
export function getGridSize(): number; // parse → clampGridSize → default on miss/invalid

/** Persist the app-wide grid-size preference (clamped before write). */
export function setGridSize(value: number): void;
```

### `src/App.tsx`

Clone the `selectionMode` wiring (minus the cast):

- `const [gridSize, setGridSizeState] = useState<number>(() => getGridSize());`
- `handleChangeGridSize(next)` → `setGridSizeState(clampGridSize(next))` +
  `setGridSize(next)`.
- Effect: when `gridSize` changes and the API is ready,
  `excalidrawApi.updateScene({ appState: { gridSize } })`.
- Seed `initialData.appState.gridSize = gridSize` (alongside `selectionMode`).
- Pass `gridSize` + `onChangeGridSize` to `PreferencesDialog`.

### `src/ui/PreferencesDialog.tsx` + `preferences-dialog.css`

- A labeled number-input row in the General section, below **Select**:
  `Grid size: [ 20 ] px`.
- Props: `gridSize: number`, `onChangeGridSize: (next: number) => void`.
- Input: `type="number"`, `min={MIN_GRID_SIZE}`, `max={MAX_GRID_SIZE}`,
  `step={GRID_SIZE_STEP}`, accessible label "Grid size". Commit on change; clamp via
  `clampGridSize` before calling `onChangeGridSize` so the field can never hold an
  invalid value.
- New reusable `.flow-num` / `.flow-num__input` styles for a label + number input
  row (parallels the existing `.flow-seg` segmented-control styles).

## Data Flow

```
localStorage flow.gridSize
      │ getGridSize() (clamped)
      ▼
App state: gridSize ──seed──► initialData.appState.gridSize ──► Excalidraw grid + snapping
      ▲                         effect: updateScene({ appState: { gridSize } })
      │
PreferencesDialog number input ── onChangeGridSize ──► setGridSizeState + setGridSize()
```

## Error Handling / Validation

- All reads go through `clampGridSize`, so a corrupt/hand-edited localStorage value
  (`"abc"`, `999`, `0`) resolves to a valid grid size (default or clamped bound).
- The number input clamps on commit; typing an out-of-range value snaps to the
  nearest valid bound.

## Testing

- **`src/lib/grid.test.ts`** — `clampGridSize` (NaN, below-min, above-max,
  rounds-to-step, in-range passthrough) and `isGridSize` (valid/invalid/boundary).
- **`src/app/preferences.test.ts`** — `flow.gridSize` set/get round-trip;
  invalid stored value falls back to default.
- **`src/ui/PreferencesDialog.test.tsx`** — renders the grid-size input with the
  current value; editing fires `onChangeGridSize` with the clamped value.
- **`e2e/grid-size.spec.ts`** — open Preferences, set a new grid size, enable the
  grid, and assert the applied `appState.gridSize` reflects the new value.

Run the full unit + e2e suite after implementation to confirm no regressions.

## Rollout Notes

- Default of 20 means zero behavior change for existing users until they opt in.
- No fork rebuild required (no vendor edit), avoiding the `buildPackage.js` /
  `gen:types` gotcha documented for `selection-mode`.
