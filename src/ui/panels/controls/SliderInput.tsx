import { useRef } from "react";
import { useNumberField } from "./useNumberField";

interface SliderInputProps {
  /** Current value in display units, or null when the selection is mixed. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  /** Short unit suffix shown after the numeric field (e.g. "px", "%"). */
  unit?: string;
  /** `transient` is true for every value during a drag and false for typed
   *  commits and the single commit ending a drag, so a whole gesture can be
   *  one undo entry. */
  onChange: (value: number, transient: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Hide the numeric field, showing only the range slider (for relative
   *  values where the exact number is meaningless, e.g. arrowhead size). */
  hideValue?: boolean;
}

/**
 * A range slider paired with a numeric field and an optional unit suffix. `null`
 * renders an empty field (mixed selection) with the slider parked at `min`.
 * Dragging the slider emits transient values live and commits once on release;
 * the numeric field commits only on blur or Enter so it doesn't churn while
 * typing.
 */
export function SliderInput({
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  ariaLabel,
  disabled = false,
  hideValue = false,
}: SliderInputProps) {
  const field = useNumberField({ value, min, max, onChange: (v) => onChange(v, false) });

  // The value of an uncommitted transient write, if any. Guards against the
  // three possible gesture-end events double-committing the same value.
  const pending = useRef<number | null>(null);

  const commit = () => {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    onChange(next, false);
  };

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
      {!hideValue && (
      <div className="flow-ctl-slider__field">
        <input
          type="number"
          className="flow-ctl-slider__num"
          aria-label={`${ariaLabel} value`}
          min={min}
          max={max}
          step={step}
          value={field.text}
          disabled={disabled}
          onFocus={field.onFocus}
          onBlur={field.onBlur}
          onChange={field.onChange}
          onKeyDown={field.onKeyDown}
        />
        {unit && <span className="flow-ctl-slider__unit">{unit}</span>}
      </div>
      )}
    </div>
  );
}
