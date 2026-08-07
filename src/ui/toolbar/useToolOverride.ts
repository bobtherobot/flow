import { useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { canEngage, overrideKeyFor, type OverrideState } from "./tool-override";
import { isTextEntry } from "../../lib/history-shortcuts";
import { categoryOfTool } from "../../lib/style-memory";
import { resolveLoad, setActiveCategory } from "../../lib/style-memory-store";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];
type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];

/**
 * Illustrator-style temporary tool override: hold Cmd (Ctrl off Apple
 * hardware) to suspend the active drawing tool and work with the selection
 * tool, release to get the drawing tool back with the selection intact.
 *
 * Mirrors Excalidraw's own Space-for-hand override (`isHoldingSpace`, vendor
 * `App.tsx:536`, restored in `onKeyUp` at `:4602`) but drives the override
 * itself entirely from flow through the public API. The permanent tool lock
 * this hook also enforces (second effect below) needed one small fork edit —
 * `actionFinalize.tsx`, decoupling a drawn element's auto-selection from the
 * lock, the same conflation `App.tsx` (commit `a9dcdb6f`) already fixed at its
 * two other sites — so this file is not fork-free end to end. See
 * [[tool-override]].
 *
 * Listeners are capture-phase on `window`, the same placement as App's
 * Ctrl/Cmd+F repoint, so the decision is made before Excalidraw's own
 * container-bound handler sees the key.
 */
export function useToolOverride(api: ExcalidrawAPI | null): void {
  // The tool a held modifier is currently suspending, or null when idle. A ref
  // rather than state: nothing renders off it, and keyup must read what keydown
  // wrote without waiting for a re-render.
  const suspended = useRef<string | null>(null);

  useEffect(() => {
    if (!api) return;
    const overrideKey = overrideKeyFor(navigator.platform);

    const restore = () => {
      const type = suspended.current;
      if (!type) return;
      suspended.current = null;
      // Read the selection FRESH. A snapshot taken at engage time would clobber
      // anything that changed during the hold — most sharply a Cmd+Z, whose
      // undo restores its own selection.
      const { selectedElementIds, selectedGroupIds, editingGroupId } = api.getAppState();
      // Restores the tool's own cursor, but clears the selection on the way:
      // the vendor resets it for every non-selection tool (App.tsx:4758) ...
      api.setActiveTool({ type, locked: true } as SetToolArg);
      // ... so put it back. Omitting `elements` leaves the scene alone — the
      // vendor guards the replace on `if (sceneData.elements)` (App.tsx:3972).
      api.updateScene({
        appState: { selectedElementIds, selectedGroupIds, editingGroupId },
      });
      // flow: re-applying the selection above creates a state style memory's
      // design never had to account for — a drawing tool active with
      // elements selected. useStyleMemory's own adopt-on-select cannot tell
      // "the override just restored what was already selected" apart from a
      // genuine new selection, so it re-fires here and leaves currentItem*
      // holding the reselected element's OWN style, from a possibly
      // different category, instead of the restored tool's bucket. Re-run
      // style memory's load for the restored tool's category — the same
      // resolveLoad call useStyleMemory's own tool-change branch makes — so
      // the invariant it depends on (a load always precedes a draw) holds
      // again. Confined to this path deliberately; see [[style-memory]] and
      // [[tool-override]] for the full trace and its one known residual
      // (this write can itself be re-folded into the still-selected
      // element's bucket by useStyleMemory's drift capture — harmless, since
      // that bucket self-corrects the next time anything in its category is
      // adopted, and out of scope for a fix confined to this file).
      const category = categoryOfTool(type);
      if (category) {
        setActiveCategory(category);
        const { currentItemArrowType } = api.getAppState() as unknown as {
          currentItemArrowType?: string;
        };
        const patch = resolveLoad({
          category,
          toolType: type,
          arrowType: currentItemArrowType ?? "sharp",
        });
        if (Object.keys(patch).length > 0) {
          api.updateScene({
            appState: patch as UpdateAppState,
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // flow: `Q` toggles Excalidraw's own tool lock (vendor App.tsx
      // `toggleLock`, bound to KEYS.Q === "q"). With the lock forced
      // permanently on, `toggleLock`'s own branching sets
      // `{type: "selection", locked: false}` before the normalizer effect
      // below re-locks it — restoring `locked` but never the tool, so `Q`
      // silently dropped the user to Selection. Swallow it here instead,
      // guarded by isTextEntry so typing "q" into Excalidraw's own text
      // editor (a <textarea>, element/textWysiwyg.tsx) is unaffected.
      if (e.key === "q" && !isTextEntry(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key !== overrideKey) return;
      // A held modifier auto-repeats keydown; only the first one engages.
      if (suspended.current) return;
      const state = api.getAppState() as unknown as OverrideState;
      if (!canEngage(state, e.target)) return;
      suspended.current = state.activeTool.type;
      // Switching TO selection preserves the selection (vendor App.tsx:4758
      // guards its reset on the target not being selection) and sets the
      // cursor, so the swap-in needs nothing further.
      api.setActiveTool({ type: "selection", locked: true } as SetToolArg);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === overrideKey) restore();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    // Cmd+Tab and Cmd+Space steal focus before the keyup lands. Without these
    // the override would stay engaged until the next modifier press.
    window.addEventListener("blur", restore);
    document.addEventListener("visibilitychange", restore);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", restore);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [api]);

  // flow is a modal-tool app — the chosen tool stays chosen, and the override
  // above is how you reach selection transiently. So `locked` has exactly one
  // correct value and this effect re-asserts it against every source: an
  // opened document's appState, anything future. `Q` itself is now swallowed
  // above rather than relying on this to clean up after it — see that
  // handler's comment — but this stays as the backstop for every other way
  // `locked` could end up false.
  useEffect(() => {
    if (!api) return;
    const enforce = () => {
      const { type, locked } = api.getAppState().activeTool;
      // Converges: once locked, no further writes, so this cannot loop.
      if (locked) return;
      // Re-activating the image tool re-opens the OS file picker
      // (vendor App.tsx:4741). An unlocked image tool is left alone.
      if (type === "image") return;
      api.setActiveTool({ type, locked: true } as SetToolArg);
    };
    // Run once up front: the api can be handed over already unlocked, and the
    // first `onChange` may be many interactions away.
    enforce();
    return api.onChange(enforce);
  }, [api]);
}
