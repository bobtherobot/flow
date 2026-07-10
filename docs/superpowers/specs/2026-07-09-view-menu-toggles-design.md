# View-Menu Toggles — Design

**Date:** 2026-07-09
**Status:** Approved (brainstorm), pending implementation plan
**Type:** flow-level UI (zero fork changes)

## Summary

Add a group of live **checkbox toggles** to the desktop menu bar's **View** menu:

- **Grid** (converts the existing plain "Toggle Grid" item into a checkbox)
- **Snap to Objects**
- **Arrow Binding**
- **Tool Lock** (keep selected tool active)
- **Zen Mode**

Each is a Radix `Menubar.CheckboxItem` whose checkmark reflects the live
application state and updates while the menu is open (including when the same
state is changed elsewhere — keyboard shortcut, bottom bar, toolbar lock).

## Goals

- One place to see and flip these five canvas toggles, consistent with the
  existing "Show Toolbar / Quick Actions / Bottom Bar" checkbox items.
- Checkmarks reflect **live** state, not a stale snapshot.
- Zero fork edits; reuse flow's existing reactive-bridge pattern.

## Non-Goals (YAGNI)

- No keyboard-shortcut hints in these menu rows (flow's bindings don't all map
  to Excalidraw's stock shortcuts; adding possibly-wrong hints is worse than
  none).
- No new persisted preferences. Grid/Snap/Zen/Tool-Lock live in Excalidraw
  appState (per-document / session); Arrow Binding already persists via the
  existing `flow.bindingMode` preference.
- No change to the bottom bar's existing grid/zen toggles.

## State Mapping

| Menu item | Read (checked) | Toggle |
|-----------|----------------|--------|
| Grid | `appState.gridModeEnabled` | `executeAction("gridMode")` |
| Snap to Objects | `appState.objectsSnapModeEnabled` | `executeAction("objectsSnapMode")` |
| Arrow Binding | `isBindingActive(bindingMode)` (App-owned) | `handleSetBindingMode(toggledBindingMode(bindingMode))` |
| Tool Lock | `appState.activeTool.locked` | `setActiveTool({ type: activeTool.type, locked: !locked })` |
| Zen Mode | `appState.zenModeEnabled` | `executeAction("zenMode")` |

Four of the five read live Excalidraw appState. Arrow Binding is flow-owned
(persisted to `flow.bindingMode`), so its toggle must route through App's
`handleSetBindingMode` (which updates state, persists, and applies via
`updateScene`) rather than a raw appState write.

## Architecture

All changes are flow-level. **No `vendor/excalidraw` edits.** The action names
(`gridMode`, `objectsSnapMode`, `zenMode`) and `activeTool.locked` are the
public/native surface already used by the bottom bar and toolbar.

### Reactive re-render scope (the key decision)

`App` intentionally does **not** re-render on Excalidraw `onChange` (its handler
only autosaves). The codebase's pattern is a per-consumer reactive bridge that
subscribes to `onChange` and forces a local re-render: `useBottomActions`
(BottomBar), `useActiveTool` (ToolBar). We follow it: `MenuBar` receives `api`
and calls a new `useViewToggles(api)` hook, so only the menu re-renders on
`onChange` — never all of `App`.

### New: `src/ui/menubar/useViewToggles.ts`

```ts
export interface ViewToggle {
  checked: boolean;
  toggle: () => void;
}
export interface ViewToggles {
  grid: ViewToggle;
  objectsSnap: ViewToggle;
  toolLock: ViewToggle;
  zenMode: ViewToggle;
}
export function useViewToggles(api: ExcalidrawAPI | null): ViewToggles;
```

- Subscribes to `api.onChange` with a `useReducer` bump (mirrors
  `useActiveTool`/`useBottomActions`).
- Reads `api?.getAppState()` each render.
- `grid`/`objectsSnap`/`zenMode`: `checked` from the appState flag; `toggle`
  dispatches `api.executeAction(<name>)`.
- `toolLock`: `checked` from `activeTool.locked`; `toggle` calls
  `api.setActiveTool({ type: activeTool.type, locked: !locked })`.
- When `api` is null: all `checked` are `false` and `toggle` is a no-op.

Arrow Binding is **not** in this hook — it stays App-owned.

### `src/ui/menubar/MenuBar.tsx`

- New props: `api: ExcalidrawAPI | null`, `isArrowBindingOn: boolean`,
  `onToggleArrowBinding: () => void`.
- Remove prop `onToggleGrid` (Grid now flows through `useViewToggles`).
- Call `const view = useViewToggles(api)` at the top of the component.
- Replace the plain "Toggle Grid" `Menubar.Item` with a checkbox group placed
  between the zoom separator and the "Show Toolbar" checkbox group, delimited by
  a separator. Order: **Grid, Snap to Objects, Arrow Binding, Tool Lock, Zen
  Mode**, each a `Menubar.CheckboxItem` using the existing
  `flow-menu__item flow-menu__item--check` classes and `ItemIndicator`.

### `src/App.tsx`

- Import `isBindingActive`, `toggledBindingMode` from `./lib/binding-mode`.
- In the `<MenuBar>` usage: add `api={excalidrawApi}`,
  `isArrowBindingOn={isBindingActive(bindingMode)}`,
  `onToggleArrowBinding={() => handleSetBindingMode(toggledBindingMode(bindingMode))}`.
- Remove `onToggleGrid={withApi(toggleGrid)}`; drop the now-unused `toggleGrid`
  import if nothing else uses it.

## Data Flow

```
Excalidraw appState ──onChange──► useViewToggles(api) [in MenuBar]
      ▲                               │ checked + toggle (grid/snap/lock/zen)
      │ executeAction / setActiveTool ▼
   MenuBar CheckboxItems ────────────┘
Arrow Binding: App bindingMode state ──props──► MenuBar checkbox
      ▲ handleSetBindingMode (state + flow.bindingMode + updateScene)
```

## Testing

- **`src/ui/menubar/useViewToggles.test.ts`** — a fake api (`getAppState`
  returning chosen flags + `activeTool`, spy `executeAction`/`setActiveTool`):
  `checked` reflects each flag; `toggle` dispatches the correct action name;
  `toolLock.toggle` calls `setActiveTool` with the flipped `locked` and the
  current tool type; null api → `checked=false`, `toggle` no-ops.
- **`src/ui/menubar/MenuBar.test.tsx`** — pass a fake api; assert the five
  `menuitemcheckbox` rows render under View, reflect `checked`, and fire the
  right handler (hook toggles for grid/snap/lock/zen via api spies;
  `onToggleArrowBinding` for Arrow Binding). Update the shared `props` object:
  drop `onToggleGrid`, add `api`, `isArrowBindingOn`, `onToggleArrowBinding`.
- **`e2e/view-toggles.spec.ts`** — open the View menu and click each item,
  asserting the live value flips via `window.h.state`:
  `gridModeEnabled`, `objectsSnapModeEnabled`, `zenModeEnabled`,
  `activeTool.locked`, and `bindingMode` (Arrow Binding: `"on"` → `"off"`).
  Read defensively (optional-chain) and use `expect.poll`, matching the
  grid-size/object-snap specs' mount-race guard.

## Rollout Notes

- Snap-to-Objects defaults ON (shipped earlier this session), so its checkbox
  starts checked. Arrow Binding defaults `"on"`, Grid/Zen/Tool-Lock default off.
- No fork rebuild required (no vendor edits).
