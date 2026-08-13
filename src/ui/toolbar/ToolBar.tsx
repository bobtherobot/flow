import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./toolbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useSelectionStyle } from "../panels/useSelectionStyle";
import { useDrag } from "../panels/dock/useDrag";
// TEMPORARY (Task 2 → removed in Task 7): the rail still renders every tool so
// this commit changes no UI. Task 7 hands each rail its own list as a prop.
import { ALL_TOOLS } from "./tools";
import { TOOL_ICONS } from "./icons";
import { ToolButton } from "./ToolButton";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { RailColorControl } from "./RailColorControl";
import { useActiveTool } from "./useActiveTool";
import { shouldRedock, withHiddenToggled, type ToolbarState } from "./toolbar-state";
import { TOOL_RAIL_WIDTH } from "./rail-layout";

const MENUBAR_H = 36;
/** On first detach, drop the rail this far below the menu bar so its drag grip
 *  clears the top main menu and stays reachable. */
const DETACH_GAP = 12;

interface ToolBarProps {
  api: ExcalidrawAPI | null;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
}

/** Anchor the config dropdown just to the right of the rail's top-left. */
function configAnchor(el: HTMLElement | null): MenuPoint {
  const r = el?.getBoundingClientRect();
  return { top: r?.top ?? MENUBAR_H, left: (r?.right ?? TOOL_RAIL_WIDTH) + 4 };
}

/**
 * Flow-native vertical tool rail. Docked to the left edge by default; can be
 * torn off into a floating strip (drag the top bar) or docked/undocked and have
 * tools shown/hidden from the hamburger menu. Drives tool selection through the
 * public Excalidraw API; the native island is hidden via CSS.
 */
export function ToolBar({ api, state, onChange }: ToolBarProps) {
  const { activeType, arrowType, setTool } = useActiveTool(api);
  // Owned here rather than threaded down from App: App is the ancestor that
  // owns <Excalidraw>, and an onChange-driven bump living there re-renders
  // Excalidraw on every commit, which re-fires its onChange in
  // componentDidUpdate regardless of whether anything actually changed —
  // a tight, un-terminating loop. Every other onChange-driven bump in this
  // codebase (useActiveTool right above, useViewToggles, useBottomActions,
  // useQuickActions) already lives in a sibling of <Excalidraw>, never in App,
  // for exactly this reason; this one follows the same rule.
  const sel = useSelectionStyle(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Reserve the left gutter so the canvas insets around a docked rail (keeping
  // Excalidraw's bottom-left zoom/undo controls clear). Floating/hidden = 0.
  useEffect(() => {
    const root = document.documentElement;
    const reserved = state.visible && !state.floating ? TOOL_RAIL_WIDTH : 0;
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
      // Don't start a drag from the hamburger button.
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? 0, y: r?.top ?? MENUBAR_H };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      if (shouldRedock(origin.current.x + m.dx, 0)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? { width: TOOL_RAIL_WIDTH, top: state.y, left: state.x }
    : { width: TOOL_RAIL_WIDTH, top: MENUBAR_H, left: 0, bottom: 0 };

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
        <span className="flow-toolbar__grip" aria-hidden="true">⠿</span>
        <button
          type="button"
          className="flow-toolbar__iconbtn flow-toolbar__hamburger"
          aria-label="Toolbar options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
      </div>

      <div className="flow-toolbar__tools">
        {ALL_TOOLS.filter((t) => !state.hiddenTools.includes(t.id)).map((t) => {
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

      <RailColorControl sel={sel} />

      {menuOpen && (
        <ToolbarConfigMenu
          floating={state.floating}
          hiddenTools={state.hiddenTools}
          anchor={configAnchor(shellRef.current)}
          onToggleFloating={() => {
            if (state.floating) {
              onChange({ ...state, floating: false });
            } else {
              // Detach in place, but keep the top (and its drag grip) clear of
              // the main menu bar so the rail stays reachable/movable.
              const r = shellRef.current?.getBoundingClientRect();
              const x = Math.round(r?.left ?? 0);
              const y = Math.max(Math.round(r?.top ?? MENUBAR_H), MENUBAR_H + DETACH_GAP);
              onChange({ ...state, floating: true, x, y });
            }
            setMenuOpen(false);
          }}
          onToggleTool={(id) => onChange(withHiddenToggled(state, id))}
          onHide={() => {
            onChange({ ...state, visible: false });
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
