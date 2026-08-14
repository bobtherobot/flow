import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { ArrowType, ToolId } from "./tools";
import type { FlowShapeKind } from "../shapes/types";
import { defaultsFor } from "../shapes/registry";

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
  /** The flow shape kind currently armed (`appState.currentItemFlowShape.kind`),
   *  or null when nothing is armed; drives which shapebar tool the rail
   *  highlights. */
  flowShapeKind: string | null;
  /** Switch the active tool. For arrow variants, pass the shape to apply as the
   *  new-arrow default before activating the shared "arrow" tool. For flow's
   *  parametric shapes, pass the kind to arm before activating the shared
   *  "rectangle" tool. */
  setTool: (type: ToolId, arrowType?: ArrowType, flowShape?: FlowShapeKind) => void;
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
  const flowShapeKind =
    (state?.currentItemFlowShape as { kind?: string } | null)?.kind ?? null;

  const setTool = (type: ToolId, nextArrowType?: ArrowType, flowShape?: FlowShapeKind) => {
    // `currentItemFlowShape` is written on EVERY tool switch, never omitted.
    // Omitting it when the new tool is not a flow shape would leave the last
    // shape armed, and the next plain rectangle would silently be stamped as,
    // say, a triangle.
    const patch: Record<string, unknown> = {
      currentItemFlowShape: flowShape
        ? { kind: flowShape, p: defaultsFor(flowShape) }
        : null,
    };
    if (nextArrowType) {
      patch.currentItemArrowType = nextArrowType;
    }
    api?.updateScene({ appState: patch as UpdateAppState });
    api?.setActiveTool({ type } as SetToolArg);
  };

  return { activeType, arrowType, flowShapeKind, setTool };
}
