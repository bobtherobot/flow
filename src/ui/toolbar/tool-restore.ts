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
 *
 * ## The (suspendedTool, gesture) quadrant
 *
 * Two claims on one tool, so four states. Three of the four have produced a
 * real, measured bug, so all four are written out here rather than left to be
 * re-derived:
 *
 * | `suspendedTool` | `gesture` | what is going on | who hands the tool back |
 * |---|---|---|---|
 * | `null` | `null` | idle — the user's tool is simply active | nobody, nothing was taken |
 * | `T` | `null` | Cmd/Ctrl held: the override swapped `T` out for selection | the override, on keyup |
 * | `null` | set | a quick-arrow drag with no modifier involved | the gesture, on pointer-up |
 * | `T` | set | Cmd/Ctrl held **and** a drag in flight | the gesture — see below |
 *
 * The fourth state is the hard one. Both claims are live at once, and the
 * modifier can come up at any point during the drag, including before the
 * press has even become a drag. So the claim is made **transactionally**:
 *
 * - `beginToolGesture` captures what to hand back at **pointerdown** — the
 *   suspended tool if the override is engaged, otherwise the live tool. It
 *   cannot wait for the drag to be confirmed, because a keyup can land in
 *   between and there would be nothing left to read.
 * - The override does not restore on keyup during a gesture (that would yank
 *   the tool out from under vendor's live drag) and — the part that used to be
 *   missing — does not *clear* `suspendedTool` either. It calls
 *   `deferRestoreToGesture`, handing the obligation over intact.
 * - `endToolGesture` then decides between the two remaining possibilities:
 *   the modifier came up during the gesture, so the gesture discharges the
 *   override's obligation and hands `T` back; or the modifier is still down,
 *   so the override still owns `T` and the gesture only has to leave the
 *   effective tool — selection — behind it.
 */
let suspendedTool: string | null = null;

interface GestureClaim {
  /** The tool to hand back once nobody else owns it. Captured at pointerdown. */
  tool: string;
  /**
   * The override released its own claim (a keyup, a blur) while this gesture
   * was in flight, so this gesture inherited the obligation to restore `tool`.
   */
  inherited: boolean;
  /** The gesture actually took the tool — it armed, it did not stay a click. */
  armed: boolean;
}

/** Non-null exactly while a canvas gesture owns the tool. */
let gesture: GestureClaim | null = null;

/** The tool the Cmd/Ctrl override is currently suspending, or null when idle. */
export function getSuspendedTool(): string | null {
  return suspendedTool;
}

export function setSuspendedTool(type: string | null): void {
  suspendedTool = type;
}

/**
 * Claim the tool for a canvas gesture in flight, capturing what to hand back.
 *
 * Called at **pointerdown**, before the press is even known to be a drag. Two
 * separate reasons, and both are load-bearing:
 *
 * 1. `useHoverTarget` treats any held button as "another gesture owns the
 *    canvas" and arms a 120ms grace timer that does not re-check this flag
 *    once armed. Claiming late leaves a window in which that timer arms and
 *    then unmounts the very triangle being dragged.
 * 2. The captured tool has to be read while it is still readable. Capturing at
 *    arm time (after the first qualifying move) meant a keyup landing in the
 *    gap had already cleared `suspendedTool`, so the gesture fell back to the
 *    override's own `"selection"` and the user's tool was gone for good.
 *
 * `activeToolType` is the live `appState.activeTool.type`; it is only used
 * when the override is not engaged, since while it is the live tool reads
 * `"selection"` and the tool the user actually wants back is the suspended one.
 */
export function beginToolGesture(activeToolType: string): void {
  gesture = { tool: suspendedTool ?? activeToolType, inherited: false, armed: false };
}

/**
 * The gesture stopped being a mere press and took the tool (armed the arrow
 * tool and handed vendor a pointerdown). Until this is called the gesture has
 * changed nothing, so it has nothing of its own to undo.
 */
export function markToolGestureArmed(): void {
  if (gesture) gesture.armed = true;
}

/**
 * Hand the override's restore obligation to the in-flight gesture, if there is
 * one. Returns true when the gesture took it, in which case the caller must
 * leave `suspendedTool` alone — the gesture will clear it when it discharges.
 */
export function deferRestoreToGesture(): boolean {
  if (!gesture) return false;
  gesture.inherited = true;
  return true;
}

/**
 * End the gesture's claim and report which tool to hand back now, or null when
 * there is nothing to hand back.
 *
 * The four answers, in the order they are decided:
 *
 * 1. **The override released mid-gesture** (`inherited`). The gesture is
 *    discharging someone else's obligation, so it does so whether or not it
 *    ever armed — a Cmd-held press that never moved still has to give the
 *    suspended tool back, because the override deliberately did not.
 * 2. **Nothing was ever taken** (not armed, not inherited) → null. A plain
 *    click must be a total no-op, including no tool write.
 * 3. **The override is still engaged** (`suspendedTool` set, modifier still
 *    down). It keeps owning `T`; the gesture only puts the *effective* tool —
 *    selection — back, so the override's own keyup restore still works and the
 *    quick arrows keep appearing for the rest of the hold.
 * 4. Otherwise the gesture's own captured tool.
 */
export function endToolGesture(): string | null {
  const claim = gesture;
  gesture = null;
  if (!claim) return null;
  if (claim.inherited) {
    suspendedTool = null;
    return claim.tool;
  }
  if (!claim.armed) return null;
  if (suspendedTool !== null) return "selection";
  return claim.tool;
}

export function isToolGestureActive(): boolean {
  return gesture !== null;
}

/** Tests only. */
export function resetToolRestoreState(): void {
  suspendedTool = null;
  gesture = null;
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
