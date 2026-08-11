/** Arrow-key delta for a slider event, or 0 when the key isn't ours.
 *  Shared by the hue and alpha tracks — same gesture, different range. */
export function keyDelta(e: React.KeyboardEvent, step: number, coarse: number): number {
  const size = e.shiftKey ? coarse : step;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") return size;
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") return -size;
  return 0;
}
