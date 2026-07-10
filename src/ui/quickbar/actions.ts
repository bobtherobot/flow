/** The quick-actions bar's item registry — the single source of truth for what
 *  the bar can contain, in render order. Kept free of vendor imports (mirrors
 *  toolbar/tools.ts); the reactive bridge maps these to Excalidraw calls. */
import { TOOLS, type ToolId } from "../toolbar/tools";

/** How an item behaves. `action` = fire-and-forget; `toggle` = reflects an
 *  on/off state; `tool` = selects a drawing tool (opt-in, hidden by default). */
export type QuickItemKind = "action" | "toggle" | "tool";

/** Visual/config grouping. Separators are drawn between groups in the bar and
 *  the groups are the section headers in the config menu. */
export type QuickGroup = "order" | "group" | "align" | "toggle" | "history" | "tool";

export interface QuickItem {
  /** Stable id used in `hiddenItems` and the config menu. */
  id: string;
  /** Accessible name + tooltip. */
  label: string;
  kind: QuickItemKind;
  group: QuickGroup;
  /** Excalidraw action name for `action`/`toggle` items dispatched via
   *  `executeAction`. Absent for tool-lock and arrow-binding (handled specially)
   *  and for `tool` items (which call `setActiveTool`). */
  actionName?: string;
  /** For generic toggles: the `appState` boolean that reflects the on-state. */
  toggleFlag?: "objectsSnapModeEnabled" | "zenModeEnabled" | "gridModeEnabled";
  /** Shown in the tooltip when present. */
  shortcut?: string;
}

/** Membership ids for the two specially-handled toggles. */
export const LOCK_ID = "lock";
export const BINDING_ID = "binding";

/** Tool items derived from the rail's TOOLS (DRY) — same ids/labels/shortcuts. */
const TOOL_ITEMS: readonly QuickItem[] = TOOLS.map((t) => ({
  id: t.id,
  label: t.label,
  kind: "tool" as const,
  group: "tool" as const,
  shortcut: t.shortcut,
}));

/** The ids of every tool item — hidden by default (tools are opt-in). */
export const TOOL_ITEM_IDS: readonly string[] = TOOL_ITEMS.map((t) => t.id);

/** Items hidden from the bar by default (opt-in via the config menu): every
 *  tool, plus the grid/zen toggles and undo/redo. Keeps the default bar focused
 *  on arrange/group/align; users can enable any of these from the hamburger. */
export const DEFAULT_HIDDEN_ITEM_IDS: readonly string[] = [
  ...TOOL_ITEM_IDS,
  "gridMode",
  "zenMode",
  "undo",
  "redo",
];

/** All quick-bar items in render order. */
export const QUICK_ITEMS: readonly QuickItem[] = [
  // Z-order
  { id: "bringToFront", label: "Bring to front", kind: "action", group: "order", actionName: "bringToFront" },
  { id: "bringForward", label: "Bring forward", kind: "action", group: "order", actionName: "bringForward" },
  { id: "sendBackward", label: "Send backward", kind: "action", group: "order", actionName: "sendBackward" },
  { id: "sendToBack", label: "Send to back", kind: "action", group: "order", actionName: "sendToBack" },
  // Grouping
  { id: "group", label: "Group", kind: "action", group: "group", actionName: "group", shortcut: "Ctrl+G" },
  { id: "ungroup", label: "Ungroup", kind: "action", group: "group", actionName: "ungroup", shortcut: "Ctrl+Shift+G" },
  // Align + distribute
  { id: "alignLeft", label: "Align left", kind: "action", group: "align", actionName: "alignLeft" },
  { id: "alignHorizontallyCentered", label: "Align center", kind: "action", group: "align", actionName: "alignHorizontallyCentered" },
  { id: "alignRight", label: "Align right", kind: "action", group: "align", actionName: "alignRight" },
  { id: "alignTop", label: "Align top", kind: "action", group: "align", actionName: "alignTop" },
  { id: "alignVerticallyCentered", label: "Align middle", kind: "action", group: "align", actionName: "alignVerticallyCentered" },
  { id: "alignBottom", label: "Align bottom", kind: "action", group: "align", actionName: "alignBottom" },
  { id: "distributeHorizontally", label: "Distribute horizontally", kind: "action", group: "align", actionName: "distributeHorizontally" },
  { id: "distributeVertically", label: "Distribute vertically", kind: "action", group: "align", actionName: "distributeVertically" },
  // Toggles
  { id: "objectsSnapMode", label: "Snap to objects", kind: "toggle", group: "toggle", actionName: "objectsSnapMode", toggleFlag: "objectsSnapModeEnabled", shortcut: "Alt+S" },
  { id: "gridMode", label: "Toggle grid", kind: "toggle", group: "toggle", actionName: "gridMode", toggleFlag: "gridModeEnabled", shortcut: "Ctrl+'" },
  { id: BINDING_ID, label: "Arrow binding", kind: "toggle", group: "toggle" },
  { id: LOCK_ID, label: "Tool lock", kind: "toggle", group: "toggle", shortcut: "Q" },
  { id: "zenMode", label: "Zen mode", kind: "toggle", group: "toggle", actionName: "zenMode", toggleFlag: "zenModeEnabled", shortcut: "Alt+Z" },
  // History
  { id: "undo", label: "Undo", kind: "action", group: "history", actionName: "undo", shortcut: "Ctrl+Z" },
  { id: "redo", label: "Redo", kind: "action", group: "history", actionName: "redo", shortcut: "Ctrl+Shift+Z" },
  // Tools (hidden by default)
  ...TOOL_ITEMS,
];

/** Look up an item by id. */
export function quickItem(id: string): QuickItem | undefined {
  return QUICK_ITEMS.find((i) => i.id === id);
}

/** Re-export for consumers that build tool actions. */
export type { ToolId };
