import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { SubPanel } from "./SubPanel";
import { PanelConfigMenu } from "./PanelConfigMenu";
import { useDrag, type DragMove } from "./useDrag";
import type { PanelDef } from "./panel-types";
import {
  DOCK_LIMITS,
  dockedPanels,
  orderedPanels,
  type DockAction,
  type DockState,
} from "./panel-dock-state";

/** Drag a docked sub-panel past this many px beyond the panel edge to tear off. */
const TEAR_OFF_MARGIN = 48;

interface PanelShellProps {
  state: DockState;
  dispatch: React.Dispatch<DockAction>;
  defs: PanelDef[];
  /** Height (px) of the app menu bar the panel sits below. */
  topOffset: number;
  onManageLayouts: () => void;
}

export function PanelShell({
  state,
  dispatch,
  defs,
  topOffset,
  onManageLayouts,
}: PanelShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const subRefs = useRef(new Map<string, HTMLDivElement>());

  const [configOpen, setConfigOpen] = useState(false);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // The docked sub-panel currently being dragged, rendered as a pointer-following
  // ghost (fixed at left/top). Null unless a docked reorder drag is in progress.
  const [ghost, setGhost] = useState<{
    id: string;
    left: number;
    top: number;
    width: number;
  } | null>(null);

  const defById = useCallback((id: string) => defs.find((d) => d.id === id), [defs]);

  // ── Keep a floating panel inside the viewport on window resize ──────────────
  useEffect(() => {
    const onResize = () => {
      dispatch({
        type: "clampToViewport",
        vw: window.innerWidth,
        vh: window.innerHeight,
        topOffset,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [dispatch, topOffset]);

  // ── Close the config menu on any outside pointer press ──────────────────────
  useEffect(() => {
    if (!configOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-pnl__hamburger")) return;
      setConfigOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [configOpen]);

  const idealFloatHeight = (): number => {
    const topbarH = shellRef.current?.querySelector(".flow-pnl__topbar")?.clientHeight ?? 34;
    const subH = dockedPanels(state).reduce(
      (sum, p) => sum + (subRefs.current.get(p.id)?.offsetHeight ?? 0),
      0,
    );
    const ideal = topbarH + subH + 2;
    const maxByViewport = window.innerHeight - topOffset - 16;
    return Math.max(DOCK_LIMITS.MIN_H, Math.min(ideal, DOCK_LIMITS.MAX_H, maxByViewport));
  };

  // ── Topbar drag: dock ⇄ float, then move while floating ─────────────────────
  const topbar = useRef({ ox: 0, oy: 0, ow: 0, floating: false });
  const onTopbarDown = useDrag({
    threshold: 25,
    onStart: (e) => {
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current!.getBoundingClientRect();
      topbar.current = { ox: r.left, oy: r.top, ow: r.width, floating: state.floating };
    },
    onMove: (m) => {
      const o = topbar.current;
      if (!o.floating) {
        dispatch({ type: "detach", floatX: o.ox, floatY: o.oy, floatW: o.ow, floatH: idealFloatHeight() });
        o.floating = true;
      }
      dispatch({
        type: "moveDock",
        floatX: o.ox + m.dx,
        floatY: Math.max(topOffset, o.oy + m.dy),
      });
    },
  });

  // ── Docked resize (left edge of the right-docked panel) ─────────────────────
  // The panel is pinned to the right, so dragging the inner (left) edge leftward
  // grows it — the width delta is the negative of the horizontal drag.
  const dockResize = useRef(0);
  const onDockResizeDown = useDrag({
    onStart: () => {
      if (state.floating || state.collapsed) return false;
      dockResize.current = state.dockedWidth;
    },
    onMove: (m) => dispatch({ type: "resizeDocked", dockedWidth: dockResize.current - m.dx }),
  });

  // ── Floating resize (right / bottom / SE corner) ────────────────────────────
  const floatResize = useRef({ w: 0, h: 0 });
  const beginFloatResize = () => {
    floatResize.current = { w: state.floatW, h: state.floatH };
  };
  const onFloatResizeRight = useDrag({
    onStart: () => (state.floating ? beginFloatResize() : false),
    onMove: (m) => dispatch({ type: "resizeFloat", floatW: floatResize.current.w + m.dx }),
  });
  const onFloatResizeBottom = useDrag({
    onStart: () => (state.floating ? beginFloatResize() : false),
    onMove: (m) => dispatch({ type: "resizeFloat", floatH: floatResize.current.h + m.dy }),
  });
  const onFloatResizeCorner = useDrag({
    onStart: () => (state.floating ? beginFloatResize() : false),
    onMove: (m) =>
      dispatch({
        type: "resizeFloat",
        floatW: floatResize.current.w + m.dx,
        floatH: floatResize.current.h + m.dy,
      }),
  });

  // ── Sub-panel header drag: tear off / reorder / move-while-floating ─────────
  const sub = useRef({ id: "", grabDX: 0, grabDY: 0, w: 0, floating: false });

  const computeDropIndex = (clientY: number, excludeId: string): number => {
    const list = dockedPanels(state).filter((p) => p.id !== excludeId);
    for (let i = 0; i < list.length; i += 1) {
      const r = subRefs.current.get(list[i].id)?.getBoundingClientRect();
      if (r && clientY < r.top + r.height / 2) return i;
    }
    return list.length;
  };

  const onSubDragStart = (id: string, e: React.PointerEvent) => {
    const r = subRefs.current.get(id)?.getBoundingClientRect();
    const p = state.panels.find((sp) => sp.id === id)!;
    sub.current = {
      id,
      grabDX: r ? e.clientX - r.left : 20,
      grabDY: r ? e.clientY - r.top : 12,
      w: r?.width ?? state.dockedWidth,
      floating: p.floating,
    };
  };

  const onSubDragMove = (id: string, _m: DragMove, e: PointerEvent) => {
    const s = sub.current;
    const place = { floatX: e.clientX - s.grabDX, floatY: Math.max(topOffset, e.clientY - s.grabDY) };
    if (s.floating) {
      dispatch({ type: "moveSubFloat", id, ...place });
      return;
    }
    const shellR = shellRef.current!.getBoundingClientRect();
    if (e.clientX < shellR.left - TEAR_OFF_MARGIN) {
      // Torn off: commit a real float and let the floating path take over — clear
      // the ghost so we don't double-render the panel.
      setDropIndex(null);
      setGhost(null);
      const floatW = state.floating ? state.floatW : state.dockedWidth;
      dispatch({ type: "floatSub", id, ...place, floatW });
      s.floating = true;
      return;
    }
    // Still in the dock: the panel lifts out of the accordion flow and follows
    // the pointer as a ghost, with the drop indicator marking the landing slot.
    setDropIndex(computeDropIndex(e.clientY, id));
    setGhost({ id, left: place.floatX, top: place.floatY, width: s.w });
  };

  const onSubDragEnd = (id: string, m: DragMove) => {
    if (!sub.current.floating && m.moved && dropIndex !== null) {
      dispatch({ type: "reorderSub", id, targetIndex: dropIndex });
    }
    setDropIndex(null);
    setGhost(null);
  };

  // ── Sub-panel floating resize ───────────────────────────────────────────────
  const subResize = useRef({ id: "", w: 0 });
  const onSubResizeStart = (id: string) => {
    const p = state.panels.find((sp) => sp.id === id);
    subResize.current = { id, w: p?.floatW ?? DOCK_LIMITS.MIN_W };
  };
  const onSubResizeMove = (id: string, m: DragMove) =>
    dispatch({ type: "resizeSubFloat", id, floatW: subResize.current.w + m.dx });

  const configAnchor = (): { top: number; left: number } => {
    const r = hamburgerRef.current?.getBoundingClientRect();
    return r ? { top: r.bottom + 4, left: r.left } : { top: topOffset, left: 8 };
  };

  const registerSubRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) subRefs.current.set(id, el);
    else subRefs.current.delete(id);
  };

  const renderSub = (id: string, dragStyle?: React.CSSProperties) => {
    const def = defById(id);
    const panel = state.panels.find((p) => p.id === id);
    if (!def || !panel) return null;
    const isDragging = dragStyle !== undefined;
    return (
      <SubPanel
        key={id}
        def={def}
        panel={panel}
        registerRef={registerSubRef(id)}
        onToggleExpand={() => dispatch({ type: "toggleSubExpanded", id })}
        onClose={() => dispatch({ type: "closeSub", id })}
        onDock={() => dispatch({ type: "dockSub", id })}
        onHeaderDragStart={(e) => onSubDragStart(id, e)}
        onHeaderDragMove={(m, e) => onSubDragMove(id, m, e)}
        onHeaderDragEnd={(m) => onSubDragEnd(id, m)}
        onResizeStart={() => onSubResizeStart(id)}
        onResizeMove={(m) => onSubResizeMove(id, m)}
        isDragging={isDragging}
        dragStyle={dragStyle}
      />
    );
  };

  const docked = dockedPanels(state);
  // While ghost-dragging, the dragged panel leaves the accordion flow (the list
  // reflows to close the gap); the drop indicator indices then line up with
  // `computeDropIndex`, which excludes the same id.
  const flowDocked = docked.filter((p) => p.id !== ghost?.id);
  const floating = orderedPanels(state).filter((p) => p.visible && p.floating);
  const showBody = !(state.collapsed && !state.floating);

  const shellClass = [
    "flow-pnl",
    state.floating ? "flow-pnl--floating" : "flow-pnl--docked",
    state.collapsed ? "flow-pnl--collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const shellStyle: React.CSSProperties = state.floating
    ? {
        left: state.floatX,
        top: state.floatY,
        width: state.floatW,
        height: state.collapsed ? "auto" : state.floatH,
      }
    : {
        right: 0,
        top: topOffset,
        bottom: 0,
        width: state.collapsed ? DOCK_LIMITS.COLLAPSED_W : state.dockedWidth,
      };

  return (
    <>
      <div ref={shellRef} className={shellClass} style={shellStyle}>
        <div className="flow-pnl__topbar" onPointerDown={onTopbarDown}>
          {showBody && (
            <span className="flow-pnl__grip" aria-hidden="true">⠿</span>
          )}
          <button
            type="button"
            className="flow-pnl__icon-btn"
            aria-label={state.collapsed ? "Expand panel" : "Collapse panel"}
            title="Toggle panel"
            onClick={() => dispatch({ type: "toggleCollapse" })}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path
                d={state.collapsed ? "M4.5 2 L8.5 6 L4.5 10" : "M2 4.5 L6 8.5 L10 4.5"}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {showBody && (
            <>
              <span className="flow-pnl__title">Controls</span>
              <button
                ref={hamburgerRef}
                type="button"
                className="flow-pnl__icon-btn flow-pnl__hamburger"
                aria-label="Panel options"
                aria-haspopup="menu"
                aria-expanded={configOpen}
                onClick={() => setConfigOpen((open) => !open)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M2 4 H12 M2 7 H12 M2 10 H12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
        </div>

        {showBody && (
          <div ref={bodyRef} className="flow-pnl__body">
            {docked.map((p) => {
              // The dragged panel stays mounted in place (so its drag listeners
              // survive) but renders as a fixed ghost — fixed positioning lifts it
              // out of the flow, so the accordion closes the gap. It consumes no
              // drop-indicator slot; indices track `flowDocked` (== computeDropIndex).
              const isDragged = p.id === ghost?.id;
              const i = isDragged ? -1 : flowDocked.findIndex((fp) => fp.id === p.id);
              return (
                <Fragment key={p.id}>
                  {!isDragged && dropIndex === i && <div className="flow-pnl__drop" />}
                  {renderSub(
                    p.id,
                    isDragged
                      ? { left: ghost.left, top: ghost.top, width: ghost.width }
                      : undefined,
                  )}
                </Fragment>
              );
            })}
            {dropIndex === flowDocked.length && <div className="flow-pnl__drop" />}
            {docked.length === 0 && (
              <p className="flow-pnl__empty">All panels are hidden or floating.</p>
            )}
          </div>
        )}

        {/* Resize affordances */}
        {!state.floating && !state.collapsed && (
          <span className="flow-pnl__resize flow-pnl__resize--left" onPointerDown={onDockResizeDown} aria-hidden="true" />
        )}
        {state.floating && !state.collapsed && (
          <>
            <span className="flow-pnl__resize flow-pnl__resize--right" onPointerDown={onFloatResizeRight} aria-hidden="true" />
            <span className="flow-pnl__resize flow-pnl__resize--bottom" onPointerDown={onFloatResizeBottom} aria-hidden="true" />
            <span className="flow-pnl__resize flow-pnl__resize--se" onPointerDown={onFloatResizeCorner} aria-hidden="true" />
          </>
        )}
      </div>

      {/* Floating sub-panels live outside the shell so they escape its bounds */}
      {floating.map((p) => renderSub(p.id))}

      {configOpen && (
        <PanelConfigMenu
          state={state}
          defs={defs}
          anchor={configAnchor()}
          onToggleFloating={() => {
            if (state.floating) {
              dispatch({ type: "dock" });
            } else {
              const r = shellRef.current!.getBoundingClientRect();
              dispatch({
                type: "detach",
                floatX: r.left + 24,
                floatY: Math.max(topOffset, r.top + 24),
                floatW: state.dockedWidth,
                floatH: idealFloatHeight(),
              });
            }
            setConfigOpen(false);
          }}
          onSetVisible={(id, visible) => dispatch({ type: "setSubVisible", id, visible })}
          onManageLayouts={() => {
            setConfigOpen(false);
            onManageLayouts();
          }}
          onResetDefault={() => {
            dispatch({ type: "resetDefault" });
            setConfigOpen(false);
          }}
        />
      )}
    </>
  );
}
