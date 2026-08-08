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

/** Input types that are plain single-line text entry — a user can type any
 *  character, including letters, into all of them. */
const TEXT_INPUT_TYPES = new Set(["text", "number", "password", "search", "email", "url", "tel"]);

/**
 * Text entry that owns its own keystrokes, so a history shortcut — or any
 * other single-key capture reusing this guard, like the `Q` swallow in
 * useToolOverride.ts — belongs to the field rather than the canvas.
 *
 * This used to claim it covered "the input types that can actually occur in
 * flow's own panels", scoped to the vendor's own `isWritableElement`
 * (`packages/excalidraw/utils.ts:76`) list (`text` / `number` / `password`).
 * That claim was already false — flow's bottom-bar search box
 * (SearchControl.tsx) and the Search panel (SearchPanel.tsx) are both
 * `type="search"`, which the vendor list doesn't cover because Excalidraw
 * itself has no search input of that type — and it became load-bearing once
 * the `Q` swallow started guarding on it: a bare "q" typed into either search
 * box was silently eaten. The real requirement is "would a bare keypress land
 * as a character here", not "does the vendor consider it writable" — those
 * overlap heavily but are not the same claim. `email`, `url` and `tel` are
 * included for the same reason even though nothing in flow uses them yet.
 * Textareas and contenteditable are matched too, the latter because the
 * vendor's own wysiwyg/`data-type`/`<br>` checks only apply inside
 * Excalidraw's own subtree, which this handler never sees. Note `range` (and
 * other non-textual types like `checkbox`, `color`, `date`) is deliberately
 * absent, so a focused slider still forwards.
 */
export function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable) ||
    (target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type))
  );
}
