/** Persisted layout/config of the bottom bar. Mirrors QuickbarState but docks
 *  horizontally along the bottom-left edge instead of the top strip. */
export interface BottombarState {
  /** Whether the bar is shown at all (View ▸ Show Bottom Bar / close button). */
  visible: boolean;
  /** Docked bottom-left (false) vs free-floating (true). */
  floating: boolean;
  /** Floating top-left, viewport pixels. Ignored while docked. */
  x: number;
  y: number;
  /** Item ids the user has hidden from the bar (all shown by default). */
  hiddenItems: string[];
}

export const DEFAULT_BOTTOMBAR_STATE: BottombarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  // Everything is shown by default — the bar is a small, curated set.
  hiddenItems: [],
};

/** Distance (px) from the bottom edge within which a dropped floating bar
 *  re-docks. Mirrors the quickbar's REDOCK_MARGIN (measured from the opposite
 *  edge). */
const REDOCK_MARGIN = 48;

/** Coerce an unknown persisted blob into a valid BottombarState, filling any
 *  missing/invalid field from the default. Never throws. */
export function normalizeBottombarState(raw: unknown): BottombarState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_BOTTOMBAR_STATE;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : DEFAULT_BOTTOMBAR_STATE.visible,
    floating: typeof r.floating === "boolean" ? r.floating : DEFAULT_BOTTOMBAR_STATE.floating,
    x: typeof r.x === "number" ? r.x : DEFAULT_BOTTOMBAR_STATE.x,
    y: typeof r.y === "number" ? r.y : DEFAULT_BOTTOMBAR_STATE.y,
    hiddenItems: Array.isArray(r.hiddenItems)
      ? r.hiddenItems.filter((t): t is string => typeof t === "string")
      : [...DEFAULT_BOTTOMBAR_STATE.hiddenItems],
  };
}

/** Toggle an item id's presence in `hiddenItems`, returning a new state. */
export function withHiddenToggled(state: BottombarState, id: string): BottombarState {
  const hidden = state.hiddenItems.includes(id)
    ? state.hiddenItems.filter((t) => t !== id)
    : [...state.hiddenItems, id];
  return { ...state, hiddenItems: hidden };
}

/** Whether a floating bar whose top edge is at `topY` (with the given height,
 *  in a viewport of `viewportH`) should re-dock to the bottom edge. */
export function shouldRedock(
  topY: number,
  barHeight: number,
  viewportH: number,
  margin: number = REDOCK_MARGIN,
): boolean {
  return viewportH - (topY + barHeight) < margin;
}
