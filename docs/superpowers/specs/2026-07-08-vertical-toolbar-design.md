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

## Approach

A **flow-native vertical tool rail**, not a repositioning of Excalidraw's own DOM.
This mirrors exactly how flow already replaced the context-aware *properties*
island (see `.claude/memory/left-panel-accordion.md`): hide the native widget with
a CSS rule, and drive the same scene through the public imperative API.

- The tool bar lives in flow's React tree, so tear-off/drag/close reuse flow's
  existing panel infrastructure (`useDrag`) and render on-brand.
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
  its grab handle; it re-docks when the handle is dropped near the left edge.

## Components

All under `src/ui/toolbar/` (feature-organized, small focused files):

| File | Responsibility |
|------|----------------|
| `tools.ts` | Pure data. Ordered `TOOLS` list mirroring the native toolbar: selection, hand, rectangle, diamond, ellipse, arrow, line, freedraw, text, image, eraser, frame — each `{ type, label, shortcut }`. Plus the `lock` toggle descriptor. No React. |
| `toolbar-state.ts` | Pure `getToolbarState()` / `setToolbarState(next)` over the `flow.toolbar` localStorage key `{ visible, floating, x, y }`. Follows the existing `getUnits`/`setUnits` pattern. Defaults: `{ visible: true, floating: false, x: 0, y: 0 }`. |
| `useActiveTool.ts` | Hook subscribing to `api.onChange` (same shape as `useSelectionStyle`). Exposes `{ activeType, locked, setTool(type), toggleLock() }`, backed by `api.setActiveTool`. Re-renders the rail as the active tool changes (including via keyboard). |
| `ToolButton.tsx` | One icon button. Active/pressed state from `activeType` / `locked`. Hand-rolled inline SVG icons (the AlignPanel/TextPanel convention — keeps icons fork-independent). |
| `ToolBar.tsx` | The rail. Grab handle + close (✕) + the tool button column, with `lock` pinned at the bottom. Docked vs floating driven by `toolbar-state`. Reuses `useDrag` (`src/ui/panels/dock/useDrag.ts`) for tear-off; dropping the handle near the left edge re-docks (mirrors PanelShell's tear-off threshold, minus resize). |
| `toolbar.css` | `--flow-*` tokens, matching `panels.css`. |

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
- **Detach / drag** — dragging the grab handle tears the rail off into a
  free-floating strip that follows the cursor and drops anywhere. Dragging the
  handle back near the left edge re-docks it. Orientation stays vertical in both
  states.
- **Close** — the ✕ button hides the rail. Reopen via View ▸ Show Toolbar.
- **Persistence** — visibility and float position (`{ visible, floating, x, y }`)
  persist to `flow.toolbar` and restore across reload.

## Testing

- **Unit**
  - `tools.ts` — tool list integrity (expected types, order, lock present).
  - `toolbar-state.ts` — get/set round-trip, defaults when key absent, tolerant of
    malformed JSON.
  - `useActiveTool.ts` — with a mocked api: `setTool` calls `setActiveTool`,
    `toggleLock` flips `locked`, `activeType` tracks `appState.activeTool`. Must
    `vi.mock("@excalidraw/excalidraw")` (same jsdom gotcha as
    `useSelectionStyle.test.tsx`).
- **Component (RTL)** — `ToolBar`: renders all tool buttons, click dispatches
  `setActiveTool`, active highlight follows `activeType`, lock toggles, ✕ hides.
- **E2E** (`e2e/toolbar.spec.ts`) — rail renders on the left; select rectangle then
  draw → a shape appears; **View ▸ Show Toolbar** toggles visibility and the state
  persists across reload; tear-off floats the rail. Honors the project e2e gotchas
  (fresh context per test, no `addInitScript` localStorage clearing).

## Fork footprint

**ZERO fork edits.** Everything is flow-level: a CSS hide, flow-native React
components, and public-API tool dispatch.

## Out of scope

- Reordering tools or a customizable tool set (mirror the native set for now).
- Horizontal orientation when floating (stays vertical).
- Making the rail a first-class member of the right-side accordion dock.
