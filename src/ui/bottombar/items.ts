/** The bottom bar's item registry — the single source of truth for what the bar
 *  can contain, in render order. Kept free of vendor imports (mirrors
 *  quickbar/actions.ts); the reactive bridge maps these to Excalidraw calls. */

/** How an item behaves / which control renders it. `toggle` = an on/off icon
 *  button; the rest are bespoke compound controls. */
export type BottomKind = "toggle" | "zoom" | "background" | "search";

/** Visual/config grouping. Separators are drawn between groups in the bar and
 *  the groups are the section headers in the config menu. */
export type BottomGroup = "view" | "zoom" | "canvas" | "search";

export interface BottomItem {
  /** Stable id used in `hiddenItems` and the config menu. */
  id: string;
  /** Accessible name + tooltip. */
  label: string;
  kind: BottomKind;
  group: BottomGroup;
  /** Excalidraw action name for `toggle` items dispatched via `executeAction`. */
  actionName?: string;
  /** For toggles: the `appState` boolean that reflects the on-state. */
  toggleFlag?: "gridModeEnabled" | "zenModeEnabled";
  /** Shown in the tooltip when present. */
  shortcut?: string;
}

/** All bottom-bar items in render order. */
export const BOTTOM_ITEMS: readonly BottomItem[] = [
  {
    id: "gridMode",
    label: "Toggle grid",
    kind: "toggle",
    group: "view",
    actionName: "gridMode",
    toggleFlag: "gridModeEnabled",
    shortcut: "Ctrl+'",
  },
  {
    id: "zenMode",
    label: "Zen mode",
    kind: "toggle",
    group: "view",
    actionName: "zenMode",
    toggleFlag: "zenModeEnabled",
    shortcut: "Alt+Z",
  },
  { id: "zoom", label: "Zoom", kind: "zoom", group: "zoom" },
  { id: "background", label: "Canvas background", kind: "background", group: "canvas" },
  { id: "search", label: "Search", kind: "search", group: "search" },
];

/** Look up an item by id. */
export function bottomItem(id: string): BottomItem | undefined {
  return BOTTOM_ITEMS.find((i) => i.id === id);
}
