/** flow's global laser-pointer trail color. Written into `appState.laserColor`,
 *  which the fork's local laser trail reads each frame (see laser-trails.ts).
 *  Carried as `#rrggbb` or `#rrggbbaa` (per-color opacity), matching the other
 *  Color-panel swatches. The hex default mirrors the fork's named "red". */
export const DEFAULT_LASER_HEX = "#ff0000";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Type guard for an unknown persisted value (a hex color string). */
export function isLaserColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}
