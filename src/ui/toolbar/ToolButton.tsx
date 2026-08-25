import type { ReactNode } from "react";
import { focusCanvas } from "../../lib/focus-canvas";

interface ToolButtonProps {
  icon: ReactNode;
  /** Accessible name + tooltip base. */
  label: string;
  /** Optional shortcut appended to the tooltip. */
  shortcut?: string;
  /** Highlighted (selected tool, or lock engaged). */
  active: boolean;
  onClick: () => void;
}

/** One square icon button in the rail. Presentational — the parent owns state. */
export function ToolButton({ icon, label, shortcut, active, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className="flow-toolbar__btn"
      aria-label={label}
      aria-pressed={active}
      data-active={active || undefined}
      title={shortcut ? `${label} — ${shortcut}` : label}
      onClick={() => {
        // Fire-and-forget: this button is never a popup trigger, so once its
        // action has run, hand keyboard focus straight back to the canvas
        // (see focusCanvas) rather than leaving it stranded on this button.
        onClick();
        focusCanvas();
      }}
    >
      {icon}
    </button>
  );
}
