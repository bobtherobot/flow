import { scrubHex } from "./color-palettes";

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

/** flow's persistent grid *color* preference. Written into `appState.gridColor`
 *  (the thin, dashed regular lines); the bold every-`gridStep` lines get
 *  `boldGridColor` of it. Bold is LIGHTER than regular here — deliberately the
 *  inverse of upstream Excalidraw, whose bold is darker. A 4px solid line reads
 *  far heavier than a 1px dashed one, so lightening it evens out the two
 *  weights' perceived contrast instead of compounding it. */
export const DEFAULT_GRID_COLOR = "#dddddd";

/** Per-channel lightening applied to the bold lines. 8 is the magnitude of
 *  Excalidraw's own two-tone gap (0xE5 − 0xDD), reused so the derived pair keeps
 *  the separation upstream tuned by eye. */
export const GRID_BOLD_LIGHTEN = 8;

const GRID_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Type guard for an unknown persisted value (a hex color string). */
export function isGridColor(value: unknown): value is string {
  return typeof value === "string" && GRID_HEX.test(value);
}

/** The bold-gridline color derived from the user's chosen (regular) color:
 *  each channel lightened by `GRID_BOLD_LIGHTEN`, clamped at 255. Unparseable
 *  input yields the default's bold shade rather than throwing, so a corrupt
 *  stored value can never blank the grid. */
export function boldGridColor(hex: string): string {
  const base = scrubHex(hex) ?? DEFAULT_GRID_COLOR;
  const packed = Number.parseInt(base.slice(1), 16);
  const lighten = (channel: number) =>
    Math.min(255, channel + GRID_BOLD_LIGHTEN)
      .toString(16)
      .padStart(2, "0");
  return `#${lighten((packed >> 16) & 0xff)}${lighten((packed >> 8) & 0xff)}${lighten(
    packed & 0xff,
  )}`;
}
