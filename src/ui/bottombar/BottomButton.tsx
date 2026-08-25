import type { ReactNode } from "react";
import { focusCanvas } from "../../lib/focus-canvas";

interface BottomButtonProps {
  icon: ReactNode;
  /** Accessible name + tooltip base. */
  label: string;
  /** Optional shortcut appended to the tooltip. */
  shortcut?: string;
  /** Highlighted (toggle on). */
  active: boolean;
  onClick: () => void;
}

/** One icon toggle button in the bottom bar. Presentational — parent owns state.
 *  Sibling of quickbar/QuickButton. */
export function BottomButton({ icon, label, shortcut, active, onClick }: BottomButtonProps) {
  return (
    <button
      type="button"
      className="flow-bottombar__btn"
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
