import { useLayoutEffect, useRef, useState } from "react";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";
// TEMPORARY (Task 2 → removed in Task 7): the config menu still shows every tool so
// this commit changes no UI. Task 7 hands each rail its own list as a prop.
import { ALL_TOOLS } from "./tools";

interface ToolbarConfigMenuProps {
  floating: boolean;
  hiddenTools: string[];
  /** Ideal top-left (near the hamburger); clamped into the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onToggleTool: (id: string) => void;
  /** Hide the whole rail (mirrors View ▸ Show Toolbar). */
  onHide: () => void;
}

/**
 * The rail's hamburger dropdown: dock/detach the rail, and show/hide each tool.
 * Reuses the panel config-menu styles (`.flow-pnl-config*`, global in panels.css)
 * and the shared `clampMenuPosition` so it stays fully on-screen.
 */
export function ToolbarConfigMenu({
  floating,
  hiddenTools,
  anchor,
  onToggleFloating,
  onToggleTool,
  onHide,
}: ToolbarConfigMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Pull the menu fully on-screen before paint (useLayoutEffect = pre-paint).
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
  }, [anchor]);

  const rows = ALL_TOOLS.map((t) => ({ id: t.id as string, label: t.label }));

  return (
    <div
      ref={ref}
      className="flow-pnl-config"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onToggleFloating}
      >
        {floating ? "Dock toolbar" : "Detach toolbar"}
      </button>
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onHide}
      >
        Hide toolbar
      </button>
      <div className="flow-pnl-config__sep" />
      {rows.map((r) => (
        <label key={r.id} className="flow-pnl-config__item">
          <input
            type="checkbox"
            checked={!hiddenTools.includes(r.id)}
            onChange={() => onToggleTool(r.id)}
          />
          {r.label}
        </label>
      ))}
    </div>
  );
}
