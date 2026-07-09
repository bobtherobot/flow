import { useNumberField } from "./useNumberField";

interface SliderInputProps {
  /** Current value in display units, or null when the selection is mixed. */
  value: number | null;
  min: number;
  max: number;
  step?: number;
  /** Short unit suffix shown after the numeric field (e.g. "px", "%"). */
  unit?: string;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Hide the numeric field, showing only the range slider (for relative
   *  values where the exact number is meaningless, e.g. arrowhead size). */
  hideValue?: boolean;
}

/**
 * A range slider paired with a numeric field and an optional unit suffix. The
 * shared primitive behind stroke width and opacity. `null` renders an empty
 * field (mixed selection) with the slider parked at `min`. Dragging the slider
 * commits live (a deliberate gesture); the numeric field commits only on blur or
 * Enter so it doesn't churn while typing.
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
  const field = useNumberField({ value, min, max, onChange });

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
        onChange={(e) => onChange(Number(e.target.value))}
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
