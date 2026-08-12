import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../dialogs.css";

interface PaletteDialogProps {
  title: string;
  /** Label for the confirming button ("OK", "Delete", "Copy"). */
  confirmLabel: string;
  /** Native `disabled` on the confirm button, and blocks Enter-to-submit. */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}

/**
 * The modal shell every palette dialog shares. Chrome only — it knows nothing
 * about palettes, which is what lets rename, add, delete and copy-to differ
 * by their body content alone.
 *
 * Portals to `document.body`, unlike `LayoutManagerDialog` which renders in
 * place: `PaletteSection` lives inside a scrollable, draggable dock panel, and
 * a `position: fixed` backdrop is positioned against the nearest ancestor with
 * a transform rather than against the viewport. The dock applies transforms
 * while dragging. `ColorPopup` portals for the same reason.
 */
export function PaletteDialog({
  title,
  confirmLabel,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}: PaletteDialogProps) {
  // Where focus came from, so dismissal hands it back the way a native dialog
  // does rather than dumping the user at the top of the document.
  const opener = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  useEffect(() => {
    const returnTo = opener.current;
    return () => returnTo?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div
      className="flow-dialog-backdrop"
      data-testid="palette-dialog-backdrop"
      onClick={onCancel}
    >
      {/* Stops a click inside the dialog from reaching the backdrop's
          dismiss handler — including a drag-select in the name field that
          releases outside, which would otherwise discard the user's typing. */}
      <form
        className="flow-dialog"
        data-testid="palette-dialog-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title">{title}</h2>
        </div>
        <div className="flow-dialog__body">{children}</div>
        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="flow-btn flow-btn--primary" disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
