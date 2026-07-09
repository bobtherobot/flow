import { useLayoutEffect, useRef, useState } from "react";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";
import { BOTTOM_ITEMS, type BottomGroup } from "./items";

interface BottombarConfigMenuProps {
  floating: boolean;
  hiddenItems: string[];
  /** Ideal top-left (near the hamburger); clamped into the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onToggleItem: (id: string) => void;
}

/** Section headers, in display order. */
const GROUP_LABELS: Record<BottomGroup, string> = {
  view: "View",
  zoom: "Zoom",
  canvas: "Canvas",
  search: "Search",
};
const GROUP_ORDER: BottomGroup[] = ["view", "zoom", "canvas", "search"];

/**
 * The bar's hamburger dropdown: dock/detach the bar, and show/hide each item
 * grouped by section. Reuses the panel config-menu styles (`.flow-pnl-config*`,
 * global in panels.css) and the shared `clampMenuPosition`.
 */
export function BottombarConfigMenu({
  floating,
  hiddenItems,
  anchor,
  onToggleFloating,
  onToggleItem,
}: BottombarConfigMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    // The bar sits at the bottom, so open the menu upward: place its top a full
    // menu-height above the anchor, then clamp into the viewport.
    const upward = { top: anchor.top - height, left: anchor.left };
    setPos(
      clampMenuPosition(
        upward,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor]);

  return (
    <div
      ref={ref}
      className="flow-pnl-config flow-bottombar-config"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onToggleFloating}
      >
        {floating ? "Dock bottom bar" : "Detach bottom bar"}
      </button>
      {GROUP_ORDER.map((group) => {
        const items = BOTTOM_ITEMS.filter((i) => i.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group}>
            <div className="flow-pnl-config__sep" />
            <div className="flow-pnl-config__heading">{GROUP_LABELS[group]}</div>
            {items.map((item) => (
              <label key={item.id} className="flow-pnl-config__item">
                <input
                  type="checkbox"
                  checked={!hiddenItems.includes(item.id)}
                  onChange={() => onToggleItem(item.id)}
                />
                {item.label}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}
