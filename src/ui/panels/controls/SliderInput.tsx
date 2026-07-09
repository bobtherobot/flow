import { useEffect, useRef, useState } from "react";

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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A range slider paired with a numeric field and an optional unit suffix. The
 * shared primitive behind stroke width and opacity. `null` renders an empty
 * field (mixed selection) with the slider parked at `min`. The field is
 * loosely controlled so the user can type freely; every parse-able, in-range
 * value commits via `onChange`.
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
  const [text, setText] = useState(value === null ? "" : String(value));
  const focused = useRef(false);

  // Reflect external value changes unless the user is mid-edit.
  useEffect(() => {
    if (!focused.current) setText(value === null ? "" : String(value));
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
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
          const n = Number(e.target.value);
          setText(String(n));
          onChange(n);
        }}
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
          value={text}
          disabled={disabled}
          onFocus={() => {
            focused.current = true;
          }}
          onBlur={() => {
            focused.current = false;
            setText(value === null ? "" : String(value));
          }}
          onChange={(e) => commit(e.target.value)}
        />
        {unit && <span className="flow-ctl-slider__unit">{unit}</span>}
      </div>
      )}
    </div>
  );
}
