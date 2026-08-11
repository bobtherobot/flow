import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "../color/color.css";
import "./toolbar.css";
import { SaturationBox } from "../color/SaturationBox";
import { PickerRow } from "../color/PickerRow";
import { useColorDraft } from "../color/useColorDraft";
import { useColorUiState } from "../../lib/color-store";
import { RECENT_LIMIT } from "../../lib/recent-colors";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";
import type { ColorTarget } from "../color/useColorTarget";

interface ColorPopupProps {
  target: ColorTarget;
  /** Ideal viewport top-left; clamped into the viewport once the popup's real
   *  size is known (mirrors ToolbarConfigMenu's anchor handling). */
  anchor: MenuPoint;
  onClose: () => void;
}

/**
 * The rail's compact picker. Deliberately smaller than the panel: no numeric
 * fields and no palette management, because reaching for the rail means
 * "give me a color now" — the panel is where you go to be precise.
 */
export function ColorPopup({ target, anchor, onClose }: ColorPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { recents } = useColorUiState();
  const [pos, setPos] = useState<MenuPoint>(anchor);

  const draft = useColorDraft({
    hex: target.hex,
    alpha: target.alpha,
    onCommit: target.setColor,
  });

  // Pull the popup fully on-screen before paint, same as ToolbarConfigMenu —
  // the naive anchor (top of the rail control, right of the rail) can overflow
  // when the control sits near the bottom of a tall rail.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- anchor is a fresh
    // object every render; only its coordinates should re-trigger the clamp.
  }, [anchor.top, anchor.left]);

  // Dismissal mirrors ToolbarConfigMenu's outside-press handling; Escape is
  // added on top so the popup is keyboard-dismissable like any other overlay.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      // The trigger box lives OUTSIDE this portal, so a press on it would
      // close here on pointerdown and the click that follows would reopen —
      // the toggle's close branch becomes unreachable, and the remount
      // re-seeds useColorDraft, discarding an in-progress hue. Same guard
      // ToolBar uses for its hamburger (ToolBar.tsx's config-menu effect).
      if ((e.target as HTMLElement).closest(".flow-toolbar__color")) return;
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

  // Always six slots so the strip does not reflow as it fills.
  const slots = Array.from({ length: RECENT_LIMIT }, (_, i) => recents[i] ?? null);

  return createPortal(
    <div
      ref={ref}
      className="flow-clr-popup"
      role="dialog"
      aria-label="Color picker"
      style={{ top: pos.top, left: pos.left }}
    >
      <button
        type="button"
        className="flow-clr-popup__close"
        aria-label="Close color picker"
        onClick={onClose}
      >
        ×
      </button>

      <SaturationBox hsv={draft.hsv} onChange={draft.setSv} />

      <PickerRow
        hsv={draft.hsv}
        alpha={draft.alpha}
        isNone={draft.isNone}
        onHue={draft.setHue}
        onAlpha={draft.setAlpha}
      />

      <div className="flow-clr-recents">
        {slots.map((hex, i) => (
          <button
            key={i}
            type="button"
            className="flow-clr-recents__slot"
            style={hex ? { background: hex } : undefined}
            aria-label={hex ? `Recent color ${hex}` : `Recent color slot ${i + 1}, empty`}
            title={hex ?? undefined}
            disabled={!hex}
            onClick={() => hex && target.setColor(hex, draft.alpha, false)}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
