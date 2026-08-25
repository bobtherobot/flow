import { useEffect, useId, useRef } from "react";
import "./dialogs.css";

export interface ConfirmDialogProps {
  title: string;
  /** Body content — prose explaining what the action does, and to what. */
  children: React.ReactNode;
  /** Label for the confirming button ("Restore", "Delete"). */
  confirmLabel: string;
  /** Styles the confirm button as destructive and makes Cancel the default
   *  focus, so Enter on an unread dialog cannot destroy anything. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A modal yes/no confirmation. Escape and a backdrop click both cancel, never
 * confirm — a dismissal gesture must not be able to take the action.
 *
 * Focus lands on Cancel for a destructive dialog: this can open on top of
 * another dialog whose own button the user just pressed, so an accidental
 * second Enter has to be harmless.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (destructive ? cancelRef : confirmRef).current?.focus();
  }, [destructive]);

  return (
    <div
      className="flow-dialog-backdrop flow-dialog-backdrop--over"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="flow-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation(); // don't also close whatever is underneath
            onCancel();
          }
        }}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            {title}
          </h2>
        </div>
        <div className="flow-dialog__body" id={bodyId}>
          {children}
        </div>
        <div className="flow-dialog__footer">
          <button
            ref={cancelRef}
            type="button"
            className="flow-btn flow-btn--ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`flow-btn ${destructive ? "flow-btn--danger" : "flow-btn--primary"}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
