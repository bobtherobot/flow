import { useEffect, useRef, useState } from "react";

/** Pointer travel, in px, that sweeps one full `span` of value. */
export const SCRUB_TRAVEL_PX = 150;
/** Movement before an armed press becomes a drag. */
const DRAG_THRESHOLD_PX = 3;
const SHIFT_MULTIPLIER = 10;
const ALT_MULTIPLIER = 0.1;

interface UseScrubDragArgs {
  /** Current value; null (mixed selection) disables the gesture. */
  value: number | null;
  min: number;
  max: number;
  /** Granularity the dragged value snaps to. */
  step?: number;
  /** Value units traversed by a full SCRUB_TRAVEL_PX drag; null disables. */
  span: number | null;
  disabled?: boolean;
  onScrub: (value: number, transient: boolean) => void;
  /** Fired for a press that never crossed the drag threshold. */
  onClick?: () => void;
}

interface ScrubDragBinding {
  onPointerDown: (e: React.PointerEvent) => void;
  isDragging: boolean;
}

interface Gesture {
  /** Pointer Y the current delta is measured from; moves when a modifier changes. */
  anchorY: number;
  /** Value the current delta is added to; moves with anchorY. */
  anchorValue: number;
  /** Value at pointerdown, for Escape. Never moves. */
  startValue: number;
  /** Last emitted value, so we only emit on change. */
  last: number;
  multiplier: number;
  dragging: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Snap to `step`, then round away float noise — a 0.1 multiplier on a 0.5 step
 *  otherwise produces values like 2.4000000000000004. */
const snap = (v: number, step: number) =>
  Math.round(Math.round(v / step) * step * 1e4) / 1e4;

const multiplierOf = (e: { shiftKey: boolean; altKey: boolean }) =>
  e.shiftKey ? SHIFT_MULTIPLIER : e.altKey ? ALT_MULTIPLIER : 1;

/**
 * Firefox-devtools style drag-to-scrub. A vertical drag of SCRUB_TRAVEL_PX
 * sweeps `span` value units (up increases); Shift coarsens ×10 and Alt refines
 * ×0.1. Emits every intermediate value with `transient: true` and exactly one
 * final value with `transient: false`, so callers can batch a gesture into a
 * single undo entry. A press that never crosses the 3px threshold is a click.
 *
 * Move/up/Escape are handled on `window` rather than via pointer capture, so a
 * drag that leaves the element keeps tracking (and so jsdom, which implements
 * no pointer capture, can drive the gesture in tests).
 */
export function useScrubDrag({
  value,
  min,
  max,
  step = 1,
  span,
  disabled = false,
  onScrub,
  onClick,
}: UseScrubDragArgs): ScrubDragBinding {
  const [active, setActive] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const gesture = useRef<Gesture | null>(null);

  // Latest props for the window listeners, which are bound once per gesture.
  // Written in an effect (never during render) so the listeners always read
  // current values without re-subscribing on every parent render.
  const latest = useRef({ min, max, step, span, onScrub, onClick });
  useEffect(() => {
    latest.current = { min, max, step, span, onScrub, onClick };
  });

  useEffect(() => {
    if (!active) return;

    const end = (commit: number | null) => {
      gesture.current = null;
      setActive(false);
      setIsDragging(false);
      if (commit !== null) latest.current.onScrub(commit, false);
      else latest.current.onClick?.();
    };

    // Escape before the drag threshold cancels outright: no commit, and no
    // click either — the press never became either gesture.
    const cancel = () => {
      gesture.current = null;
      setActive(false);
      setIsDragging(false);
    };

    const onMove = (e: PointerEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (!g.dragging) {
        if (Math.abs(e.clientY - g.anchorY) < DRAG_THRESHOLD_PX) return;
        g.dragging = true;
        setIsDragging(true);
      }
      const { min: lo, max: hi, step: st, span: sp, onScrub: emit } = latest.current;
      if (sp === null) return;

      const m = multiplierOf(e);
      if (m !== g.multiplier) {
        // Re-anchor rather than rescaling the whole delta, which would make the
        // value jump the instant a modifier is pressed.
        g.anchorY = e.clientY;
        g.anchorValue = g.last;
        g.multiplier = m;
      }

      const delta = (g.anchorY - e.clientY) * (sp / SCRUB_TRAVEL_PX) * m;
      const next = clamp(snap(g.anchorValue + delta, st), lo, hi);
      if (next !== g.last) {
        g.last = next;
        emit(next, true);
      }
    };

    const onUp = () => {
      const g = gesture.current;
      end(g?.dragging ? g.last : null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const g = gesture.current;
      // Intermediates were never captured, so re-committing the start value
      // produces a no-op diff and leaves no undo entry behind.
      if (g?.dragging) end(g.startValue);
      else cancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [active]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || value === null || span === null || e.button !== 0) return;
    // Suppress the native focus so a press on the field body scrubs; the click
    // path focuses explicitly instead.
    e.preventDefault();
    gesture.current = {
      anchorY: e.clientY,
      anchorValue: value,
      startValue: value,
      last: value,
      multiplier: multiplierOf(e),
      dragging: false,
    };
    setActive(true);
  };

  return { onPointerDown, isDragging };
}
