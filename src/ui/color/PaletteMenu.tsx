import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./color.css";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";

interface PaletteMenuProps {
  anchor: MenuPoint;
  hasSelection: boolean;
  canDeletePalette: boolean;
  canCopy: boolean;
  onRename: () => void;
  onAdd: () => void;
  onDeletePalette: () => void;
  onDeleteSwatches: () => void;
  onCopy: () => void;
  onClose: () => void;
}

/**
 * The palette gear's dropdown. Replaces a `+` and a `🗑` whose meaning changed
 * underneath the user depending on whether swatches were selected.
 *
 * Inert items carry `aria-disabled` rather than the native attribute: a
 * disabled button cannot take focus, so a keyboard user could never land on
 * the item to find out why it is unavailable. That makes the attribute
 * advisory, so every handler guards its own condition — `aria-disabled` alone
 * would let a click straight through.
 */
export function PaletteMenu({
  anchor, hasSelection, canDeletePalette, canCopy,
  onRename, onAdd, onDeletePalette, onDeleteSwatches, onCopy, onClose,
}: PaletteMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Measure, then pull fully on-screen before the browser paints — the panel
  // can be docked against any edge, so the naive anchor overflows routinely.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(
      clampMenuPosition(anchor, { width, height }, {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor is a fresh
    // object every render; only its coordinates should re-trigger the clamp.
  }, [anchor.top, anchor.left]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // The gear itself lives outside this portal. Without this guard a press
      // on it would close here on pointerdown and the click that follows would
      // reopen — making the toggle's close branch unreachable. Same guard
      // ColorPopup uses for its trigger.
      if ((e.target as HTMLElement).closest(".flow-clr-palette__gear")) return;
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const item = (label: string, enabled: boolean, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="flow-clr-palette__menuitem"
      aria-disabled={!enabled}
      onClick={() => {
        if (!enabled) return;
        run();
      }}
    >
      {label}
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      className="flow-clr-palette__menu"
      role="menu"
      aria-label="Palette actions"
      style={{ top: pos.top, left: pos.left }}
    >
      {item("Rename palette…", true, onRename)}
      {item("Add palette…", true, onAdd)}
      {item("Delete palette…", canDeletePalette, onDeletePalette)}
      {item("Delete selected swatches", hasSelection, onDeleteSwatches)}
      {item("Copy selected swatches to…", hasSelection && canCopy, onCopy)}
    </div>,
    document.body,
  );
}
