# View-menu toggles (five live checkboxes)

The desktop menu bar's View menu gained five live `Menubar.CheckboxItem`
toggles — **Grid, Snap to Objects, Arrow Binding, Tool Lock, Zen Mode** — that
reflect and drive canvas state directly, instead of the old plain "Toggle
Grid" one-shot item. Shipped 2026-07-09. **Zero fork edits.** Sibling of
[[bottom-bar]] and [[quick-actions-bar]] (both already have grid/zen/snap/
arrow-binding controls in their own bars); this puts the same controls in the
File-menu-style desktop menu, reusing [[vertical-toolbar]]'s tool-lock idea and
[[selection-mode]]'s Preferences-dialog precedent for flow-level-only state.

## Shipped
- `src/ui/menubar/useViewToggles.ts`: reactive-bridge hook, mirrors
  `useBottomActions`/`useActiveTool`. Subscribes to `api.onChange(() =>
  bump())` (a `useReducer` counter) so the menu re-renders on any state change
  — keyboard shortcuts, other bars, etc. — not just its own clicks. Reads
  `api.getAppState()` fresh every render (no cached state). Returns a
  `ViewToggles` object: `{ grid, objectsSnap, toolLock, zenMode }`, each a
  `{ checked, toggle }` pair.
  - `grid`/`objectsSnap`/`zenMode` toggle via
    `api.executeAction("gridMode" | "objectsSnapMode" | "zenMode")`.
  - `toolLock` toggles via
    `api.setActiveTool({ type: activeTool.type, locked: !locked })` (cast at
    one boundary, same pattern noted in the hook's own comment: "our partial
    is a subset of the discriminated union arg, so cast here — mirrors
    useActiveTool").
  - `api === null` → every toggle degrades to a no-op (`NOOP`), so the menu
    renders safely before Excalidraw mounts.
- `src/ui/menubar/MenuBar.tsx`: now takes an **`api: ExcalidrawAPI | null`**
  prop and calls `useViewToggles(api)` itself. This is the key design
  decision: re-renders from the `onChange` bump are scoped to `MenuBar`
  alone — **`App` never re-renders on `onChange`** just to keep the View-menu
  checkmarks in sync. Same isolation strategy as `useBottomActions` /
  `useActiveTool` (bottom bar / tool rail own their own reactive slice instead
  of lifting state into `App`).
- Arrow Binding stays **App-owned**, not routed through the hook: `MenuBar`
  takes `isArrowBindingOn` / `onToggleArrowBinding` props, and `App.tsx` wires
  them from the existing `bindingMode` fork field —
  `isArrowBindingOn={isBindingActive(bindingMode)}`,
  `onToggleArrowBinding={() => handleSetBindingMode(toggledBindingMode(bindingMode))}`.
  This mirrors how [[quick-actions-bar]]'s arrow-binding lock is wired, and
  keeps `bindingMode` (a fork appState field) as the single source of truth
  rather than duplicating it into the new hook.
- The old plain "Toggle Grid" menu item became the **Grid** checkbox; the
  prior `onToggleGrid` prop / `toggleGrid` handler were removed entirely (grid
  now flows through `useViewToggles` like Snap/Zen).
- Checkbox order in the menu: Grid, Snap to Objects, Arrow Binding, Tool Lock,
  Zen Mode (separator, then Show Toolbar / other View-menu items below,
  unchanged).

## Key facts / gotchas
- **Zero fork edits** — everything routes through the public
  `executeAction`/`setActiveTool`/`getAppState`/`onChange` API surface,
  same as [[bottom-bar]].
- **Re-render scoping is the point of the hook.** Before this, any live
  menu checkbox would have needed `App` to subscribe to `onChange` (which it
  deliberately does not, to avoid re-rendering the whole app tree on every
  canvas interaction). Pushing the subscription down into `MenuBar` via the
  `api` prop keeps that invariant intact while still getting live checkmarks.
- `objectsSnapModeEnabled` now **defaults to `true`** in this app (seeded via
  `initialData.appState` in `src/App.tsx`, commit `41df312`, landed just
  before this feature's commits) — Excalidraw itself ships it `false`. This
  predates the View-menu-toggles work and is unrelated to it, but it left
  `e2e/quickbar.spec.ts`'s "toggling snap-to-objects reflects the active state
  and persists" test asserting the old (now-wrong) default; see Tests below.

## Tests
- Unit: `useViewToggles.test.ts` (onChange reactivity, `executeAction`/
  `setActiveTool` dispatch, `api === null` no-op), `MenuBar.test.tsx` (17
  tests — checkbox checked-state per flag, click dispatches, order).
- e2e: `e2e/view-toggles.spec.ts` (5 — Grid/Snap/Zen/Tool-Lock/Arrow-Binding,
  each opens View, clicks the `menuitemcheckbox`, and polls the live
  `window.h.state` value).
- Full suite after this task: **377 unit tests / 51 files, all green.**
  e2e: 81 total, 79 green. Two pre-existing, unrelated failures (not caused
  by this feature, confirmed via git-blame + isolated re-run):
  1. `e2e/menu-preferences.spec.ts` "Help ▸ About shows both repo links" —
     broke in commit `06e568e` (About link text renamed to "Excalidraw"
     without updating the `/excalidraw fork/i` assertion).
  2. `e2e/quickbar.spec.ts` "toggling snap-to-objects reflects the active
     state and persists" — broke in commit `41df312` ("enable
     object-snapping by default"), which predates this feature's commits;
     the test still asserts the pre-`41df312` default of `false`.
  A third failure (`e2e/edit-actions.spec.ts` "arrow elbow applies via the
  executeAction fork export") appeared once on a full run and passed on
  every isolated re-run — confirmed flaky, not a regression.
