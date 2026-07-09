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

## Key facts
- ZERO fork edits — `setActiveTool`/`appState.activeTool` are public API.
- Reuses panel infra: `useDrag`, `clampMenuPosition`, global `.flow-pnl-config*`.
- Rail width 48px; docks left below the 36px menu bar; symmetric with the
  right-docked controls panel (`--flow-panel-reserved`).
- Drag/float/dock is e2e-tested only (jsdom can't do pointer-drag + layout) —
  same split as the panel dock. Unit/component tests cover the rest.
- Config menu: dock/undock + per-tool show/hide (incl. lock), persisted in
  `hiddenTools`.
