import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { zoomIn as doZoomIn, zoomOut as doZoomOut, resetZoom as doResetZoom } from "../../lib/view-actions";
import { openSearch } from "../../lib/search-bridge";
import type { BottomItem } from "./items";

/** Default canvas background when appState hasn't reported one yet. */
const DEFAULT_BG = "#ffffff";

export interface BottomActions {
  /** Whether a toggle item is currently on. */
  isActive: (item: BottomItem) => boolean;
  /** Toggle a `toggle` item (grid / zen) via its Excalidraw action. */
  toggle: (item: BottomItem) => void;
  /** Current zoom as a whole-number percentage (e.g. 100). */
  zoomPct: number;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  /** Current canvas background color (`#rrggbb`). */
  background: string;
  setBackground: (color: string) => void;
  /** Open the native search sidebar, pre-filled with `query`. */
  runSearch: (query: string) => void;
}

/**
 * Reactive bridge from the bottom bar to Excalidraw. Subscribes to `onChange`
 * so toggle highlights, the zoom %, and the background swatch re-render when
 * state changes (including via keyboard/menu). Toggles dispatch through the
 * public `executeAction`; zoom uses flow's view-actions; background dispatches
 * `changeViewBackgroundColor`; search delegates to the search bridge.
 */
export function useBottomActions(api: ExcalidrawAPI | null): BottomActions {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const appState = api?.getAppState();
  const zoomPct = Math.round((appState?.zoom?.value ?? 1) * 100);
  const background = appState?.viewBackgroundColor ?? DEFAULT_BG;

  const isActive = (item: BottomItem): boolean =>
    item.toggleFlag ? Boolean(appState?.[item.toggleFlag]) : false;

  const toggle = (item: BottomItem): void => {
    if (api && item.actionName) api.executeAction(item.actionName);
  };

  const setBackground = (color: string): void => {
    // changeViewBackgroundColor spreads its value into appState, so pass the
    // full partial (not a bare string) — and get history capture for free.
    api?.executeAction("changeViewBackgroundColor", { viewBackgroundColor: color });
  };

  return {
    isActive,
    toggle,
    zoomPct,
    zoomIn: () => api && doZoomIn(api),
    zoomOut: () => api && doZoomOut(api),
    resetZoom: () => api && doResetZoom(api),
    background,
    setBackground,
    runSearch: (query: string) => api && openSearch(api, query),
  };
}
