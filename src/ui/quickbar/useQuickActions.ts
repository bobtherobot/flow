import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { type QuickItem, LOCK_ID, BINDING_ID } from "./actions";
import type { ToolId } from "../toolbar/tools";
import { type BindingMode, isBindingActive } from "../../lib/binding-mode";

/** The public `setActiveTool` union is keyed on `type`; our tool ids are a
 *  subset, so we cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

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
 * public `executeAction`; tool select uses `setActiveTool`; the arrow-binding
 * lock is flow-owned (persisted mode applied to appState by App).
 */
export function useQuickActions(
  api: ExcalidrawAPI | null,
  bindingMode: BindingMode,
  onSetBindingMode: (next: BindingMode) => void,
): QuickActions {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const appState = api?.getAppState();
  const activeToolType = appState?.activeTool?.type ?? "selection";
  const locked = appState?.activeTool?.locked ?? false;

  const isActive = (item: QuickItem): boolean => {
    if (item.id === BINDING_ID) return isBindingActive(bindingMode);
    if (item.id === LOCK_ID) return locked;
    if (item.kind === "tool") return activeToolType === item.id;
    if (item.toggleFlag) return Boolean(appState?.[item.toggleFlag]);
    return false; // fire-and-forget actions never look "on"
  };

  const trigger = (item: QuickItem): void => {
    if (!api) return;
    if (item.id === BINDING_ID) {
      onSetBindingMode(isBindingActive(bindingMode) ? "off" : "on");
      return;
    }
    if (item.id === LOCK_ID) {
      api.setActiveTool({ type: activeToolType, locked: !locked } as SetToolArg);
      return;
    }
    if (item.kind === "tool") {
      api.setActiveTool({ type: item.id as ToolId } as SetToolArg);
      return;
    }
    if (item.actionName) api.executeAction(item.actionName);
  };

  return { isActive, trigger };
}
