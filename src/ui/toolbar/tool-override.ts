/** Pure logic behind the temporary-selection override. Kept free of React and
 *  of vendor imports so it can be tested directly (mirrors toolbar-state.ts). */
import { isTextEntry } from "../../lib/history-shortcuts";

/**
 * Which `KeyboardEvent.key` engages the override on a given platform: Cmd on
 * Apple hardware, Ctrl everywhere else. Mirrors the vendor's own
 * `CTRL_OR_CMD: isDarwin ? "metaKey" : "ctrlKey"`
 * (`vendor/excalidraw/packages/excalidraw/keys.ts:38`), including its
 * `navigator.platform` test (`constants.ts:5`).
 *
 * Deliberately NOT "Meta or Control": on macOS, Control is right-click
 * emulation, and engaging on it would suspend the tool every time the user
 * context-clicks.
 */
export function overrideKeyFor(platform: string): "Meta" | "Control" {
  return /Mac|iPod|iPhone|iPad/.test(platform) ? "Meta" : "Control";
}

/** The slice of Excalidraw's appState the engage decision reads. Structural on
 *  purpose — no vendor import, and the test can build one by hand. */
export interface OverrideState {
  activeTool: { type: string };
  cursorButton?: "up" | "down";
  newElement?: unknown;
  multiElement?: unknown;
  editingTextElement?: unknown;
}

/**
 * Whether holding the modifier should suspend the current tool. Every `false`
 * branch prevents a concrete failure, not a hypothetical one:
 *
 * - `selection` — nothing to suspend.
 * - `image` — the restore would call `setActiveTool({type:"image"})`, whose
 *   `nextActiveTool.type === "image"` branch calls `onImageToolbarButtonClick`
 *   and re-opens the OS file picker (vendor `App.tsx`, ~6069 / ~12827).
 * - pointer down / `newElement` / `multiElement` — stealing the tool mid-gesture
 *   would break drawing outright. The vendor reads Cmd mid-drag to close elbow
 *   arrows, and the mid-draw grid-snap bypasses that `feat/cmd-modifier-semantics`
 *   deliberately left in place (`handlePointerMoveInEditMode`, `actionFinalize`)
 *   are only safe *because* this guard makes them unreachable. It used to also
 *   say "to bypass grid snapping" generally; that is no longer true of the
 *   reachable paths — see [[tool-override]].
 * - text editing, or a key aimed at a text field — the modifier belongs to
 *   whatever the user is typing into.
 */
export function canEngage(
  state: OverrideState | undefined,
  target: EventTarget | null,
): boolean {
  if (!state) return false;
  const type = state.activeTool.type;
  if (type === "selection" || type === "image") return false;
  if (state.cursorButton === "down") return false;
  if (state.newElement || state.multiElement || state.editingTextElement) return false;
  if (isTextEntry(target)) return false;
  return true;
}
