import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./bottombar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import { BOTTOM_ITEMS } from "./items";
import { bottomIcon } from "./icons";
import { BottomButton } from "./BottomButton";
import { ZoomControl } from "./ZoomControl";
import { BackgroundControl } from "./BackgroundControl";
import { SearchControl } from "./SearchControl";
import { BottombarConfigMenu } from "./BottombarConfigMenu";
import { useBottomActions } from "./useBottomActions";
import { shouldRedock, withHiddenToggled, type BottombarState } from "./bottombar-state";

/** Fallback bar height before the shell is measured (for redock math). */
const APPROX_H = 44;
/** Hairline breathing gap between the docked bar and the tool rail's edge. */
const RAIL_GAP = 1;

interface BottomBarProps {
  api: ExcalidrawAPI | null;
  state: BottombarState;
  onChange: (next: BottombarState) => void;
  /** Run a search — routed to the Search sub-panel in the controls dock. */
  onSearch: (query: string) => void;
  /**
   * Width (px) reserved on the left by the docked tool rail. The docked bar
   * tucks flush against its right edge so it never overlaps the rail; 0 when the
   * rail is floating/hidden (bar sits flush to the viewport's left edge).
   */
  toolbarReserved: number;
}

/**
 * Flow-native horizontal bottom bar: grid/zen toggles, zoom cluster, canvas
 * background swatch, and inline search. Docks bottom-left (clearing the tool
 * rail); tears off into a floating strip (drag the leading handle); items
 * shown/hidden from the hamburger menu. Sibling of the quick-actions bar.
 */
export function BottomBar({ api, state, onChange, onSearch, toolbarReserved }: BottomBarProps) {
  const actions = useBottomActions(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const dockLeft = toolbarReserved > 0 ? toolbarReserved + RAIL_GAP : 0;
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Close the config menu on any outside pointer press (mirrors QuickBar).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-bottombar__hamburger")) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onHandlePointerDown = useDrag({
    onStart: (e) => {
      if ((e.target as HTMLElement).closest("button, input")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? dockLeft, y: r?.top ?? 0 };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      const h = shellRef.current?.getBoundingClientRect().height ?? APPROX_H;
      if (shouldRedock(origin.current.y + m.dy, h, window.innerHeight)) {
        onChange({ ...state, floating: false });
      }
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? { top: state.y, left: state.x }
    : { bottom: 0, left: dockLeft };

  const configAnchor: MenuPoint = (() => {
    const r = shellRef.current?.getBoundingClientRect();
    return { top: (r?.top ?? window.innerHeight) - 4, left: r?.left ?? dockLeft };
  })();

  const visibleItems = BOTTOM_ITEMS.filter((i) => !state.hiddenItems.includes(i.id));

  return (
    <div
      ref={shellRef}
      className={`flow-bottombar ${state.floating ? "flow-bottombar--floating" : "flow-bottombar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label="Bottom bar"
      aria-orientation="horizontal"
    >
      <div className="flow-bottombar__handle" onPointerDown={onHandlePointerDown}>
        <span className="flow-bottombar__grip" aria-hidden="true">⠿</span>
        <button
          type="button"
          className="flow-bottombar__iconbtn flow-bottombar__hamburger"
          aria-label="Bottom bar options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
      </div>

      <div className="flow-bottombar__items">
        {visibleItems.map((item, i) => {
          const prev = visibleItems[i - 1];
          const sep = prev && prev.group !== item.group;
          return (
            <span key={item.id} className="flow-bottombar__cell">
              {sep && <span className="flow-bottombar__sep" aria-hidden="true" />}
              {item.kind === "toggle" && (
                <BottomButton
                  icon={bottomIcon(item.id)}
                  label={item.label}
                  shortcut={item.shortcut}
                  active={actions.isActive(item)}
                  onClick={() => actions.toggle(item)}
                />
              )}
              {item.kind === "zoom" && (
                <ZoomControl
                  pct={actions.zoomPct}
                  onZoomIn={actions.zoomIn}
                  onZoomOut={actions.zoomOut}
                  onReset={actions.resetZoom}
                />
              )}
              {item.kind === "background" && (
                <BackgroundControl value={actions.background} onChange={actions.setBackground} />
              )}
              {item.kind === "search" && <SearchControl onExecute={onSearch} />}
            </span>
          );
        })}
      </div>

      {menuOpen && (
        <BottombarConfigMenu
          floating={state.floating}
          hiddenItems={state.hiddenItems}
          anchor={configAnchor}
          onToggleFloating={() => {
            onChange({ ...state, floating: !state.floating });
            setMenuOpen(false);
          }}
          onToggleItem={(id) => onChange(withHiddenToggled(state, id))}
          onHide={() => {
            onChange({ ...state, visible: false });
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
