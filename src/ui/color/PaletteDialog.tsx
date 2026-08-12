import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../dialogs.css";

// Elements a keyboard user can land on. `[tabindex]:not([tabindex="-1"])`
// admits elements made focusable on purpose while excluding ones (like the
// dialog container itself) that are only programmatically focusable.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function queryFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

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

  const dialogRef = useRef<HTMLFormElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // `aria-modal="true"` tells assistive tech everything outside is inert, so
  // that claim has to be backed by real behavior: focus something inside on
  // open, and never let Tab walk out into the page behind the backdrop.
  //
  // Initial focus prefers the body's own first focusable element (the rename
  // input, the copy dialog's <select>) over the footer's Cancel/OK, so the
  // dialog doesn't open with focus sitting on an action button by default.
  // When the body has nothing focusable — Task 4's delete-confirm dialog is
  // just a <p> — the dialog container itself is the fallback (tabIndex=-1
  // makes that legal), so focus still lands inside the modal instead of
  // nowhere. Skipped entirely when a body field already grabbed focus via
  // `autoFocus`, which React applies before this effect runs.
  useEffect(() => {
    const container = dialogRef.current;
    if (!container) return;
    if (container.contains(document.activeElement)) return;
    const bodyFocusable = bodyRef.current ? queryFocusable(bodyRef.current) : [];
    (bodyFocusable[0] ?? container).focus();
  }, []);

  // Tab trap: recompute the focusable set on every keypress rather than once
  // on mount, because it changes while the dialog is open — the rename
  // dialog's OK button flips disabled as the user types, and the copy
  // dialog's <select> is itself part of the set.
  const handleTabTrap = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Tab") return;
    const container = dialogRef.current;
    if (!container) return;
    const focusable = queryFocusable(container);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    // The container counts as the first boundary. When the body has nothing
    // focusable the container is what holds focus on open (see above), and it
    // is in the focusable list at neither end — so comparing against `first`
    // alone leaves Shift+Tab as the very first keystroke unhandled, and focus
    // walks backward out of the dialog into the page behind the backdrop.
    // Forward Tab needs no equivalent: the container precedes its own children
    // in DOM order, so the browser already lands on `first`.
    const atFirst = document.activeElement === first || document.activeElement === container;
    if (e.shiftKey && atFirst) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

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
        ref={dialogRef}
        className="flow-dialog"
        data-testid="palette-dialog-form"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleTabTrap}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title">{title}</h2>
        </div>
        <div className="flow-dialog__body" ref={bodyRef}>
          {children}
        </div>
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
