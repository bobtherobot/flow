# Laser pointer in the tool rail — design

**Date:** 2026-07-08
**Status:** Approved, ready for planning

## Problem

The laser pointer tool is only reachable via its keyboard shortcut (`K`). Users
who don't know the shortcut have no way to discover or select it. Add a laser
button to the flow vertical tool rail so it's selectable like every other tool.

## Context

The rail is flow-native (`src/ui/toolbar/`), built during the vertical-toolbar
work (see `docs/superpowers/specs/2026-07-08-vertical-toolbar-design.md` and
`.claude/memory/vertical-toolbar.md`). It renders a generic list:

- `tools.ts` — the `ToolId` union and the `TOOLS` array (id, label, shortcut).
- `icons.tsx` — `TOOL_ICONS`, one hand-rolled 20×20 stroked SVG per tool.
- `ToolBar.tsx` maps over `TOOLS`; `ToolButton` renders `TOOL_ICONS[id]`.
- `useActiveTool.ts` bridges to Excalidraw: `setTool(id)` calls the public
  `setActiveTool({ type: id })`, and an `onChange` subscription keeps the rail's
  active-state highlight in sync (including changes made via keyboard).
- Config-menu show/hide and `hiddenTools` persistence are driven entirely by
  `TOOLS`, so any tool added there is picked up automatically.

Excalidraw identifiers (verified against `vendor/excalidraw`):

- Tool type: `"laser"` — selected via `setActiveTool({ type: "laser" })`, the
  exact public call Excalidraw's own `LaserPointerButton` makes.
- Keyboard shortcut: `K` (plain key, no modifier).

## Design

Additive change, three files, all in `src/ui/toolbar/`. No fork edits. No changes
to state, persistence, or config-menu logic.

1. **`tools.ts`**
   - Add `"laser"` to the `ToolId` union.
   - Append `{ id: "laser", label: "Laser pointer", shortcut: "K" }` as the
     **last** entry of `TOOLS` (order: …Eraser, Frame, Laser).

2. **`icons.tsx`**
   - Add a `laser` entry to `TOOL_ICONS`: a hand-rolled 20×20 SVG in the same
     `currentColor`-stroked style as its neighbors — a pointer/pen emitting a
     small beam/spark, visually distinct from `freedraw` and `eraser`.

3. No other source changes. Selection, active-state highlight, tooltip
   (label + shortcut), config-menu visibility toggle, and `hiddenTools`
   persistence all derive from the two additions above.

## Why it's safe

- `setActiveTool({ type: "laser" })` is public API — same zero-fork-edit
  guarantee as every other rail tool.
- Selecting laser from the rail and pressing `K` both resolve to the same
  `appState.activeTool`, and the `onChange` subscription keeps the rail in sync
  regardless of which path was used.

## Testing

Follows the rail's existing unit/component split (jsdom-friendly; no drag/float
behavior is involved, so no new e2e):

- The laser button renders in the rail with its accessible label.
- Clicking it invokes `setTool("laser")`.
- The button reflects active state when `activeTool.type === "laser"`.

## Out of scope

- Changing the laser tool's behavior, colors, or trails (fork concern).
- Reordering or restyling the existing rail tools.
