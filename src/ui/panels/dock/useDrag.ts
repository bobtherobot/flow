import { useCallback, useEffect, useRef } from "react";

/** The running delta handed to drag callbacks. */
export interface DragMove {
  /** Pointer delta from where the drag started. */
  dx: number;
  dy: number;
  /** Current absolute pointer position. */
  x: number;
  y: number;
  /** True once the pointer has passed the movement threshold. */
  moved: boolean;
}

interface DragOptions {
  /** Squared-distance gate before `onMove` fires (default 4px). */
  threshold?: number;
  /** Return false to reject the drag (e.g. clicked a nested button). */
  onStart?: (e: React.PointerEvent) => boolean | void;
  onMove: (m: DragMove, e: PointerEvent) => void;
  onEnd?: (m: DragMove, e: PointerEvent) => void;
}

interface ActiveDrag {
  startX: number;
  startY: number;
  moved: boolean;
  threshold: number;
}

/**
 * Pointer-drag primitive. Returns an `onPointerDown` handler; while the button
 * is held it tracks movement on the window (so the drag survives the pointer
 * leaving the element) and reports deltas with a small dead-zone threshold.
 * Callbacks are read through a ref so the returned handler stays stable and
 * always sees the latest closures.
 */
export function useDrag(options: DragOptions): (e: React.PointerEvent) => void {
  const optsRef = useRef(options);
  optsRef.current = options;

  const active = useRef<ActiveDrag | null>(null);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      const d = active.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved && dx * dx + dy * dy < d.threshold) return;
      d.moved = true;
      // Read callbacks through optsRef (not a pointer-down snapshot) so they see
      // the latest closures — e.g. `onEnd` reading React state set mid-drag.
      optsRef.current.onMove({ dx, dy, x: e.clientX, y: e.clientY, moved: true }, e);
    };
    const handleUp = (e: PointerEvent) => {
      const d = active.current;
      if (!d) return;
      active.current = null;
      optsRef.current.onEnd?.(
        { dx: e.clientX - d.startX, dy: e.clientY - d.startY, x: e.clientX, y: e.clientY, moved: d.moved },
        e,
      );
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, []);

  return useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const opts = optsRef.current;
    if (opts.onStart?.(e) === false) return;
    e.preventDefault();
    active.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      threshold: opts.threshold ?? 4,
    };
  }, []);
}
