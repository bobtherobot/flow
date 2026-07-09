import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./toolbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import { TOOLS, LOCK_ID } from "./tools";
import { TOOL_ICONS } from "./icons";
import { ToolButton } from "./ToolButton";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { useActiveTool } from "./useActiveTool";
import { shouldRedock, withHiddenToggled, type ToolbarState } from "./toolbar-state";

const RAIL_WIDTH = 48;
const MENUBAR_H = 36;

interface ToolBarProps {
  api: ExcalidrawAPI | null;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
}

/** Anchor the config dropdown just to the right of the rail's top-left. */
function configAnchor(el: HTMLElement | null): MenuPoint {
  const r = el?.getBoundingClientRect();
  return { top: r?.top ?? MENUBAR_H, left: (r?.right ?? RAIL_WIDTH) + 4 };
}

/**
 * Flow-native vertical tool rail. Docked to the left edge by default; can be
 * torn off into a floating strip (drag the top bar) or docked/undocked and have
 * tools shown/hidden from the hamburger menu. Drives tool selection through the
 * public Excalidraw API; the native island is hidden via CSS.
 */
export function ToolBar({ api, state, onChange }: ToolBarProps) {
  const { activeType, arrowType, locked, setTool, toggleLock } = useActiveTool(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Reserve the left gutter so the canvas insets around a docked rail (keeping
  // Excalidraw's bottom-left zoom/undo controls clear). Floating/hidden = 0.
  useEffect(() => {
    const root = document.documentElement;
    const reserved = state.visible && !state.floating ? RAIL_WIDTH : 0;
    root.style.setProperty("--flow-toolbar-reserved", `${reserved}px`);
    return () => {
      root.style.removeProperty("--flow-toolbar-reserved");
    };
  }, [state.visible, state.floating]);

  // Close the config menu on any outside pointer press (mirrors PanelShell).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-toolbar__hamburger")) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onTopbarPointerDown = useDrag({
    onStart: (e) => {
      // Don't start a drag from the hamburger/close buttons.
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? 0, y: r?.top ?? MENUBAR_H };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      if (shouldRedock(origin.current.x + m.dx)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? { width: RAIL_WIDTH, top: state.y, left: state.x }
    : { width: RAIL_WIDTH, top: MENUBAR_H, left: 0, bottom: 0 };

  return (
    <div
      ref={shellRef}
      className={`flow-toolbar ${state.floating ? "flow-toolbar--floating" : "flow-toolbar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
    >
      <div className="flow-toolbar__topbar" onPointerDown={onTopbarPointerDown}>
        <button
          type="button"
          className="flow-toolbar__iconbtn flow-toolbar__hamburger"
          aria-label="Toolbar options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
        <button
          type="button"
          className="flow-toolbar__iconbtn"
          aria-label="Close toolbar"
          onClick={() => onChange({ ...state, visible: false })}
        >
          ✕
        </button>
      </div>

      <div className="flow-toolbar__tools">
        {TOOLS.filter((t) => !state.hiddenTools.includes(t.id)).map((t) => {
          const toolType = t.toolType ?? t.id;
          // Arrow variants share activeType "arrow"; disambiguate on the shape.
          const active =
            activeType === toolType && (t.arrowType === undefined || arrowType === t.arrowType);
          return (
            <ToolButton
              key={t.id}
              icon={TOOL_ICONS[t.id]}
              label={t.label}
              shortcut={t.shortcut}
              active={active}
              onClick={() => setTool(toolType, t.arrowType)}
            />
          );
        })}
      </div>

      {!state.hiddenTools.includes(LOCK_ID) && (
        <div className="flow-toolbar__foot">
          <ToolButton
            icon={TOOL_ICONS[LOCK_ID]}
            label="Keep tool active"
            active={locked}
            onClick={toggleLock}
          />
        </div>
      )}

      {menuOpen && (
        <ToolbarConfigMenu
          floating={state.floating}
          hiddenTools={state.hiddenTools}
          anchor={configAnchor(shellRef.current)}
          onToggleFloating={() => {
            onChange({ ...state, floating: !state.floating });
            setMenuOpen(false);
          }}
          onToggleTool={(id) => onChange(withHiddenToggled(state, id))}
        />
      )}
    </div>
  );
}
