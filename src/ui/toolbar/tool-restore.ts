import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { StyleMemoryHandle } from "../useStyleMemory";
import { categoryOfTool } from "../../lib/style-memory";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Shared state between the two things that can take the active tool away and
 * have to give it back: the Cmd/Ctrl temporary-selection override
 * (`useToolOverride`) and a quick-arrow drag (`useQuickArrowDrag`).
 *
 * Module state rather than React state because both consumers are hooks that
 * mount exactly once, neither renders off these values, and a keyup handler
 * must read what a pointerdown handler wrote without waiting for a re-render.
 * `resetToolRestoreState` exists for tests, which would otherwise leak state
 * between cases.
 */
let suspendedTool: string | null = null;
let gestureActive = false;

/** The tool the Cmd/Ctrl override is currently suspending, or null when idle. */
export function getSuspendedTool(): string | null {
  return suspendedTool;
}

export function setSuspendedTool(type: string | null): void {
  suspendedTool = type;
}

/**
 * Claim the tool for a canvas gesture in flight.
 *
 * While this is set, `useToolOverride` must NOT restore on keyup: handing the
 * tool back mid-gesture would yank it out from under vendor's live drag. The
 * gesture captured what to restore at its start and owns the restore instead.
 */
export function beginToolGesture(): void {
  gestureActive = true;
}

export function endToolGesture(): void {
  gestureActive = false;
}

export function isToolGestureActive(): boolean {
  return gestureActive;
}

/** Tests only. */
export function resetToolRestoreState(): void {
  suspendedTool = null;
  gestureActive = false;
}

/**
 * Give `type` back as the active tool, preserving the selection and repairing
 * style memory.
 *
 * Three steps, each of which fixed a real bug and none of which is optional:
 *
 * 1. Re-arm the tool **locked** — flow is a modal-tool app and `locked` has
 *    exactly one correct value.
 * 2. Put the selection back. Vendor resets `selectedElementIds` for every
 *    non-selection tool (App.tsx:4758), so step 1 clears it on the way past.
 *    Read the selection FRESH rather than from a snapshot taken at gesture
 *    start: a snapshot would clobber anything that changed in between — most
 *    sharply a Cmd+Z, whose undo restores its own selection. Omitting
 *    `elements` leaves the scene alone (vendor guards the replace on
 *    `if (sceneData.elements)`, App.tsx:3972).
 * 3. Reload the restored tool's style-memory category **through the handle**,
 *    not with a hand-rolled `updateScene`. Step 2 creates a state style
 *    memory's design never had to account for — a drawing tool active with
 *    elements selected — and its adopt-on-select cannot tell that from a
 *    genuine new selection, so it re-fires and leaves `currentItem*` holding
 *    the reselected element's own style from a possibly different category. A
 *    hand-rolled write (the first attempt at this) bypasses the bookkeeping
 *    that keeps the drift watcher from re-reading the write as an unexplained
 *    edit and folding it into the wrong bucket, corrupting THAT bucket
 *    instead. See [[style-memory]] and [[tool-override]].
 */
export function restoreTool(
  api: ExcalidrawAPI,
  type: string,
  styleMemory?: StyleMemoryHandle | null,
): void {
  const { selectedElementIds, selectedGroupIds, editingGroupId } = api.getAppState();
  api.setActiveTool({ type, locked: true } as SetToolArg);
  api.updateScene({
    appState: { selectedElementIds, selectedGroupIds, editingGroupId },
  });
  const category = categoryOfTool(type);
  if (category && styleMemory) {
    const { currentItemArrowType } = api.getAppState() as unknown as {
      currentItemArrowType?: string;
    };
    styleMemory.reloadCategory(category, type, currentItemArrowType ?? "sharp");
  }
}
