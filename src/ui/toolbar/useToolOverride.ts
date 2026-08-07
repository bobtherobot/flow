import { useEffect, useRef } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { canEngage, overrideKeyFor, type OverrideState } from "./tool-override";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Illustrator-style temporary tool override: hold Cmd (Ctrl off Apple
 * hardware) to suspend the active drawing tool and work with the selection
 * tool, release to get the drawing tool back with the selection intact.
 *
 * Mirrors Excalidraw's own Space-for-hand override (`isHoldingSpace`, vendor
 * `App.tsx:536`, restored in `onKeyUp` at `:4602`) but drives it entirely from
 * flow through the public API — no fork edits.
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
    };

    const onKeyDown = (e: KeyboardEvent) => {
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
}
