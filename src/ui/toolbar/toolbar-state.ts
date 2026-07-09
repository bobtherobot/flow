/** Persisted layout/config of the tool rail. */
export interface ToolbarState {
  /** Whether the rail is shown at all (View ▸ Show Toolbar / close button). */
  visible: boolean;
  /** Docked to the left edge (false) vs free-floating (true). */
  floating: boolean;
  /** Floating top-left, viewport pixels. Ignored while docked. */
  x: number;
  y: number;
  /** Tool ids (and LOCK_ID) the user has hidden from the rail. */
  hiddenTools: string[];
}

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  hiddenTools: [],
};

/** Distance (px) from the left edge within which a dropped floating rail
 *  re-docks. Tight on purpose — only a near-flush drop should snap back. */
const REDOCK_MARGIN = 10;

/** Coerce an unknown persisted blob into a valid ToolbarState, filling any
 *  missing/invalid field from the default. Never throws. */
export function normalizeToolbarState(raw: unknown): ToolbarState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_TOOLBAR_STATE;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : DEFAULT_TOOLBAR_STATE.visible,
    floating: typeof r.floating === "boolean" ? r.floating : DEFAULT_TOOLBAR_STATE.floating,
    x: typeof r.x === "number" ? r.x : DEFAULT_TOOLBAR_STATE.x,
    y: typeof r.y === "number" ? r.y : DEFAULT_TOOLBAR_STATE.y,
    hiddenTools: Array.isArray(r.hiddenTools)
      ? r.hiddenTools.filter((t): t is string => typeof t === "string")
      : [],
  };
}

/** Toggle a tool id's presence in `hiddenTools`, returning a new state. */
export function withHiddenToggled(state: ToolbarState, id: string): ToolbarState {
  const hidden = state.hiddenTools.includes(id)
    ? state.hiddenTools.filter((t) => t !== id)
    : [...state.hiddenTools, id];
  return { ...state, hiddenTools: hidden };
}

/** Whether a floating rail dropped with its left edge at `x` should re-dock. */
export function shouldRedock(x: number, margin: number = REDOCK_MARGIN): boolean {
  return x < margin;
}
