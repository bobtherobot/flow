import { useNumberField } from "./useNumberField";

interface NumberInputProps {
  /** Current value, or null when the selection is mixed (renders empty). */
  value: number | null;
  min?: number;
  max?: number;
  step?: number;
  /** Optional short unit suffix (e.g. "px"). */
  unit?: string;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A standalone numeric field (no slider). `null` renders empty (mixed
 * selection). The typed value only commits via `onChange` on blur or Enter (not
 * per keystroke); Escape reverts. Reflects external value changes when idle.
 */
export function NumberInput({
  value,
  min = -Infinity,
  max = Infinity,
  step = 1,
  unit,
  onChange,
  ariaLabel,
  disabled = false,
}: NumberInputProps) {
  const field = useNumberField({ value, min, max, onChange });

  return (
    <div className="flow-ctl-num" aria-disabled={disabled || undefined}>
      <input
        type="number"
        className="flow-ctl-num__input"
        aria-label={ariaLabel}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        value={field.text}
        disabled={disabled}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={field.onChange}
        onKeyDown={field.onKeyDown}
      />
      {unit && <span className="flow-ctl-num__unit">{unit}</span>}
    </div>
  );
}
