import type { ReactNode } from "react";
import { MIXED, type Mixed } from "../../../lib/selection-style";

export interface IconOption<T extends string> {
  value: T;
  /** Accessible name / tooltip for the option. */
  label: string;
  icon: ReactNode;
}

interface IconToggleGroupProps<T extends string> {
  options: readonly IconOption<T>[];
  /** Current value, MIXED (selection disagrees), or null (none). */
  value: T | Mixed | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A single-select segmented control rendered as a row of icon buttons — the
 * shared primitive behind stroke style, arrow type, arrowheads, text align, and
 * font size. Radio semantics; when the value is MIXED no option is marked.
 */
export function IconToggleGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: IconToggleGroupProps<T>) {
  return (
    <div
      className="flow-ctl-icons"
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {options.map((opt) => {
        const selected = value !== MIXED && value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={opt.label}
            title={opt.label}
            className="flow-ctl-icons__btn"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
          </button>
        );
      })}
    </div>
  );
}
