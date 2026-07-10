/** flow's persistent grid-size preference. Written into `appState.gridSize`,
 *  which Excalidraw's grid renderer and grid-snapping both read. Values are
 *  clamped to a sane px range and rounded to a fixed step so the visible grid
 *  and the snap increment stay usable. */
export const MIN_GRID_SIZE = 5;
export const MAX_GRID_SIZE = 100;
export const GRID_SIZE_STEP = 5;
export const DEFAULT_GRID_SIZE = 20;

/** Clamp to [MIN, MAX], round to the nearest step; NaN/non-finite → default. */
export function clampGridSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRID_SIZE;
  const clamped = Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, value));
  return Math.round(clamped / GRID_SIZE_STEP) * GRID_SIZE_STEP;
}

/** Type guard for an unknown persisted value. */
export function isGridSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_GRID_SIZE &&
    value <= MAX_GRID_SIZE
  );
}
