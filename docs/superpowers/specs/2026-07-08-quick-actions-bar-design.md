# Quick Actions Bar — design

**Shipped 2026-07-08** on branch `feat/quick-actions-bar`. A flow-native
horizontal, draggable/detachable bar docked in the top strip to the right of the
main menu — the horizontal sibling of the vertical tool rail
(`src/ui/toolbar`).

## Contents (in order, grouped)
- **Arrange**: bring to front / forward, send backward / to back
- **Group**: group / ungroup
- **Align & distribute**: 6 align + 2 distribute
- **Toggles**: snap to objects, toggle grid, **arrow binding** (new), tool lock, zen mode
- **History**: undo / redo (moved out of Excalidraw's bottom-left cluster)
- **Tools**: the tool-rail tools — hidden by default, opt-in via the config menu

## Architecture — mirrors the tool rail almost 1:1 (`src/ui/quickbar/`)
- `actions.ts` — the item registry (`QUICK_ITEMS`), the single source of truth.
  Vendor-free; tool items derive from `toolbar/tools.ts` (DRY). Two specially
  handled toggles: `LOCK_ID` (tool lock) and `BINDING_ID` (arrow binding) carry
  no `actionName`. Generic toggles carry a `toggleFlag` naming the appState
  boolean (`objectsSnapModeEnabled` / `gridModeEnabled` / `zenModeEnabled`).
- `quickbar-state.ts` — pure `QuickbarState {visible,floating,x,y,hiddenItems}`
  + `normalize / withHiddenToggled / shouldRedock`. Default `hiddenItems` = all
  tool ids (tools opt-in). `normalize` only defaults `hiddenItems` when the field
  is **absent** — an explicit `[]` is the user's own choice.
- `useQuickActions.ts` — reactive bridge (mirrors `useActiveTool`): subscribes to
  `onChange`, exposes `isActive(item)` + `trigger(item)`. Actions/generic-toggles
  dispatch via `executeAction`; tools via `setActiveTool`; lock via
  `setActiveTool({locked})`; binding via the flow-owned `bindingMode` callback.
- `icons.tsx` — `quickIcon(id)`: hand-rolled action/toggle glyphs + align glyphs
  (copied from AlignPanel), with tool ids falling through to the rail's
  `TOOL_ICONS`. `icons.test.tsx` guards every item having a non-null icon.
- `QuickButton.tsx` / `QuickbarConfigMenu.tsx` / `QuickBar.tsx` / `quickbar.css`
  — horizontal twins of the rail's components. Config menu is grouped by section
  and reuses `.flow-pnl-config*` (+ a `.flow-pnl-config__heading`). Bar overflows
  horizontally (scroll) rather than breaking layout.

## Docking (layout option chosen: "right of the main menu")
- Docked: `position:fixed; top:0; left:<measured>; right:0; height:36px`,
  **transparent** so the menubar's surface + bottom border show through. It sits
  in the empty right region of the full-width menu strip — **no canvas inset
  change needed** (the 36px strip is already reserved by `--flow-menubar-h`).
- `left` is measured from the right edge of the last `.flow-menubar__trigger`
  (Help) + an 8px gap, re-measured on resize. Fallback 300px before paint.
- Floating: own surface (border/radius/shadow) at `{x,y}`. Tear off by dragging
  the leading handle (☰ + ✕ + ⠿ grip); re-docks when dropped with its top edge
  within 48px of the top (`shouldRedock(y)`). Drag/float is e2e-tested only
  (jsdom can't do pointer-drag + layout), same split as the rail.
- View ▸ **Show Quick Actions** checkbox mirrors View ▸ Show Toolbar. Persisted to
  `flow.quickbar`.
- Native Excalidraw undo/redo hidden via `index.css` `.undo-redo-buttons`
  (flow-level hide, zoom controls untouched) since flow surfaces them in the bar.

## Arrow-binding lock — flow's 2nd fork edit (additive)
Excalidraw 0.18.1 has **no** persistent binding toggle (the newer upstream
"Arrow binding" preference postdates the pinned fork; `isBindingEnabled` in
0.18.1 is a transient per-input flag). flow adds a persistent lock by overriding
the **one selector** every binding decision reads through:

- `element/binding.ts` `isBindingEnabled(appState)`:
  `bindingMode === "on" ? true : bindingMode === "off" ? false : appState.isBindingEnabled`.
- `types.ts` — `AppState.bindingMode?: "on" | "off" | "auto"`.
- `appState.ts` — default `"auto"` in `getDefaultAppState` **and** an
  `APP_STATE_STORAGE_CONF` entry (all-false: flow owns persistence). The CONF's
  `Record<keyof AppState, …>` **requires** the entry or the build fails.
- Rebuild: `node ../../scripts/buildPackage.js` from `packages/excalidraw`
  (yarn/`build:excalidraw` blocked on Node 25; dist is gitignored). `.d.ts` NOT
  regenerated — `bindingMode` is flow-side augmented via casts (same as
  `executeAction`).

flow side (`src/lib/binding-mode.ts`, `flow.bindingMode` pref, default **"on"**):
the mode is **seeded through `initialData.appState.bindingMode`** so the selector
honors it from init (an effect-only apply raced the initialData restore and left
it at "auto"). A `[excalidrawApi, bindingMode]` effect re-applies on every toggle.

**Default "on" = arrows always bind** (matches the user's "always set/unset"
request and Excalidraw's checked "Arrow binding" default). Consequence: holding
Ctrl no longer prevents binding while locked "on"; "off" = never bind; the
unexposed "auto" preserves Excalidraw's Ctrl-to-prevent behavior.

## Fork edits total (project): TWO — `executeAction` (earlier) + the binding
`bindingMode` selector/appState addition. Everything else is flow-level.

## Verification
- 248 unit/component tests (vitest) + 8 e2e (`e2e/quickbar.spec.ts`): dock
  position right of menu, tools-hidden default, snap toggle round-trip, binding
  on-by-default + toggle-off persists across reload, View toggle, config add-a-tool,
  tear-off floats.
- Fixed 4 pre-existing e2e broken by new duplicate accessible names: "Arrow"
  substring-collides with "Arrow binding" (scoped tool draws to the Tools
  toolbar); quickbar align buttons duplicate the Align panel's (scoped those
  assertions to `.flow-align-panel`). The style-panel undo test now resolves to
  the quickbar's Undo (native hidden) and still passes.
- Binding lock verified by: the compiled prod chunk containing the exact selector
  logic, runtime `window.h.app.state.bindingMode` tracking flow's pref
  ("on"/"off"/"auto"), and every consumer reading `isBindingEnabled(state)`.
  Live bound-arrow creation via synthetic Playwright events did not reproduce
  (binding absent even in the default case) — a harness limitation, not a defect.
