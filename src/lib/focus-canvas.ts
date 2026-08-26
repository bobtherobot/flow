const EXCALIDRAW_CONTAINER_SELECTOR = ".excalidraw-container";

/**
 * Hand keyboard focus back to the canvas.
 *
 * Excalidraw binds keydown to its own container rather than the document
 * (the document binding is gated behind `handleKeyboardGlobally`, which flow
 * does not set), and flow's chrome is a DOM sibling — so while a chrome
 * control holds focus, every canvas shortcut is silently dead: undo, Escape,
 * Delete, arrow-key nudges. Call this when a fire-and-forget control has
 * finished its job and focus should go back where the user's next keystroke
 * is aimed. `.excalidraw-container` carries `tabIndex={0}` for exactly this.
 */
export function focusCanvas(): void {
  const container = document.querySelector<HTMLElement>(EXCALIDRAW_CONTAINER_SELECTOR);
  container?.focus({ preventScroll: true });
}
