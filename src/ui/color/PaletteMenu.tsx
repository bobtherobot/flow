import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./color.css";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";

interface PaletteMenuProps {
  anchor: MenuPoint;
  hasSelection: boolean;
  canDeletePalette: boolean;
  canCopy: boolean;
  /**
   * The gear, so a dismissal that opens nothing hands focus back to it. This
   * menu portals to `document.body`, so its items sit after every other
   * focusable element in the document; leaving focus at `<body>` on close
   * would strand a keyboard user at the top of the page.
   */
  returnFocusTo?: React.RefObject<HTMLElement | null>;
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
 *
 * That argument only pays off because the menu manages focus itself. It
 * portals to `document.body`, so its items are last in document order and are
 * unreachable by Tab in practice — focus therefore moves to the first item on
 * open, arrows walk the list, and every dismissal that opens nothing returns
 * focus to `returnFocusTo`. `PanelConfigMenu` needs none of this because it
 * renders inline and so already occupies a sane tab position.
 */
export function PaletteMenu({
  anchor, hasSelection, canDeletePalette, canCopy, returnFocusTo,
  onRename, onAdd, onDeletePalette, onDeleteSwatches, onCopy, onClose,
}: PaletteMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Land inside the menu on open. Without this, focus stays on the gear and
  // the five items — being at the end of <body> — are reachable only by
  // tabbing through the entire application.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);

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

  // Focus is handed back explicitly rather than on unmount, because unmount is
  // also how the menu leaves when an item opens a dialog — and that dialog
  // takes focus for itself. Only the dismissals that put nothing on screen
  // belong here.
  const dismiss = useCallback(() => {
    returnFocusTo?.current?.focus();
    onClose();
  }, [onClose, returnFocusTo]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // The gear itself lives outside this portal. Without this guard a press
      // on it would close here on pointerdown and the click that follows would
      // reopen — making the toggle's close branch unreachable. Same guard
      // ColorPopup uses for its trigger.
      if ((e.target as HTMLElement).closest(".flow-clr-palette__gear")) return;
      if (!ref.current?.contains(e.target as Node)) dismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [dismiss]);

  /** Up/Down cycle through the items, Home/End jump to the ends. Read from
   *  the DOM on each press so an inert item is still landed on — that is the
   *  whole reason these use `aria-disabled` instead of `disabled`. */
  const onArrowKeys = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
    const items = Array.from(
      ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    e.preventDefault();
    const last = items.length - 1;
    const at = items.indexOf(document.activeElement as HTMLElement);
    let next: number;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (at < 0) next = e.key === "ArrowDown" ? 0 : last;
    else if (e.key === "ArrowDown") next = at === last ? 0 : at + 1;
    else next = at === 0 ? last : at - 1;
    items[next].focus();
  };

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
      onKeyDown={onArrowKeys}
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
