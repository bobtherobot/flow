export type HistoryShortcut = "undo" | "redo";

/**
 * Matches Excalidraw's history shortcuts on a keydown raised inside flow's own
 * chrome. Returns null for everything else, including plain keys — flow
 * forwards history only, never tool or canvas shortcuts.
 */
export function historyShortcutFor(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}): HistoryShortcut | null {
  if (!e.ctrlKey && !e.metaKey) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

/**
 * Text entry that owns its own undo stack, so a history shortcut belongs to the
 * browser rather than the canvas. Matches the `text` / `number` / `password`
 * input types and textareas the vendor's `isWritableElement`
 * (`packages/excalidraw/utils.ts:76`) also treats as writable — the input
 * types that can actually occur in flow's own panels — plus contenteditable,
 * which the vendor rule doesn't check (its own wysiwyg/`data-type` and `<br>`
 * cases only occur inside Excalidraw's own subtree, which this handler never
 * sees). Note `range` is deliberately absent, so a focused slider still
 * forwards.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    (target instanceof HTMLInputElement &&
      (target.type === "text" || target.type === "number" || target.type === "password"))
  );
}
