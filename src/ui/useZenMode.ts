import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

export interface ZenMode {
  /** Whether zen mode is currently on. */
  zen: boolean;
  /** Flip zen mode. */
  toggle: () => void;
}

const NOOP = () => {};

/**
 * Reactive bridge for zen mode — the one place flow's chrome learns whether to
 * hide itself.
 *
 * The source of truth is Excalidraw's own `appState.zenModeEnabled`, not a
 * flow-owned flag, so the rail button, the View ▸ Zen Mode checkbox, the
 * quick-actions toggle and vendor's Alt+Z shortcut all stay in step for free.
 *
 * Every consumer calls this hook itself rather than App lifting the flag into
 * its own state: an `onChange`-driven state bump in App re-renders
 * `<Excalidraw>`, whose `componentDidUpdate` re-fires `onChange` whether or not
 * anything changed — an un-terminating loop. Same rule as `useActiveTool` /
 * `useBottomActions` / `useViewToggles`; see the note on `ToolRails`.
 */
export function useZenMode(api: ExcalidrawAPI | null): ZenMode {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  return {
    zen: Boolean(api?.getAppState().zenModeEnabled),
    toggle: api ? () => api.executeAction("zenMode") : NOOP,
  };
}
