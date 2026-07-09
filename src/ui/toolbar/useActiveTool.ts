import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { ArrowType, ToolId } from "./tools";

/** The public `setActiveTool` takes a discriminated union keyed on `type`;
 *  our ToolId is a subset, so we cast at this single boundary. */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];
type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];

export interface ActiveTool {
  /** The current tool's type (e.g. "rectangle"); "selection" when unavailable. */
  activeType: string;
  /** The current new-arrow shape default (`appState.currentItemArrowType`);
   *  drives which arrow variant the rail highlights. */
  arrowType: string;
  /** Whether "keep selected tool active" is on. */
  locked: boolean;
  /** Switch the active tool. For arrow variants, pass the shape to apply as the
   *  new-arrow default before activating the shared "arrow" tool. */
  setTool: (type: ToolId, arrowType?: ArrowType) => void;
  /** Toggle the lock flag on the current tool. */
  toggleLock: () => void;
}

/**
 * Reactive bridge to Excalidraw's active tool. Subscribes to `onChange` so the
 * rail re-renders when the tool changes (including via keyboard shortcuts), and
 * dispatches switches through the public `setActiveTool` API. Mirrors the
 * `useSelectionStyle` subscription shape.
 */
export function useActiveTool(api: ExcalidrawAPI | null): ActiveTool {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const state = api?.getAppState();
  const at = state?.activeTool;
  const activeType = at?.type ?? "selection";
  const arrowType = state?.currentItemArrowType ?? "sharp";
  const locked = at?.locked ?? false;

  const setTool = (type: ToolId, nextArrowType?: ArrowType) => {
    // Arrow variants share the "arrow" tool; set the new-arrow default first so
    // the shape is in place before the tool activates (public API, no fork edit).
    if (nextArrowType) {
      api?.updateScene({ appState: { currentItemArrowType: nextArrowType } as UpdateAppState });
    }
    api?.setActiveTool({ type } as SetToolArg);
  };

  const toggleLock = () => {
    api?.setActiveTool({ type: activeType, locked: !locked } as SetToolArg);
  };

  return { activeType, arrowType, locked, setTool, toggleLock };
}
