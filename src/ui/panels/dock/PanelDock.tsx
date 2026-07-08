import { useEffect, useReducer, useState } from "react";
import { PanelShell } from "./PanelShell";
import { LayoutManagerDialog } from "./LayoutManagerDialog";
import { getPanelLayout, setPanelLayout } from "../../../app/preferences";
import {
  DOCK_LIMITS,
  dockReducer,
  normalizeDockState,
  syncPanelDefs,
  type DockState,
} from "./panel-dock-state";
import type { PanelDef } from "./panel-types";

/** Right-edge space the docked panel occupies, for the canvas to inset around. */
function reservedWidth(state: DockState): number {
  if (state.floating) return 0;
  return state.collapsed ? DOCK_LIMITS.COLLAPSED_W : state.dockedWidth;
}

interface PanelDockProps {
  defs: PanelDef[];
  /** Height (px) of the menu bar the dock sits below. */
  topOffset?: number;
}

function initDockState(ids: string[]): DockState {
  return syncPanelDefs(normalizeDockState(getPanelLayout()), ids);
}

/**
 * Mounts the Illustrator-style dockable accordion. Owns the dock reducer,
 * reconciles the registered panel set, and persists the layout at the end of
 * each interaction (matching draw's save-on-commit model rather than writing
 * localStorage on every drag frame).
 */
export function PanelDock({ defs, topOffset = 36 }: PanelDockProps) {
  const ids = defs.map((d) => d.id);
  const idsKey = ids.join("|");

  const [state, dispatch] = useReducer(dockReducer, ids, initDockState);
  const [layoutsOpen, setLayoutsOpen] = useState(false);

  // Reconcile if the registered panel set changes (rare; ids are static today).
  useEffect(() => {
    dispatch({ type: "sync", ids: idsKey.split("|").filter(Boolean) });
  }, [idsKey]);

  // Persist on every committed change. Writes are frequent during a drag but the
  // payload is tiny; keeping it synchronous with state guarantees the latest
  // layout is stored (surviving an immediate reload) with no stale-ref races.
  useEffect(() => {
    setPanelLayout(state);
  }, [state]);

  // Publish the reserved right space so the canvas can inset around a docked panel
  // (keeping Excalidraw's bottom-left zoom/undo controls clear of it). A floating
  // panel reserves nothing and simply overlays the canvas.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--flow-panel-reserved", `${reservedWidth(state)}px`);
    return () => {
      root.style.removeProperty("--flow-panel-reserved");
    };
  }, [state]);

  return (
    <>
      <PanelShell
        state={state}
        dispatch={dispatch}
        defs={defs}
        topOffset={topOffset}
        onManageLayouts={() => setLayoutsOpen(true)}
      />
      {layoutsOpen && (
        <LayoutManagerDialog
          currentState={state}
          onApply={(saved) => dispatch({ type: "applyLayout", state: saved })}
          onResetDefault={() => dispatch({ type: "resetDefault" })}
          onClose={() => setLayoutsOpen(false)}
        />
      )}
    </>
  );
}
