import { useEffect, useRef } from "react";
import { resetDeferred } from "../../../lib/deferred-commit";

interface SliderInputProps {
  /** Current value, or null when the selection is mixed. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  /** `transient` is true for every value during a drag and false for the single
   *  commit at the end, so a whole gesture is one undo entry. */
  onChange: (value: number, transient: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A bare range slider, for values where the exact number is meaningless — the
 * per-end arrowhead sizes, which are a factor of stroke width. Every value with
 * a meaningful number uses NumberInput's drag-to-scrub field instead.
 *
 * `null` parks the slider at `min` (mixed selection). Dragging emits transient
 * values live; the single commit fires on release — pointerup, keyup or blur,
 * whichever ends the gesture, and only once.
 */
export function SliderInput({
  value,
  min,
  max,
  step = 1,
  onChange,
  ariaLabel,
  disabled = false,
}: SliderInputProps) {
  // The value of an uncommitted transient write, if any. Guards against the
  // three possible gesture-end events double-committing the same value.
  const pending = useRef<number | null>(null);

  const commit = () => {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onChange(next, false);
  };

  // A drag that never reaches its commit — this slider unmounting mid-gesture —
  // would leave the deferred-commit bit set, and the next unrelated panel write
  // would inherit authority to skip the vendor's uncommitted-element filter.
  // Gated on this instance's own pending ref, so an unrelated slider's unmount
  // can never clear a live gesture's bit.
  useEffect(
    () => () => {
      if (pending.current !== null) resetDeferred();
    },
    [],
  );

  return (
    <div className="flow-ctl-slider" aria-disabled={disabled || undefined}>
      <input
        type="range"
        className="flow-ctl-slider__range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        disabled={disabled}
        onChange={(e) => {
          const next = Number(e.target.value);
          pending.current = next;
          onChange(next, true);
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}
