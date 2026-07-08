import type { ReactNode } from "react";

export interface ActionOption {
  key: string;
  /** Accessible name / tooltip for the button. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface IconActionGroupProps {
  options: readonly ActionOption[];
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A row of momentary icon buttons — the shared primitive behind align and
 * distribute. Unlike IconToggleGroup these hold no selected state: each button
 * fires an action and forgets. Reuses the .flow-ctl-icons CSS.
 */
export function IconActionGroup({ options, ariaLabel, disabled = false }: IconActionGroupProps) {
  return (
    <div
      className="flow-ctl-icons"
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-label={opt.label}
          title={opt.label}
          className="flow-ctl-icons__btn"
          disabled={disabled}
          onClick={opt.onClick}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
