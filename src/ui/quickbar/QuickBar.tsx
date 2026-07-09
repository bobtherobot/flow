import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import "./quickbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import { QUICK_ITEMS } from "./actions";
import { quickIcon } from "./icons";
import { QuickButton } from "./QuickButton";
import { QuickbarConfigMenu } from "./QuickbarConfigMenu";
import { useQuickActions } from "./useQuickActions";
import { shouldRedock, withHiddenToggled, type QuickbarState } from "./quickbar-state";
import type { BindingMode } from "../../lib/binding-mode";

const MENUBAR_H = 36;
/** Fallback dock-left before the menu triggers are measured. */
const DEFAULT_DOCK_LEFT = 300;
/** Gap between the last menu trigger and the docked bar. */
const DOCK_GAP = 8;

interface QuickBarProps {
  api: ExcalidrawAPI | null;
  state: QuickbarState;
  onChange: (next: QuickbarState) => void;
  bindingMode: BindingMode;
  onSetBindingMode: (next: BindingMode) => void;
}

/** Measure the right edge of the last menu trigger so the docked bar sits just
 *  to the right of the main menu. Returns a fallback until the menu paints. */
function measureDockLeft(): number {
  const triggers = document.querySelectorAll(".flow-menubar__trigger");
  const last = triggers[triggers.length - 1];
  if (!last) return DEFAULT_DOCK_LEFT;
  return Math.round(last.getBoundingClientRect().right + DOCK_GAP);
}

/**
 * Flow-native horizontal quick-actions bar. Docks in the top strip to the right
 * of the main menu; tears off into a floating strip (drag the leading handle);
 * items shown/hidden from the hamburger menu. Actions/toggles dispatch through
 * the public Excalidraw API (plus flow's `executeAction`); the arrow-binding
 * lock is flow-owned.
 */
export function QuickBar({ api, state, onChange, bindingMode, onSetBindingMode }: QuickBarProps) {
  const { isActive, trigger } = useQuickActions(api, bindingMode, onSetBindingMode);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dockLeft, setDockLeft] = useState(DEFAULT_DOCK_LEFT);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Keep the docked left edge in step with the menu width (static, but cheap
  // to re-measure on resize / when re-docking).
  useLayoutEffect(() => {
    if (state.floating) return;
    const update = () => setDockLeft(measureDockLeft());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [state.floating, state.visible]);

  // Close the config menu on any outside pointer press (mirrors PanelShell).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-quickbar__hamburger")) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onHandlePointerDown = useDrag({
    onStart: (e) => {
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? dockLeft, y: r?.top ?? 0 };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      if (shouldRedock(origin.current.y + m.dy)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? { top: state.y, left: state.x }
    : { top: 0, left: dockLeft, right: 0, height: MENUBAR_H };

  const configAnchor: MenuPoint = (() => {
    const r = shellRef.current?.getBoundingClientRect();
    return { top: (r?.bottom ?? MENUBAR_H) + 4, left: r?.left ?? dockLeft };
  })();

  const visibleItems = QUICK_ITEMS.filter((i) => !state.hiddenItems.includes(i.id));

  return (
    <div
      ref={shellRef}
      className={`flow-quickbar ${state.floating ? "flow-quickbar--floating" : "flow-quickbar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label="Quick actions"
      aria-orientation="horizontal"
    >
      <div className="flow-quickbar__handle" onPointerDown={onHandlePointerDown}>
        <span className="flow-quickbar__grip" aria-hidden="true">⠿</span>
        <button
          type="button"
          className="flow-quickbar__iconbtn flow-quickbar__hamburger"
          aria-label="Quick actions options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
      </div>

      <div className="flow-quickbar__items">
        {visibleItems.map((item, i) => {
          const prev = visibleItems[i - 1];
          const sep = prev && prev.group !== item.group;
          return (
            <span key={item.id} className="flow-quickbar__cell">
              {sep && <span className="flow-quickbar__sep" aria-hidden="true" />}
              <QuickButton
                icon={quickIcon(item.id)}
                label={item.label}
                shortcut={item.shortcut}
                active={isActive(item)}
                onClick={() => trigger(item)}
              />
            </span>
          );
        })}
      </div>

      {menuOpen && (
        <QuickbarConfigMenu
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
