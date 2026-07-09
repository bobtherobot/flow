import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { ToolId } from "./tools";

/** The public `setActiveTool` takes a discriminated union keyed on `type`;
 *  our ToolId is a subset, so we cast at this single boundary. */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

export interface ActiveTool {
  /** The current tool's type (e.g. "rectangle"); "selection" when unavailable. */
  activeType: string;
  /** Whether "keep selected tool active" is on. */
  locked: boolean;
  /** Switch the active tool. */
  setTool: (type: ToolId) => void;
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

  const at = api?.getAppState().activeTool;
  const activeType = at?.type ?? "selection";
  const locked = at?.locked ?? false;

  const setTool = (type: ToolId) => {
    api?.setActiveTool({ type } as SetToolArg);
  };

  const toggleLock = () => {
    api?.setActiveTool({ type: activeType, locked: !locked } as SetToolArg);
  };

  return { activeType, locked, setTool, toggleLock };
}
