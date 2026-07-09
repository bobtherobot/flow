# Vertical tool bar (floatable left rail)

Flow-native vertical tool rail replacing Excalidraw's top-center tool island.
Spec/plan: `docs/superpowers/specs|plans/2026-07-08-vertical-toolbar*.md`.

## Shipped
- `src/ui/toolbar/`: `tools.ts` (TOOLS/ToolId/LOCK_ID), `toolbar-state.ts` (pure
  state: normalize/withHiddenToggled/shouldRedock), `useActiveTool.ts` (onChange
  bridge → setActiveTool; types-only vendor import so NO vi.mock needed),
  `icons.tsx`, `ToolButton.tsx`, `ToolbarConfigMenu.tsx`, `ToolBar.tsx`, `toolbar.css`.
- Persistence in `src/app/preferences.ts`: `get/setToolbarState` (`flow.toolbar`).
- `App.tsx` owns `toolbar` state (so View menu reads visibility), persists via
  effect, mounts `<ToolBar>`, insets the canvas left by `--flow-toolbar-reserved`.
- MenuBar: View ▸ Show Toolbar (`Menubar.CheckboxItem`).
- Native island hidden via `index.css` `.App-toolbar-container { display:none }`.
- Arrow-shape tools added (2026-07-09): the single Arrow rail tool split into
  three — `arrow` (sharp), `arrow-curved` (round), `arrow-elbow` (elbow), grouped
  before `line`. ZERO fork edits. `ToolDef` gained optional `toolType` (all three
  map to Excalidraw's `"arrow"`) + `arrowType`. `useActiveTool.setTool(type,
  arrowType?)` sets `currentItemArrowType` via `updateScene({appState})` (public
  API, like `currentItemRoughness`) THEN `setActiveTool` — new arrows read
  `currentItemArrowType` at creation (vendor App.tsx ~L7729/7741). Rail highlight
  is composite: `activeType==="arrow" && currentItemArrowType===tool.arrowType`,
  so exactly one arrow variant lights up. Curved/elbow have NO shortcut (empty
  string; `tools.test` special-cases them); icons reuse Excalidraw's own
  arrow-type glyphs (ported from StrokePanel). Clicking a tool = deterministic
  shape; pressing `A` while arrow active CYCLES sharp→round→elbow→sharp (native
  Excalidraw, vendor App.tsx:4466) and the rail follows via `onChange`. Vendor
  default `currentItemArrowType` is `round` (appState.ts:43) — left as-is, so a
  fresh canvas highlights Curved. Stroke ▸ Type row KEPT (it converts a *selected*
  arrow via `changeArrowType`; new division: rail = new-arrow shape, panel =
  convert selection). e2e keyboard note: shortcuts are container-bound
  (`handleKeyboardGlobally` off), so tests must `canvas.interactive` click to
  focus before `keyboard.press`; and `drawWith` helpers need `{exact:true}` now
  that "Arrow" ⊂ "Curved arrow"/"Elbow arrow".
- Laser pointer added as a rail tool (2026-07-08): `"laser"` is the LAST entry
  in `TOOLS` (shortcut `K`, label "Laser pointer") + a `laser` icon in
  `TOOL_ICONS`. No other code touched — selection/highlight/config-menu/persist
  all derive from `TOOLS`. Dispatches `setActiveTool({type:"laser"})` (public
  API, zero fork edits). Spec/plan: `docs/superpowers/{specs,plans}/2026-07-08-laser-tool-rail*.md`.

## Key facts
- ZERO fork edits — `setActiveTool`/`appState.activeTool` are public API.
- Reuses panel infra: `useDrag`, `clampMenuPosition`, global `.flow-pnl-config*`.
- Rail width 48px; docks left below the 36px menu bar; symmetric with the
  right-docked controls panel (`--flow-panel-reserved`).
- Drag/float/dock is e2e-tested only (jsdom can't do pointer-drag + layout) —
  same split as the panel dock. Unit/component tests cover the rest.
- Config menu: dock/undock + per-tool show/hide (incl. lock), persisted in
  `hiddenTools`.
