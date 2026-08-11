// src/ui/toolbar/rail-layout.ts

/** Docked rail width; also the horizontal gutter reserved on the left. Two
 *  columns of 40px tool buttons plus padding — the second column exists to
 *  make room for the shape tools coming later, and for the color control
 *  pinned at the bottom.
 *
 *  Lives in its own module (rather than on `ToolBar.tsx`, which is where it
 *  used to live) so `RailColorControl` can read it without importing
 *  `ToolBar` — the two used to import each other, which happened to be safe
 *  only because the constant was read inside a component body rather than at
 *  module scope, but bought nothing and was one refactor away from breaking. */
export const RAIL_WIDTH = 88;
