/** The Excalidraw tool types flow surfaces in the rail (subset of the fork's
 *  ToolType). Kept as a local union so the module stays free of vendor imports. */
export type ToolId =
  | "selection"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "frame"
  | "laser";

export interface ToolDef {
  id: ToolId;
  /** Accessible name + tooltip. */
  label: string;
  /** Excalidraw's keyboard shortcut, shown in the tooltip. */
  shortcut: string;
}

/** The rail's tools, in Excalidraw's native left-to-right order (rendered
 *  top-to-bottom). Shortcuts mirror Excalidraw's defaults. */
export const TOOLS: readonly ToolDef[] = [
  { id: "selection", label: "Selection", shortcut: "V" },
  { id: "hand", label: "Hand (pan)", shortcut: "H" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "freedraw", label: "Draw", shortcut: "P" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "image", label: "Image", shortcut: "9" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "laser", label: "Laser pointer", shortcut: "K" },
];

/** Membership key for the lock toggle within `hiddenTools` (lock is not a
 *  drawing tool, so it is not part of `ToolId`). */
export const LOCK_ID = "lock";
