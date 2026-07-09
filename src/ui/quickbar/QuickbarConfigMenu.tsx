import { useLayoutEffect, useRef, useState } from "react";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";
import { QUICK_ITEMS, type QuickGroup } from "./actions";

interface QuickbarConfigMenuProps {
  floating: boolean;
  hiddenItems: string[];
  /** Ideal top-left (near the hamburger); clamped into the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onToggleItem: (id: string) => void;
  /** Hide the whole bar (mirrors View ▸ Show Quick Actions). */
  onHide: () => void;
}

/** Section headers, in display order. */
const GROUP_LABELS: Record<QuickGroup, string> = {
  order: "Arrange",
  group: "Group",
  align: "Align & distribute",
  toggle: "Toggles",
  history: "History",
  tool: "Tools",
};
const GROUP_ORDER: QuickGroup[] = ["order", "group", "align", "toggle", "history", "tool"];

/**
 * The bar's hamburger dropdown: dock/detach the bar, and show/hide each item
 * grouped by section. Reuses the panel config-menu styles (`.flow-pnl-config*`,
 * global in panels.css) and the shared `clampMenuPosition`.
 */
export function QuickbarConfigMenu({
  floating,
  hiddenItems,
  anchor,
  onToggleFloating,
  onToggleItem,
  onHide,
}: QuickbarConfigMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

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

  return (
    <div
      ref={ref}
      className="flow-pnl-config flow-quickbar-config"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onToggleFloating}
      >
        {floating ? "Dock quick actions" : "Detach quick actions"}
      </button>
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onHide}
      >
        Hide quick actions
      </button>
      {GROUP_ORDER.map((group) => {
        const items = QUICK_ITEMS.filter((i) => i.group === group);
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
