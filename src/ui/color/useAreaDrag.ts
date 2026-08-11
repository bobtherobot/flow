import { useCallback, useEffect, useRef } from "react";

export interface AreaPos {
  /** 0–1 fraction across the element's width. */
  x: number;
  /** 0–1 fraction down the element's height. */
  y: number;
}

interface UseAreaDragOptions {
  /** `transient` is true for the press and every move, false for the release.
   *  Callers forward it straight to the scene write, so one gesture collapses
   *  into one undo entry (see `src/lib/deferred-commit.ts`). */
  onChange: (pos: AreaPos, transient: boolean) => void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Press-and-drag over a rectangular control, reported as a normalized position.
 * Shared by the hue slider, the alpha slider and the saturation box, which are
 * the same gesture reading different axes.
 *
 * Listeners live on the window rather than the element so a drag that leaves
 * the control keeps tracking — sliding off the edge of a saturation box should
 * pin to that edge, not freeze mid-gesture.
 */
export function useAreaDrag({ onChange }: UseAreaDragOptions) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  // Held in a ref so the window listeners never close over a stale callback.
  const latest = useRef(onChange);
  latest.current = onChange;

  const report = useCallback((clientX: number, clientY: number, transient: boolean) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    latest.current(
      {
        x: clamp01((clientX - rect.left) / rect.width),
        y: clamp01((clientY - rect.top) / rect.height),
      },
      transient,
    );
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      report(e.clientX, e.clientY, true);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      report(e.clientX, e.clientY, false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [report]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging.current = true;
      report(e.clientX, e.clientY, true);
    },
    [report],
  );

  return { ref, onPointerDown };
}
