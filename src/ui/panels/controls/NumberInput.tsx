import { useEffect, useRef, useState } from "react";

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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A standalone numeric field (no slider). Loosely controlled so the user can
 * type freely; every parse-able, in-range value commits via `onChange`. `null`
 * renders empty (mixed selection). The field reflects external value changes
 * unless the user is mid-edit.
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
  const [text, setText] = useState(value === null ? "" : String(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value === null ? "" : String(value));
  }, [value]);

  const commit = (raw: string) => {
    setText(raw);
    const n = Number(raw);
    if (raw.trim() !== "" && Number.isFinite(n)) onChange(clamp(n, min, max));
  };

  return (
    <div className="flow-ctl-num" aria-disabled={disabled || undefined}>
      <input
        type="number"
        className="flow-ctl-num__input"
        aria-label={ariaLabel}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
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
      {unit && <span className="flow-ctl-num__unit">{unit}</span>}
    </div>
  );
}
