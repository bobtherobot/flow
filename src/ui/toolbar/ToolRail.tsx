import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./toolbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import type { ToolDef } from "./tools";
import { TOOL_ICONS } from "./icons";
import { ToolButton } from "./ToolButton";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { useActiveTool } from "./useActiveTool";
import { shouldRedock, withHiddenToggled, type ToolbarState } from "./toolbar-state";

const MENUBAR_H = 36;
/** On first detach, drop the rail this far below the menu bar so its drag grip
 *  clears the top main menu and stays reachable. */
const DETACH_GAP = 12;
/** Bottom breathing room for a floating rail's max-height, so a tall one
 *  scrolls inside itself instead of running off the viewport. */
const FLOAT_BOTTOM_GAP = 8;

interface ToolRailProps {
  api: ExcalidrawAPI | null;
  /** The tools this rail renders, top to bottom. */
  tools: readonly ToolDef[];
  /** Rail width in px, docked or floating. */
  width: number;
  /** Button grid column count. */
  columns: number;
  /** aria-label for the toolbar role ("Tools" / "Shapes"). */
  label: string;
  /** Lowercase noun for the menu strings ("toolbar" / "shapebar"). */
  noun: string;
  /** Left edge when docked. Non-zero for a rail that sits after another. */
  dockLeft: number;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
  /** Pinned under the tool grid. The toolbar passes the color control here. */
  footer?: ReactNode;
}

/**
 * Flow-native vertical tool rail, instantiated once per rail by `ToolRails`.
 * Docked to the left edge by default; can be torn off into a floating strip
 * (drag the top bar) or docked/undocked and have tools shown/hidden from the
 * hamburger menu. Drives tool selection through the public Excalidraw API; the
 * native island is hidden via CSS.
 */
export function ToolRail({
  api,
  tools,
  width,
  columns,
  label,
  noun,
  dockLeft,
  state,
  onChange,
  footer,
}: ToolRailProps) {
  const { activeType, arrowType, setTool } = useActiveTool(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  /** Anchor the config dropdown just to the right of the rail's top-left. */
  const configAnchor = (): MenuPoint => {
    const r = shellRef.current?.getBoundingClientRect();
    return { top: r?.top ?? MENUBAR_H, left: (r?.right ?? dockLeft + width) + 4 };
  };

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
      // Against this rail's own slot, not the screen edge — the shapebar's slot
      // sits to the right of a docked toolbar.
      if (shouldRedock(origin.current.x + m.dx, dockLeft)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? {
        width,
        top: state.y,
        left: state.x,
        maxHeight: `calc(100vh - ${state.y}px - ${FLOAT_BOTTOM_GAP}px)`,
      }
    : { width, top: MENUBAR_H, left: dockLeft, bottom: 0 };

  const Noun = noun[0].toUpperCase() + noun.slice(1);

  return (
    <div
      ref={shellRef}
      className={`flow-toolbar ${state.floating ? "flow-toolbar--floating" : "flow-toolbar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label={label}
      aria-orientation="vertical"
    >
      <div className="flow-toolbar__topbar" onPointerDown={onTopbarPointerDown}>
        <span className="flow-toolbar__grip" aria-hidden="true">⠿</span>
        <button
          type="button"
          className="flow-toolbar__iconbtn flow-toolbar__hamburger"
          aria-label={`${Noun} options`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
      </div>

      <div
        className="flow-toolbar__tools"
        style={{ "--flow-rail-cols": columns } as CSSProperties}
      >
        {tools
          .filter((t) => !state.hiddenTools.includes(t.id))
          .map((t) => {
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

      {footer}

      {menuOpen && (
        <ToolbarConfigMenu
          floating={state.floating}
          noun={noun}
          tools={tools}
          hiddenTools={state.hiddenTools}
          anchor={configAnchor()}
          onToggleFloating={() => {
            if (state.floating) {
              onChange({ ...state, floating: false });
            } else {
              // Detach in place, but keep the top (and its drag grip) clear of
              // the main menu bar so the rail stays reachable/movable.
              const r = shellRef.current?.getBoundingClientRect();
              const x = Math.round(r?.left ?? dockLeft);
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
