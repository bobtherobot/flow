// src/ui/toolbar/rail-layout.ts

import type { ToolbarState } from "./toolbar-state";

/** Docked toolbar width: one 36px button column plus 4px padding each side. */
export const TOOL_RAIL_WIDTH = 44;

/** Docked shapebar width: two 36px button columns plus 4px padding each side.
 *  Two columns because the shapebar holds sixteen tools (the parametric
 *  shapes landed alongside the pre-existing six), and a single column of
 *  sixteen runs off a laptop screen. */
export const SHAPE_RAIL_WIDTH = 80;

/** A rail occupies a dock slot only when it is both shown and not torn off. */
export function isRailDocked(state: ToolbarState): boolean {
  return state.visible && !state.floating;
}

/**
 * Total left gutter the canvas must inset by, in px.
 *
 * Pure so the two callers cannot drift: `ToolRails` writes it to
 * `--flow-toolbar-reserved`, and App passes the same number to the bottom bar
 * so its dock offset clears both rails.
 */
export function railGutter(toolbar: ToolbarState, shapebar: ToolbarState): number {
  return (
    (isRailDocked(toolbar) ? TOOL_RAIL_WIDTH : 0) +
    (isRailDocked(shapebar) ? SHAPE_RAIL_WIDTH : 0)
  );
}

/**
 * The shapebar's docked left edge. Slots collapse: hide or float the toolbar
 * and the docked shapebar slides to the screen edge rather than leaving a hole.
 */
export function shapebarDockLeft(toolbar: ToolbarState): number {
  return isRailDocked(toolbar) ? TOOL_RAIL_WIDTH : 0;
}
