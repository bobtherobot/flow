import { useLayoutEffect, useRef, useState } from "react";
import type { PanelDef } from "./panel-types";
import { orderedPanels, type DockState } from "./panel-dock-state";
import { clampMenuPosition, type MenuPoint } from "./menu-position";

interface PanelConfigMenuProps {
  state: DockState;
  defs: PanelDef[];
  /** Ideal top-left (under the hamburger). Clamped to the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onManageLayouts: () => void;
  onResetDefault: () => void;
}

/**
 * The hamburger dropdown: dock/detach the whole panel, toggle each sub-panel's
 * visibility, reset to the default layout, or open the layout manager.
 * Anchored under the hamburger button, but clamps itself inside the viewport so
 * it stays fully visible regardless of which edge the panel is docked against.
 */
export function PanelConfigMenu({
  state,
  defs,
  anchor,
  onToggleFloating,
  onSetVisible,
  onManageLayouts,
  onResetDefault,
}: PanelConfigMenuProps) {
  const labelOf = (id: string) => defs.find((d) => d.id === id)?.label ?? id;

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Measure the rendered menu and pull it fully on-screen before the browser
  // paints (useLayoutEffect runs pre-paint, so there's no visible jump).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(
      clampMenuPosition(
        anchor,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor.top, anchor.left]);

  return (
    <div
      ref={ref}
      className="flow-pnl-config"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <button type="button" className="flow-pnl-config__action" role="menuitem" onClick={onToggleFloating}>
        {state.floating ? "Dock panel" : "Detach panel"}
      </button>
      <div className="flow-pnl-config__sep" />
      {orderedPanels(state).map((p) => (
        <label key={p.id} className="flow-pnl-config__item">
          <input
            type="checkbox"
            checked={p.visible}
            onChange={(e) => onSetVisible(p.id, e.target.checked)}
          />
          {labelOf(p.id)}
        </label>
      ))}
      <div className="flow-pnl-config__sep" />
      <button type="button" className="flow-pnl-config__action" role="menuitem" onClick={onResetDefault}>
        Reset to default
      </button>
      <button type="button" className="flow-pnl-config__action" role="menuitem" onClick={onManageLayouts}>
        Manage layouts…
      </button>
    </div>
  );
}
