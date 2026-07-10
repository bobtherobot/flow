import { DEFAULT_HIDDEN_ITEM_IDS } from "./actions";

/** Persisted layout/config of the quick-actions bar. Mirrors ToolbarState but
 *  docks horizontally (top strip, right of the menu) instead of vertically. */
export interface QuickbarState {
  /** Whether the bar is shown at all (View ▸ Show Quick Actions / close button). */
  visible: boolean;
  /** Docked in the top strip (false) vs free-floating (true). */
  floating: boolean;
  /** Floating top-left, viewport pixels. Ignored while docked. */
  x: number;
  y: number;
  /** Item ids the user has hidden from the bar (tools are hidden by default). */
  hiddenItems: string[];
}

export const DEFAULT_QUICKBAR_STATE: QuickbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  // Tools, grid/zen toggles and undo/redo are opt-in: hidden until the user
  // adds them from the config menu.
  hiddenItems: [...DEFAULT_HIDDEN_ITEM_IDS],
};

/** Distance (px) from the top edge within which a dropped floating bar
 *  re-docks. Tight on purpose — only a near-flush drop should snap back. */
const REDOCK_MARGIN = 10;

/** Coerce an unknown persisted blob into a valid QuickbarState, filling any
 *  missing/invalid field from the default. Never throws. */
export function normalizeQuickbarState(raw: unknown): QuickbarState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_QUICKBAR_STATE;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : DEFAULT_QUICKBAR_STATE.visible,
    floating: typeof r.floating === "boolean" ? r.floating : DEFAULT_QUICKBAR_STATE.floating,
    x: typeof r.x === "number" ? r.x : DEFAULT_QUICKBAR_STATE.x,
    y: typeof r.y === "number" ? r.y : DEFAULT_QUICKBAR_STATE.y,
    // Only fall back to the default (tools hidden) when the field is absent
    // entirely; an explicit array — even empty — is the user's own choice.
    hiddenItems: Array.isArray(r.hiddenItems)
      ? r.hiddenItems.filter((t): t is string => typeof t === "string")
      : [...DEFAULT_QUICKBAR_STATE.hiddenItems],
  };
}

/** Toggle an item id's presence in `hiddenItems`, returning a new state. */
export function withHiddenToggled(state: QuickbarState, id: string): QuickbarState {
  const hidden = state.hiddenItems.includes(id)
    ? state.hiddenItems.filter((t) => t !== id)
    : [...state.hiddenItems, id];
  return { ...state, hiddenItems: hidden };
}

/** Whether a floating bar dropped with its top edge at `y` should re-dock. */
export function shouldRedock(y: number, margin: number = REDOCK_MARGIN): boolean {
  return y < margin;
}
