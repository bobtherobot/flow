import type { ReactNode } from "react";

interface QuickButtonProps {
  icon: ReactNode;
  /** Accessible name + tooltip base. */
  label: string;
  /** Optional shortcut appended to the tooltip. */
  shortcut?: string;
  /** Highlighted (toggle on, or selected tool). */
  active: boolean;
  onClick: () => void;
}

/** One icon button in the quick-actions bar. Presentational — parent owns state.
 *  Horizontal sibling of toolbar/ToolButton. */
export function QuickButton({ icon, label, shortcut, active, onClick }: QuickButtonProps) {
  return (
    <button
      type="button"
      className="flow-quickbar__btn"
      aria-label={label}
      aria-pressed={active}
      data-active={active || undefined}
      title={shortcut ? `${label} — ${shortcut}` : label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
