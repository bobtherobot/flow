import { useEffect } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { canEngage, overrideKeyFor, type OverrideState } from "./tool-override";
import { isTextEntry } from "../../lib/history-shortcuts";
import type { StyleMemoryHandle } from "../useStyleMemory";
import {
  getSuspendedTool,
  isToolGestureActive,
  restoreTool,
  setSuspendedTool,
} from "./tool-restore";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

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
 *
 * `styleMemory` is optional so the hook stays usable standalone (its own unit
 * tests construct it that way); when supplied it corrects a style-memory
 * corruption the restore step below causes — see the comment on `restore`.
 */
export function useToolOverride(
  api: ExcalidrawAPI | null,
  styleMemory?: StyleMemoryHandle | null,
): void {
  useEffect(() => {
    if (!api) return;
    const overrideKey = overrideKeyFor(navigator.platform);

    const restore = () => {
      const type = getSuspendedTool();
      if (!type) return;
      setSuspendedTool(null);
      // A canvas gesture (a quick-arrow drag) is mid-flight and now owns the
      // restore: it captured this same tool at its start and hands it back on
      // pointer-up. Restoring here would switch the tool out from under
      // vendor's live drag.
      if (isToolGestureActive()) return;
      restoreTool(api, type, styleMemory);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // flow: `Q` toggles Excalidraw's own tool lock (vendor App.tsx
      // `toggleLock`, bound to KEYS.Q === "q"). With the lock forced
      // permanently on, `toggleLock`'s own branching sets
      // `{type: "selection", locked: false}` before the normalizer effect
      // below re-locks it — restoring `locked` but never the tool, so `Q`
      // silently dropped the user to Selection. Swallow it here instead,
      // guarded by isTextEntry so typing "q" into Excalidraw's own text
      // editor (a <textarea>, element/textWysiwyg.tsx) or flow's own search
      // boxes (both type="search" — SearchControl.tsx, SearchPanel.tsx) is
      // unaffected. isTextEntry didn't recognize "search" until this wave;
      // see [[tool-override]].
      if (e.key === "q" && !isTextEntry(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key !== overrideKey) return;
      // A held modifier auto-repeats keydown; only the first one engages.
      if (getSuspendedTool()) return;
      const state = api.getAppState() as unknown as OverrideState;
      if (!canEngage(state, e.target)) return;
      setSuspendedTool(state.activeTool.type);
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
  }, [api, styleMemory]);

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
