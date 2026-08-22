/** flow's persistent paste-position preference. Written into
 *  `appState.pastePosition`, which the fork's clipboard paste path reads at the
 *  one call site that inserts pasted *elements*:
 *    - "pointer"  → center the pasted bounding box on the mouse pointer
 *                   (Excalidraw's stock desktop behavior)
 *    - "viewport" → center it in the visible canvas
 *    - "offset"   → keep the copied coordinates, nudged by a cascading
 *                   `PASTE_OFFSET_STEP` so repeated pastes fan out
 *    - "original" → paste exactly where the elements were copied from
 *
 *  Only element pastes honor it. Pasting plain text, an image, or an SVG from
 *  outside flow has no "original" position, so those keep landing at the
 *  pointer; library inserts and drag-drop are likewise unaffected. */
export type PastePosition = "pointer" | "viewport" | "offset" | "original";

/** Scene-space step the "offset" position nudges each successive paste by.
 *
 *  DRIFT WARNING: the paste path applies the fork's own `PASTE_OFFSET_STEP`
 *  (`vendor/excalidraw/packages/common/src/constants.ts`); this copy exists only
 *  so the Preferences label can name the number without flow importing the
 *  Excalidraw barrel into a plain lib module (which would drag the whole editor
 *  into the dialog's jsdom tests). The two are kept honest by
 *  `e2e/paste-position.spec.ts`, which derives its expected coordinates from
 *  this constant and asserts them against what the real paste produces — change
 *  one without the other and that spec fails. */
export const PASTE_OFFSET_STEP = 10;

/** flow pastes in place by default — the copy lands where the original sits. */
export const DEFAULT_PASTE_POSITION: PastePosition = "original";

/** Presentation order in the Preferences panel, least to most positional
 *  fidelity: follow the pointer, follow the view, near the original, on it. */
export const PASTE_POSITION_ORDER: readonly PastePosition[] = [
  "pointer",
  "viewport",
  "offset",
  "original",
];

export const PASTE_POSITION_LABELS: Record<PastePosition, string> = {
  pointer: "At mouse pointer",
  viewport: "Center of view",
  offset: `Offset ${PASTE_OFFSET_STEP}px from original`,
  original: "Same position as original",
};

/** Type guard for an unknown persisted value. */
export function isPastePosition(value: unknown): value is PastePosition {
  return (
    value === "pointer" ||
    value === "viewport" ||
    value === "offset" ||
    value === "original"
  );
}
