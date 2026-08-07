import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

export interface ViewToggle {
  checked: boolean;
  toggle: () => void;
}

export interface ViewToggles {
  grid: ViewToggle;
  objectsSnap: ViewToggle;
  zenMode: ViewToggle;
}

const NOOP = () => {};

/**
 * Reactive bridge for the View menu's canvas toggles. Subscribes to `onChange`
 * so checkmarks re-render when state changes (including via keyboard/other
 * bars), reads the flags from `getAppState()`, and toggles through the public
 * `executeAction` API. Mirrors useActiveTool/useBottomActions.
 */
export function useViewToggles(api: ExcalidrawAPI | null): ViewToggles {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const appState = api?.getAppState();

  const action = (name: string): (() => void) =>
    api ? () => api.executeAction(name) : NOOP;

  return {
    grid: { checked: Boolean(appState?.gridModeEnabled), toggle: action("gridMode") },
    objectsSnap: {
      checked: Boolean(appState?.objectsSnapModeEnabled),
      toggle: action("objectsSnapMode"),
    },
    zenMode: { checked: Boolean(appState?.zenModeEnabled), toggle: action("zenMode") },
  };
}
