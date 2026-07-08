import { useDrag, type DragMove } from "./useDrag";
import type { PanelDef } from "./panel-types";
import type { SubPanelState } from "./panel-dock-state";

interface SubPanelProps {
  def: PanelDef;
  panel: SubPanelState;
  /** Registers this sub-panel's DOM node so the shell can measure it. */
  registerRef: (el: HTMLDivElement | null) => void;
  onToggleExpand: () => void;
  onClose: () => void;
  /** Re-dock a floating sub-panel back into the stack. */
  onDock: () => void;
  onHeaderDragStart: (e: React.PointerEvent) => void;
  onHeaderDragMove: (m: DragMove, e: PointerEvent) => void;
  onHeaderDragEnd: (m: DragMove, e: PointerEvent) => void;
  onResizeStart: () => void;
  onResizeMove: (m: DragMove) => void;
}

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className="flow-pnl-sub__chevron"
    data-open={open}
    width="10"
    height="10"
    viewBox="0 0 10 10"
    aria-hidden="true"
  >
    <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * One accordion section: a header (collapse chevron, title, actions, dock/close
 * buttons) plus collapsible content, and — when floating — a resize corner.
 * Presentational: all drag *decisions* live in the shell; this owns only the
 * `useDrag` wiring so each instance gets its own stable handlers.
 */
export function SubPanel({
  def,
  panel,
  registerRef,
  onToggleExpand,
  onClose,
  onDock,
  onHeaderDragStart,
  onHeaderDragMove,
  onHeaderDragEnd,
  onResizeStart,
  onResizeMove,
}: SubPanelProps) {
  const headerPointerDown = useDrag({
    threshold: 16,
    onStart: (e) => {
      if ((e.target as HTMLElement).closest("button")) return false;
      onHeaderDragStart(e);
    },
    onMove: onHeaderDragMove,
    onEnd: onHeaderDragEnd,
  });

  const resizePointerDown = useDrag({
    onStart: () => {
      onResizeStart();
    },
    onMove: onResizeMove,
  });

  const className = [
    "flow-pnl-sub",
    panel.expanded ? "" : "flow-pnl-sub--collapsed",
    panel.floating ? "flow-pnl-sub--floating" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const style = panel.floating
    ? { left: panel.floatX, top: panel.floatY, width: panel.floatW }
    : undefined;

  return (
    <section ref={registerRef} className={className} style={style} data-pid={panel.id}>
      <header
        className="flow-pnl-sub__header"
        onPointerDown={headerPointerDown}
        onClick={(e) => {
          // Header click toggles collapse, but not when a button was hit.
          if (!(e.target as HTMLElement).closest("button")) onToggleExpand();
        }}
      >
        <button
          type="button"
          className="flow-pnl-sub__btn flow-pnl-sub__disclosure"
          aria-expanded={panel.expanded}
          aria-label={panel.expanded ? "Collapse" : "Expand"}
          onClick={onToggleExpand}
        >
          <Chevron open={panel.expanded} />
        </button>
        <span className="flow-pnl-sub__title">{def.label}</span>
        {def.actions && <span className="flow-pnl-sub__actions">{def.actions}</span>}
        {panel.floating && (
          <button
            type="button"
            className="flow-pnl-sub__btn"
            aria-label="Dock panel"
            title="Dock"
            onClick={onDock}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1.5 4 H10.5" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="flow-pnl-sub__btn"
          aria-label={`Close ${def.label}`}
          title="Close"
          onClick={onClose}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 3 L9 9 M9 3 L3 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </header>
      {panel.expanded && <div className="flow-pnl-sub__content">{def.render()}</div>}
      {panel.floating && panel.expanded && (
        <span className="flow-pnl-sub__resize" onPointerDown={resizePointerDown} aria-hidden="true" />
      )}
    </section>
  );
}
