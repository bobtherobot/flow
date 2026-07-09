# Vertical Tool Bar (floatable left rail) — Design

**Date:** 2026-07-08
**Status:** Approved, pending implementation plan

## Problem

Excalidraw's tool picker is a horizontal floating island pinned to the top-center
of the canvas. flow wants it as a **vertical bar docked to the left edge** of the
screen (Illustrator/Figma layout), leaving the existing controls panel on the
right. Like the controls panel, the tool bar must be **detachable** — the user can
tear it off and drag it around as a free-floating strip — and **closeable**, with
visibility controlled from **Main menu ▸ View ▸ Show Toolbar**.

It must also be **configurable** like the controls panel: a hamburger (≡) button
on the rail opens a dropdown menu that lets the user **dock/undock** the rail and
**show/hide individual tools** via a checkbox list. This mirrors the controls
panel's `PanelConfigMenu` (dock/detach + per-sub-panel visibility).

## Approach

A **flow-native vertical tool rail**, not a repositioning of Excalidraw's own DOM.
This mirrors exactly how flow already replaced the context-aware *properties*
island (see `.claude/memory/left-panel-accordion.md`): hide the native widget with
a CSS rule, and drive the same scene through the public imperative API.

- The tool bar lives in flow's React tree, so tear-off/drag/close and the config
  menu reuse flow's existing panel infrastructure (`useDrag`, `clampMenuPosition`)
  and render on-brand.
- **Zero fork edits.** `setActiveTool` and `appState.activeTool` are already on the
  public `ExcalidrawImperativeAPI` (`vendor/excalidraw/.../types.ts:686`). No new
  export is needed — consistent with the flow fork strategy (rule #1: public API +
  flow code, not a fork change).

Rejected alternatives:
- *Reposition Excalidraw's native island via CSS + a drag wrapper* — the island
  lives inside Excalidraw's DOM; moving it into flow's tree for tear-off is brittle.
- *Full dock-engine integration (Tools as a panel in a generalized left-side
  PanelDock)* — forces a fixed-width icon rail into the resizable-accordion
  abstraction (poor fit) and is substantially more work than the content warrants.

## Layout

```
┌────────────────────────────────────────┐
│  File  Edit  View  Help                 │   ← 36px menu bar
├──┬──────────────────────────────┬───────┤
│▚ │                              │ Style │
│▚ │           canvas             │ Stroke│
│▚ │                              │ Text  │
│▚ │                              │ Align │
└──┴──────────────────────────────┴───────┘
 tool rail (left)              controls (right)
```

- Docked: the rail is `position: fixed`, flush to the left edge, top-aligned below
  the menu bar. Symmetric with the right-docked controls panel.
- Floating: the rail is absolutely positioned at a persisted `(x, y)`, dragged by
  its top bar; it re-docks when the top bar is dropped near the left edge (or via
  the config menu's Float/Dock toggle).

## Components

All under `src/ui/toolbar/` (feature-organized, small focused files):

| File | Responsibility |
|------|----------------|
| `tools.ts` | Pure data. Ordered `TOOLS` list mirroring the native toolbar: selection, hand, rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, frame — each `{ type, label, shortcut }`. Plus the `lock` toggle descriptor. No React. |
| `toolbar-state.ts` | Pure `getToolbarState()` / `setToolbarState(next)` over the `flow.toolbar` localStorage key `{ visible, floating, x, y, hiddenTools }`. Follows the existing `getUnits`/`setUnits` pattern. Defaults: `{ visible: true, floating: false, x: 0, y: 0, hiddenTools: [] }`. `hiddenTools` is the list of tool `type`s the user has hidden from the rail. |
| `useActiveTool.ts` | Hook subscribing to `api.onChange` (same shape as `useSelectionStyle`). Exposes `{ activeType, locked, setTool(type), toggleLock() }`, backed by `api.setActiveTool`. Re-renders the rail as the active tool changes (including via keyboard). |
| `ToolButton.tsx` | One icon button. Active/pressed state from `activeType` / `locked`. Hand-rolled inline SVG icons (the AlignPanel/TextPanel convention — keeps icons fork-independent). |
| `ToolbarConfigMenu.tsx` | The hamburger dropdown. A **Float / Dock** toggle, a divider, then a checkbox list of every tool (including `lock`) driving `hiddenTools`. Anchored under the ≡ button and self-clamps into the viewport via the shared `clampMenuPosition` (`src/ui/panels/dock/menu-position.ts`) measured in a `useLayoutEffect` — the exact pattern `PanelConfigMenu` uses. |
| `ToolBar.tsx` | The rail. A top bar (hamburger ≡ + close ✕) that doubles as the drag surface, then the tool button column with `lock` pinned at the bottom. Renders only tools whose `type` is not in `hiddenTools`. Docked vs floating driven by `toolbar-state`. Reuses `useDrag` (`src/ui/panels/dock/useDrag.ts`) for tear-off; dropping the top bar near the left edge re-docks (mirrors PanelShell's tear-off threshold, minus resize). |
| `toolbar.css` | `--flow-*` tokens, matching `panels.css`; reuses the `.flow-pnl__menu*` dropdown aesthetic for the config menu. |

### Tool order & orientation

Vertical, top-to-bottom in the native left-to-right order: selection, hand,
rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, frame.
The `lock` toggle is pinned at the bottom of the rail, visually separated.

## Integration

- **App.tsx** — mount `<ToolBar api={excalidrawApi} />` beside `<Excalidraw>` /
  `<PanelsRoot>`. App owns `showToolbar` state (seeded from `flow.toolbar`) and
  passes `isToolbarVisible` + `onToggleToolbar` down to `MenuBar`.
- **MenuBar.tsx** — the **View** menu gains a "Show Toolbar" checkbox item,
  mirroring the existing `onToggleGrid` wiring (`isToolbarVisible` +
  `onToggleToolbar` props).
- **index.css** — hide the native island:
  `.excalidraw .App-toolbar-container { display: none }`. This is the same
  graceful, no-fork hide pattern already used for `.selected-shape-actions`,
  `.dropdown-menu-button`, `.default-sidebar`, etc. The island's DOM
  (`.shapes-section` → `.App-toolbar-container` → `.App-toolbar`, per
  `LayerUI.tsx:253`) is separate from the hamburger, so the menu is unaffected.
  **Accepted side effect:** this also removes Excalidraw's `HintViewer` hint text
  and the pen/lock buttons that live inside the island. flow already strips this
  chrome; `lock` is re-surfaced in the rail.
- **Canvas inset** — when docked, the rail publishes `--flow-toolbar-reserved`
  (rail width; `0px` when floating or hidden). App extends the Excalidraw-wrapper
  inset on the **left** by it — symmetric with the existing right-side
  `--flow-panel-reserved`. This keeps Excalidraw's bottom-left zoom/undo/redo
  controls clear of the docked rail.

## Behavior

- **Select a tool** — click → `api.setActiveTool({ type })`. The `image` tool
  auto-opens the OS file dialog (Excalidraw's `onImageAction`). No special-casing
  needed in flow.
- **Lock** — toggles `activeTool.locked` via
  `setActiveTool({ type: activeType, locked: !locked })`. When locked, the selected
  tool stays active after drawing (native behavior).
- **Active state** — the highlighted button and lock-pressed state are read
  reactively from `appState.activeTool` through the `onChange` subscription.
- **Keyboard shortcuts** — continue to work natively at the canvas level (r, o, a,
  …). The rail reflects the resulting tool change through the subscription; flow
  does not re-implement shortcut handling.
- **Detach / drag** — dragging the top bar tears the rail off into a
  free-floating strip that follows the cursor and drops anywhere. Dragging it back
  near the left edge re-docks it. Orientation stays vertical in both states.
- **Config menu (hamburger ≡)** — opens `ToolbarConfigMenu`:
  - **Float / Dock** — toggles `floating` (same effect as drag tear-off / re-dock),
    so docking is reachable without dragging.
  - **Per-tool checkboxes** — one row per tool (and `lock`); unchecking adds the
    tool `type` to `hiddenTools` and removes its button from the rail, checking
    restores it. Changes are immediate and persisted.
- **Close** — the ✕ button hides the rail. Reopen via View ▸ Show Toolbar.
- **Persistence** — visibility, float position, and the hidden-tool set
  (`{ visible, floating, x, y, hiddenTools }`) persist to `flow.toolbar` and
  restore across reload.

## Testing

- **Unit**
  - `tools.ts` — tool list integrity (expected types, order, lock present).
  - `toolbar-state.ts` — get/set round-trip (incl. `hiddenTools`), defaults when
    key absent, tolerant of malformed JSON.
  - `useActiveTool.ts` — with a mocked api: `setTool` calls `setActiveTool`,
    `toggleLock` flips `locked`, `activeType` tracks `appState.activeTool`. Must
    `vi.mock("@excalidraw/excalidraw")` (same jsdom gotcha as
    `useSelectionStyle.test.tsx`).
- **Component (RTL)**
  - `ToolBar`: renders visible tool buttons, click dispatches `setActiveTool`,
    active highlight follows `activeType`, lock toggles, ✕ hides; a tool in
    `hiddenTools` is not rendered.
  - `ToolbarConfigMenu`: Float/Dock toggles `floating`, unchecking a tool calls the
    hide callback, the menu self-clamps (position from `clampMenuPosition`).
- **E2E** (`e2e/toolbar.spec.ts`) — rail renders on the left; select rectangle then
  draw → a shape appears; **View ▸ Show Toolbar** toggles visibility and persists
  across reload; tear-off floats the rail; the hamburger hides a tool and the
  choice persists across reload. Honors the project e2e gotchas (fresh context per
  test, no `addInitScript` localStorage clearing).

## Fork footprint

**ZERO fork edits.** Everything is flow-level: a CSS hide, flow-native React
components, and public-API tool dispatch.

## Out of scope

- **Reordering** tools within the rail (show/hide is in scope; drag-to-reorder is
  not).
- Horizontal orientation when floating (stays vertical).
- Making the rail a first-class member of the right-side accordion dock.
- Per-tool config beyond visibility (e.g. custom groupings, saved tool presets).
