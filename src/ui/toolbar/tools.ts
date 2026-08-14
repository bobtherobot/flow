import type { FlowShapeKind } from "../shapes/types";

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
  | "laser"
  | "triangle";

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
  /** For flow's parametric shapes: the geometry this tool arms. All of them
   *  activate the shared `"rectangle"` tool and differ only by this kind. */
  flowShape?: FlowShapeKind;
}

/** The toolbar's tools, rendered top-to-bottom. Everything that isn't a shape:
 *  pointers, text, freehand, line, frame, image and the two transient tools.
 *  Shortcuts mirror Excalidraw's defaults. */
export const TOOLS: readonly ToolDef[] = [
  { id: "selection", label: "Selection", shortcut: "V" },
  { id: "hand", label: "Hand (pan)", shortcut: "H" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "freedraw", label: "Draw", shortcut: "P" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "image", label: "Image", shortcut: "9" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
  { id: "laser", label: "Laser pointer", shortcut: "K" },
];

/** The shapebar's tools, rendered top-to-bottom in a two-column grid. The arrow
 *  tool is split into three shape variants (sharp / curved / elbow); all three
 *  share Excalidraw's underlying `"arrow"` tool and differ only in the
 *  `currentItemArrowType` default they set, so new arrows are drawn with that
 *  shape. Pressing `A` repeatedly cycles them (native Excalidraw behaviour),
 *  which is why curved and elbow carry no shortcut of their own. */
export const SHAPES: readonly ToolDef[] = [
  { id: "arrow", label: "Arrow", shortcut: "A", arrowType: "sharp" },
  { id: "arrow-curved", label: "Curved arrow", shortcut: "", toolType: "arrow", arrowType: "round" },
  { id: "arrow-elbow", label: "Elbow arrow", shortcut: "", toolType: "arrow", arrowType: "elbow" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "triangle", label: "Triangle", shortcut: "", toolType: "rectangle", flowShape: "triangle" },
];

/** Every tool flow surfaces, both rails. Consumers that care about the whole
 *  set rather than about one rail — the quick-actions bar's tool items — read
 *  this, so a tool moving between rails never silently drops out of them. */
export const ALL_TOOLS: readonly ToolDef[] = [...TOOLS, ...SHAPES];
