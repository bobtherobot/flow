/** flow's persistent marquee (drag-selection) mode. Written into
 *  `appState.selectionMode`, which the fork's `getElementsWithinSelection` honors
 *  at the box-select call site:
 *    - "enclose" → select only elements the marquee fully contains (Excalidraw's
 *      default)
 *    - "touch"   → select any element the marquee rectangle intersects
 *  flow defaults to "enclose" to preserve Excalidraw's stock behavior. */
export type SelectionMode = "touch" | "enclose";

export const DEFAULT_SELECTION_MODE: SelectionMode = "enclose";

/** Presentation order in the Preferences panel (touch first, per the UI spec). */
export const SELECTION_MODE_ORDER: readonly SelectionMode[] = ["touch", "enclose"];

export const SELECTION_MODE_LABELS: Record<SelectionMode, string> = {
  touch: "marquee touch",
  enclose: "marquee enclose",
};

/** Type guard for an unknown persisted value. */
export function isSelectionMode(value: unknown): value is SelectionMode {
  return value === "touch" || value === "enclose";
}
