/**
 * Dock state: the pure, framework-free heart of the Illustrator-style panel
 * system, ported from draw's panel-manager.js `_ps` model. Holds the main
 * panel's dock/float/collapse geometry and per-sub-panel state (visibility,
 * expanded, order, floating geometry), plus a reducer of immutable transitions.
 *
 * No React, no DOM, no Excalidraw — so it unit-tests in isolation (mirrors
 * roughness.ts / selection-style.ts). The React provider owns pointer wiring and
 * persistence; this module owns the state math. flow docks on the LEFT edge
 * (below the menu bar), the mirror of draw's right-edge dock.
 */

export const DOCK_LIMITS = {
  /** Width of the collapsed docked strip (just the chevron). */
  COLLAPSED_W: 40,
  MIN_W: 200,
  MAX_W: 520,
  MIN_H: 120,
  MAX_H: 960,
} as const;

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export interface SubPanelState {
  id: string;
  visible: boolean;
  expanded: boolean;
  order: number;
  floating: boolean;
  floatX: number;
  floatY: number;
  floatW: number;
}

export interface DockState {
  collapsed: boolean;
  floating: boolean;
  floatX: number;
  floatY: number;
  floatW: number;
  floatH: number;
  dockedWidth: number;
  panels: SubPanelState[];
}

export const DEFAULT_DOCK_STATE: DockState = {
  collapsed: false,
  floating: false,
  floatX: 72,
  floatY: 72,
  floatW: 260,
  floatH: 520,
  dockedWidth: 260,
  panels: [],
};

/** Renames of persisted panel ids, so an existing layout keeps a panel's
 *  position/visibility after it's renamed in code. `style` → `color` (the Style
 *  panel became the Color panel). */
const LEGACY_PANEL_ID_RENAMES: Record<string, string> = {
  style: "color",
};

function renamePanelId(id: string): string {
  return LEGACY_PANEL_ID_RENAMES[id] ?? id;
}

function makeSubPanel(id: string, order: number): SubPanelState {
  return {
    id,
    visible: true,
    expanded: true,
    order,
    floating: false,
    floatX: 120,
    floatY: 80,
    floatW: 240,
  };
}

/** Panels sorted by their `order`, as a new array (never mutates input). */
export function orderedPanels(state: DockState): SubPanelState[] {
  return [...state.panels].sort((a, b) => a.order - b.order);
}

/** Visible, non-floating panels in order — the docked accordion stack. */
export function dockedPanels(state: DockState): SubPanelState[] {
  return orderedPanels(state).filter((p) => p.visible && !p.floating);
}

/** Rewrite every panel's `order` to its index in `sequence` (by id). */
function withOrders(state: DockState, sequence: SubPanelState[]): DockState {
  const orderById = new Map(sequence.map((p, i) => [p.id, i]));
  return {
    ...state,
    panels: state.panels.map((p) => {
      const order = orderById.get(p.id);
      return order === undefined || order === p.order ? p : { ...p, order };
    }),
  };
}

/**
 * Coerce an unknown persisted blob into a valid DockState, clamping numeric
 * geometry and dropping malformed fields. Panels array is normalized per entry;
 * anything unparseable falls back to defaults.
 */
export function normalizeDockState(raw: unknown): DockState {
  const base: DockState = { ...DEFAULT_DOCK_STATE, panels: [] };
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Record<string, unknown>;

  if (typeof s.collapsed === "boolean") base.collapsed = s.collapsed;
  if (typeof s.floating === "boolean") base.floating = s.floating;
  if (typeof s.floatX === "number") base.floatX = s.floatX;
  if (typeof s.floatY === "number") base.floatY = s.floatY;
  if (typeof s.floatW === "number")
    base.floatW = clamp(s.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W);
  if (typeof s.floatH === "number")
    base.floatH = clamp(s.floatH, DOCK_LIMITS.MIN_H, DOCK_LIMITS.MAX_H);
  if (typeof s.dockedWidth === "number")
    base.dockedWidth = clamp(s.dockedWidth, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W);

  if (Array.isArray(s.panels)) {
    base.panels = s.panels
      .filter((p): p is Record<string, unknown> => !!p && typeof p === "object")
      .filter((p) => typeof p.id === "string")
      .map((p, i) => {
        const seed = makeSubPanel(renamePanelId(p.id as string), i);
        return {
          ...seed,
          visible: typeof p.visible === "boolean" ? p.visible : seed.visible,
          expanded: typeof p.expanded === "boolean" ? p.expanded : seed.expanded,
          order: typeof p.order === "number" ? p.order : seed.order,
          floating: typeof p.floating === "boolean" ? p.floating : seed.floating,
          floatX: typeof p.floatX === "number" ? p.floatX : seed.floatX,
          floatY: typeof p.floatY === "number" ? p.floatY : seed.floatY,
          floatW:
            typeof p.floatW === "number"
              ? clamp(p.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W)
              : seed.floatW,
        };
      });
  }
  return base;
}

/**
 * Ensure a state entry exists for every registered panel id, in the given
 * declaration order. Missing panels are appended (visible, expanded); existing
 * state is preserved. Orphan entries (no matching id) are dropped so stale
 * panels don't linger.
 */
export function syncPanelDefs(state: DockState, ids: readonly string[]): DockState {
  const known = new Set(ids);
  const kept = state.panels.filter((p) => known.has(p.id));
  const nextOrder = kept.reduce((max, p) => Math.max(max, p.order), -1);
  const missing = ids
    .filter((id) => !kept.some((p) => p.id === id))
    .map((id, i) => makeSubPanel(id, nextOrder + 1 + i));
  const panels = [...kept, ...missing];
  if (panels.length === state.panels.length && missing.length === 0) return state;
  return { ...state, panels };
}

export type DockAction =
  | { type: "toggleCollapse" }
  | {
      type: "detach";
      floatX: number;
      floatY: number;
      floatW: number;
      floatH: number;
    }
  | { type: "dock" }
  | { type: "moveDock"; floatX: number; floatY: number }
  | { type: "resizeFloat"; floatW?: number; floatH?: number }
  | { type: "resizeDocked"; dockedWidth: number }
  | { type: "clampToViewport"; vw: number; vh: number; topOffset: number }
  | { type: "toggleSubExpanded"; id: string }
  | { type: "openSub"; id: string }
  | { type: "setSubVisible"; id: string; visible: boolean }
  | { type: "closeSub"; id: string }
  | { type: "floatSub"; id: string; floatX: number; floatY: number; floatW: number }
  | { type: "moveSubFloat"; id: string; floatX: number; floatY: number }
  | { type: "resizeSubFloat"; id: string; floatW: number }
  | { type: "dockSub"; id: string }
  | { type: "reorderSub"; id: string; targetIndex: number }
  | { type: "sync"; ids: readonly string[] }
  | { type: "applyLayout"; state: DockState }
  | { type: "resetDefault" };

function mapPanel(
  state: DockState,
  id: string,
  fn: (p: SubPanelState) => SubPanelState,
): DockState {
  return {
    ...state,
    panels: state.panels.map((p) => (p.id === id ? fn(p) : p)),
  };
}

export function dockReducer(state: DockState, action: DockAction): DockState {
  switch (action.type) {
    case "toggleCollapse":
      return { ...state, collapsed: !state.collapsed };

    case "detach":
      return {
        ...state,
        floating: true,
        floatX: action.floatX,
        floatY: action.floatY,
        floatW: clamp(action.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W),
        floatH: clamp(action.floatH, DOCK_LIMITS.MIN_H, DOCK_LIMITS.MAX_H),
      };

    case "dock":
      return { ...state, floating: false };

    case "moveDock":
      return { ...state, floatX: action.floatX, floatY: action.floatY };

    case "resizeFloat":
      return {
        ...state,
        floatW:
          action.floatW === undefined
            ? state.floatW
            : clamp(action.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W),
        floatH:
          action.floatH === undefined
            ? state.floatH
            : clamp(action.floatH, DOCK_LIMITS.MIN_H, DOCK_LIMITS.MAX_H),
      };

    case "resizeDocked":
      return {
        ...state,
        dockedWidth: clamp(action.dockedWidth, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W),
      };

    case "clampToViewport": {
      if (!state.floating) return state;
      const floatX = clamp(state.floatX, 0, Math.max(0, action.vw - state.floatW));
      const floatY = clamp(
        state.floatY,
        action.topOffset,
        Math.max(action.topOffset, action.vh - DOCK_LIMITS.MIN_H),
      );
      const maxH = action.vh - floatY;
      const floatH = state.floatH > maxH ? Math.max(DOCK_LIMITS.MIN_H, maxH) : state.floatH;
      if (floatX === state.floatX && floatY === state.floatY && floatH === state.floatH)
        return state;
      return { ...state, floatX, floatY, floatH };
    }

    case "toggleSubExpanded":
      return mapPanel(state, action.id, (p) => ({ ...p, expanded: !p.expanded }));

    case "openSub":
      // Reveal a panel (e.g. driven by an external trigger like running a
      // search): make it visible + expanded and un-collapse the dock so it's
      // actually seen. A floating panel is left floating (respecting a tear-off).
      return {
        ...mapPanel(state, action.id, (p) => ({ ...p, visible: true, expanded: true })),
        collapsed: false,
      };

    case "setSubVisible":
      return mapPanel(state, action.id, (p) => ({
        ...p,
        visible: action.visible,
        floating: action.visible ? p.floating : false,
      }));

    case "closeSub":
      return mapPanel(state, action.id, (p) => ({
        ...p,
        visible: false,
        floating: false,
      }));

    case "floatSub":
      return mapPanel(state, action.id, (p) => ({
        ...p,
        floating: true,
        floatX: action.floatX,
        floatY: action.floatY,
        floatW: clamp(action.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W),
      }));

    case "moveSubFloat":
      return mapPanel(state, action.id, (p) => ({
        ...p,
        floatX: action.floatX,
        floatY: action.floatY,
      }));

    case "resizeSubFloat":
      return mapPanel(state, action.id, (p) => ({
        ...p,
        floatW: clamp(action.floatW, DOCK_LIMITS.MIN_W, DOCK_LIMITS.MAX_W),
      }));

    case "dockSub":
      return mapPanel(state, action.id, (p) => ({ ...p, floating: false }));

    case "reorderSub": {
      const moved = state.panels.find((p) => p.id === action.id);
      if (!moved) return state;
      const docked = dockedPanels(state).filter((p) => p.id !== action.id);
      const index = clamp(action.targetIndex, 0, docked.length);
      docked.splice(index, 0, moved);
      const rest = orderedPanels(state).filter((p) => !docked.includes(p));
      return withOrders(state, [...docked, ...rest]);
    }

    case "sync":
      return syncPanelDefs(state, action.ids);

    case "applyLayout": {
      const saved = normalizeDockState(action.state);
      const byId = new Map(saved.panels.map((p) => [p.id, p]));
      return {
        ...saved,
        // Keep the live set of panels; overlay saved per-panel fields by id.
        panels: state.panels.map((p) => {
          const s = byId.get(p.id);
          return s ? { ...p, ...s } : p;
        }),
      };
    }

    case "resetDefault":
      return {
        ...state,
        collapsed: false,
        floating: false,
        dockedWidth: DEFAULT_DOCK_STATE.dockedWidth,
        panels: orderedPanels(state).map((p, i) => ({
          ...p,
          visible: true,
          expanded: true,
          floating: false,
          order: i,
        })),
      };

    default:
      return state;
  }
}

/** Deep-clone the state for saving as a named layout snapshot. */
export function captureLayout(state: DockState): DockState {
  return structuredClone(state);
}
