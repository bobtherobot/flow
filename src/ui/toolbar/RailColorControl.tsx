import { useEffect, useRef, useState } from "react";
import "./toolbar.css";
import { PartChooser } from "../color/PartChooser";
import { useColorTarget, type ColorTarget } from "../color/useColorTarget";
import { ColorPopup } from "./ColorPopup";
import { RAIL_WIDTH } from "./rail-layout";
import { recordUsedColor } from "../../lib/palette-store";
import type { MenuPoint } from "../panels/dock/menu-position";
import type { SelectionStyle } from "../panels/useSelectionStyle";

/** Gap between the rail's right edge and the popup. */
const POPUP_GAP = 8;

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

  /**
   * The last hex this popup session wrote, or null if it wrote nothing.
   *
   * One ref, not a hex plus a dirty flag: null already means "untouched", and
   * a second field would be one more thing to leave stranded. Transient
   * mid-drag writes simply overwrite it, which is what makes a forty-event hue
   * drag contribute one color instead of forty.
   */
  const lastHex = useRef<string | null>(null);

  /** Settle the session's color into the Recent palette. Idempotent: it nulls
   *  the ref, so a close followed by an unmount records once, not twice. */
  const flushSession = () => {
    const hex = lastHex.current;
    lastHex.current = null;
    if (hex) recordUsedColor(hex);
  };

  /**
   * The popup can be unmounted with a session in flight — `View ▸ Show
   * Toolbar` makes `ToolBar` return null, taking this component and the popup
   * with it. Same hazard `cancelEyeDropper` guards in ColorPopup/ColorPanel,
   * same cleanup-effect shape. Without this the session's color is lost.
   * `lastHex` is a ref and `recordUsedColor` a module import, so the empty
   * dep array closes over nothing stale.
   */
  useEffect(() => () => flushSession(), []);

  /**
   * What the popup writes through. Recording lives here, not in
   * `useColorTarget`, because this component owns the popup's open/close and
   * is therefore the only place that knows when a session ended. Wrapping the
   * target rather than threading a callback into `ColorPopup` also keeps the
   * popup itself ignorant of recording entirely.
   */
  const popupTarget: ColorTarget = {
    ...target,
    setColor: (hex, alpha, transient) => {
      target.setColor(hex, alpha, transient);
      lastHex.current = hex;
    },
  };

  const anchor = (): MenuPoint => {
    const r = wrapRef.current?.getBoundingClientRect();
    return { top: r?.top ?? 0, left: (r?.right ?? RAIL_WIDTH) + POPUP_GAP };
  };

  const closePopup = () => {
    setOpen(false);
    flushSession();
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
        // Was `setOpen((o) => !o)`. The close half has to settle the session's
        // color, and `closePopup` is where that lives — a bare toggle would
        // silently drop it on the popup's most-used exit. Reading `open`
        // directly is correct in an event handler: `open` has a second writer
        // (`closePopup`, via `ColorPopup`'s Escape/outside-pointerdown), but
        // `chooserTarget` is rebuilt on every render, so the `open` this
        // closure captures is always the latest committed value.
        if (!isArrowNav) {
          if (open) closePopup();
          else setOpen(true);
        }
        return;
      }
      target.setPart(part);
    },
  };

  // Arrow-key navigation also calls setPart, and on a single-part selection it
  // re-selects the part already active — indistinguishable from a click unless
  // marked. The flag is set only for arrow keys pressed inside the radiogroup:
  // the quartet chips sit outside it and are independently focusable, so an
  // arrow pressed on a chip has no setPart call to consume the flag — left
  // unscoped, it would latch and silently swallow the next click on the
  // active box.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!e.key.startsWith("Arrow")) return;
    if (!(e.target as HTMLElement).closest('[role="radiogroup"]')) return;
    arrowNavRef.current = true;
  };

  return (
    <div className="flow-toolbar__color" ref={wrapRef} onKeyDownCapture={onKeyDownCapture}>
      <PartChooser target={chooserTarget} compact />
      {open && <ColorPopup target={popupTarget} anchor={anchor()} onClose={closePopup} />}
    </div>
  );
}
