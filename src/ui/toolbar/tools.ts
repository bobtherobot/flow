/** The Excalidraw tool types flow surfaces in the rail (subset of the fork's
 *  ToolType). Kept as a local union so the module stays free of vendor imports. */
export type ToolId =
  | "selection"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "arrow-curved"
  | "arrow-elbow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "frame"
  | "laser";

/** New-arrow shape an arrow-variant rail tool applies (Excalidraw's ARROW_TYPE
 *  values). */
export type ArrowType = "sharp" | "round" | "elbow";

export interface ToolDef {
  id: ToolId;
  /** Accessible name + tooltip. */
  label: string;
  /** Excalidraw's keyboard shortcut, shown in the tooltip. Empty when the tool
   *  has no dedicated shortcut (the curved/elbow arrows cycle via `A`). */
  shortcut: string;
  /** Excalidraw `activeTool.type` this maps to; defaults to `id`. The three
   *  arrow variants all map to `"arrow"`, differing only by `arrowType`. */
  toolType?: ToolId;
  /** For arrow variants: the `currentItemArrowType` default this tool sets so
   *  new arrows are drawn with that shape. */
  arrowType?: ArrowType;
}

/** The rail's tools, in Excalidraw's native left-to-right order (rendered
 *  top-to-bottom). Shortcuts mirror Excalidraw's defaults. The arrow tool is
 *  split into three shape variants (sharp / curved / elbow); all share the
 *  underlying `"arrow"` tool and set the new-arrow default when selected.
 *  Pressing `A` repeatedly cycles them (native Excalidraw behaviour). */
export const TOOLS: readonly ToolDef[] = [
  { id: "selection", label: "Selection", shortcut: "V" },
  { id: "hand", label: "Hand (pan)", shortcut: "H" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "arrow", label: "Arrow", shortcut: "A", arrowType: "sharp" },
  { id: "arrow-curved", label: "Curved arrow", shortcut: "", toolType: "arrow", arrowType: "round" },
  { id: "arrow-elbow", label: "Elbow arrow", shortcut: "", toolType: "arrow", arrowType: "elbow" },
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
