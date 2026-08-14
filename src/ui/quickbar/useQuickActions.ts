import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { type QuickItem, BINDING_ID } from "./actions";
import { useActiveTool } from "../toolbar/useActiveTool";
import type { ToolId } from "../toolbar/tools";
import { type BindingMode, isBindingActive } from "../../lib/binding-mode";

export interface QuickActions {
  /** Whether an item should render highlighted (toggle on, or tool selected). */
  isActive: (item: QuickItem) => boolean;
  /** Perform an item: dispatch its action / toggle / tool select. */
  trigger: (item: QuickItem) => void;
}

/**
 * Reactive bridge from the quick-actions bar to Excalidraw. Subscribes to
 * `onChange` so toggle/tool highlights re-render when state changes (including
 * via keyboard shortcuts). Generic toggles and actions dispatch through the
 * public `executeAction`; the arrow-binding lock is flow-owned (persisted mode
 * applied to appState by App).
 *
 * Tool items reuse `useActiveTool`'s `setTool` rather than calling
 * `setActiveTool` directly, the same way `ToolRail` does — it's the one place
 * that knows how to arm an arrow variant's `currentItemArrowType` or a flow
 * shape's `currentItemFlowShape` before activating the shared underlying
 * tool, and duplicating that logic here would be exactly the kind of drift
 * that let a quickbar-armed flow shape draw nothing in the first place.
 * `useActiveTool` is a second, independent subscription (mirrors how the
 * toolbar and shapebar rails each call it separately) — safe because it's a
 * pure reactive read of `api`, not owned state.
 */
export function useQuickActions(
  api: ExcalidrawAPI | null,
  bindingMode: BindingMode,
  onSetBindingMode: (next: BindingMode) => void,
): QuickActions {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const { activeType, arrowType, flowShapeKind, setTool } = useActiveTool(api);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const appState = api?.getAppState();

  const isActive = (item: QuickItem): boolean => {
    if (item.id === BINDING_ID) return isBindingActive(bindingMode);
    if (item.kind === "tool") {
      const toolType = item.toolType ?? item.id;
      // Same disambiguation ToolRail uses: arrow variants share activeType
      // "arrow", flow shapes share activeType "rectangle" — id alone can't
      // tell them apart.
      return (
        activeType === toolType &&
        (item.arrowType === undefined || arrowType === item.arrowType) &&
        (item.flowShape ?? null) === flowShapeKind
      );
    }
    if (item.toggleFlag) return Boolean(appState?.[item.toggleFlag]);
    return false; // fire-and-forget actions never look "on"
  };

  const trigger = (item: QuickItem): void => {
    if (!api) return;
    if (item.id === BINDING_ID) {
      onSetBindingMode(isBindingActive(bindingMode) ? "off" : "on");
      return;
    }
    if (item.kind === "tool") {
      // `item.id` is a real ToolId at runtime whenever `kind === "tool"`
      // (TOOL_ITEMS mints it from `ALL_TOOLS`'s own `ToolDef.id`); `QuickItem`
      // widens it to `string` to also cover action/toggle ids, so this one
      // boundary cast is unavoidable (mirrors the cast the old direct
      // `setActiveTool` call made at the same spot).
      setTool((item.toolType ?? item.id) as ToolId, item.arrowType, item.flowShape);
      return;
    }
    if (item.actionName) api.executeAction(item.actionName);
  };

  return { isActive, trigger };
}
