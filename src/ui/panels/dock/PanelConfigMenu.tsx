import type { PanelDef } from "./panel-types";
import { orderedPanels, type DockState } from "./panel-dock-state";

interface PanelConfigMenuProps {
  state: DockState;
  defs: PanelDef[];
  style: React.CSSProperties;
  onToggleFloating: () => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onManageLayouts: () => void;
  onResetDefault: () => void;
}

/**
 * The hamburger dropdown: dock/detach the whole panel, toggle each sub-panel's
 * visibility, reset to the default layout, or open the layout manager.
 * Positioned by the shell (fixed, near the hamburger button).
 */
export function PanelConfigMenu({
  state,
  defs,
  style,
  onToggleFloating,
  onSetVisible,
  onManageLayouts,
  onResetDefault,
}: PanelConfigMenuProps) {
  const labelOf = (id: string) => defs.find((d) => d.id === id)?.label ?? id;

  return (
    <div className="flow-pnl-config" style={style} role="menu">
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
