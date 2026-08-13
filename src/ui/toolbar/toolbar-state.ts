/** Persisted layout/config of the tool rail. */
export interface ToolbarState {
  /** Whether the rail is shown at all (View ▸ Show Toolbar / close button). */
  visible: boolean;
  /** Docked to the left edge (false) vs free-floating (true). */
  floating: boolean;
  /** Floating top-left, viewport pixels. Ignored while docked. */
  x: number;
  y: number;
  /** Tool ids the user has hidden from the rail. */
  hiddenTools: string[];
}

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  hiddenTools: [],
};

/** The shapebar's factory state. Structurally identical to the toolbar's, but a
 *  separate object: Reset Layout copies each one independently, and the two are
 *  free to diverge later without a shared literal to untangle. Visible by
 *  default — anything else and the shape tools disappear on upgrade. */
export const DEFAULT_SHAPEBAR_STATE: ToolbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  hiddenTools: [],
};

/** Distance (px) from the left edge within which a dropped floating rail
 *  re-docks. Tight on purpose — only a near-flush drop should snap back. */
const REDOCK_MARGIN = 10;

/**
 * Coerce an unknown persisted blob into a valid ToolbarState, filling any
 * missing/invalid field from `defaults`. Never throws.
 *
 * `defaults` is a parameter, not a hardcoded `DEFAULT_TOOLBAR_STATE` read, so
 * this stays correct for the shapebar too: `DEFAULT_SHAPEBAR_STATE` is a
 * separate object specifically so the two are free to diverge later, and a
 * hardcoded toolbar default here would have silently defeated that the
 * moment they did — a partial `flow.shapebar` payload would inherit the
 * *toolbar's* defaults instead of its own.
 */
export function normalizeToolbarState(
  raw: unknown,
  defaults: ToolbarState = DEFAULT_TOOLBAR_STATE,
): ToolbarState {
  if (typeof raw !== "object" || raw === null) return defaults;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : defaults.visible,
    floating: typeof r.floating === "boolean" ? r.floating : defaults.floating,
    x: typeof r.x === "number" ? r.x : defaults.x,
    y: typeof r.y === "number" ? r.y : defaults.y,
    hiddenTools: Array.isArray(r.hiddenTools)
      ? r.hiddenTools.filter((t): t is string => typeof t === "string")
      : defaults.hiddenTools,
  };
}

/** Toggle a tool id's presence in `hiddenTools`, returning a new state. */
export function withHiddenToggled(state: ToolbarState, id: string): ToolbarState {
  const hidden = state.hiddenTools.includes(id)
    ? state.hiddenTools.filter((t) => t !== id)
    : [...state.hiddenTools, id];
  return { ...state, hiddenTools: hidden };
}

/**
 * Whether a floating rail dropped with its left edge at `dropX` should re-dock
 * into the slot whose left edge is `slotX`.
 *
 * The slot is a parameter because the shapebar's slot is not at 0 — it sits to
 * the right of a docked toolbar. Testing against the screen edge instead would
 * make a floating shapebar impossible to re-dock by dragging.
 */
export function shouldRedock(
  dropX: number,
  slotX: number,
  margin: number = REDOCK_MARGIN,
): boolean {
  return dropX - slotX < margin;
}
