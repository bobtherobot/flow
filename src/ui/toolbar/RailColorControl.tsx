import { useRef, useState } from "react";
import "./toolbar.css";
import { PartChooser } from "../color/PartChooser";
import { useColorTarget, type ColorTarget } from "../color/useColorTarget";
import { ColorPopup } from "./ColorPopup";
import { RAIL_WIDTH } from "./ToolBar";
import type { MenuPoint } from "../panels/dock/menu-position";
import type { SelectionStyle } from "../panels/useSelectionStyle";

/** Gap between the rail's right edge and the popup. */
const POPUP_GAP = 8;

const ARROW_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);

/**
 * The rail's color control: the same part chooser the panel uses, with one
 * extra behaviour — clicking the box that is *already* active opens the compact
 * picker, while clicking a back box just brings it forward. That keeps a single
 * click meaning "switch part" and a second click meaning "edit it".
 *
 * `PartChooser`'s arrow-key cycling calls this same `setPart`, and when only
 * one part is available (a bare text selection) the cycle lands back on that
 * same part every time — that must stay a no-op, not an accidental toggle of
 * the popup. `arrowNavRef` distinguishes "keyboard cycle landed on the current
 * part" from "the user clicked the current part", since both arrive as the
 * identical `setPart(part)` call and `PartChooser` cannot be changed to tell
 * them apart itself.
 */
export function RailColorControl({ sel }: { sel: SelectionStyle }) {
  const target = useColorTarget(sel);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const arrowNavRef = useRef(false);

  const anchor = (): MenuPoint => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { top: r?.top ?? 0, left: (r?.right ?? RAIL_WIDTH) + POPUP_GAP };
  };

  const closePopup = () => {
    setOpen(false);
    // Return focus to the box that opened the popup, mirroring how a native
    // dialog hands focus back to its trigger on dismissal.
    wrapRef.current
      ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?.focus();
  };

  const chooserTarget: ColorTarget = {
    ...target,
    setPart: (part) => {
      const isArrowNav = arrowNavRef.current;
      arrowNavRef.current = false;
      if (part === target.part) {
        if (!isArrowNav) setOpen((o) => !o);
        return;
      }
      target.setPart(part);
    },
  };

  return (
    <div
      className="flow-toolbar__color"
      ref={wrapRef}
      onKeyDownCapture={(e) => {
        if (ARROW_KEYS.has(e.key)) arrowNavRef.current = true;
      }}
    >
      <PartChooser target={chooserTarget} compact />
      {open && <ColorPopup target={target} anchor={anchor()} onClose={closePopup} />}
    </div>
  );
}
