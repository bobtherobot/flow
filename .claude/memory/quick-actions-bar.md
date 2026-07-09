# Quick Actions Bar (horizontal, top-docked)

Flow-native horizontal quick-actions bar — the horizontal sibling of the
vertical tool rail. Docks in the top strip **to the right of the main menu**;
draggable/detachable/closeable; user-configurable (show/hide per item).
Spec: `docs/superpowers/specs/2026-07-08-quick-actions-bar-design.md`.
Branch `feat/quick-actions-bar` (built 2026-07-08). Mirrors
[[vertical-toolbar]] infra; dispatches via the [[left-panel-accordion]]
`executeAction` bridge.

## Shipped
- `src/ui/quickbar/`: `actions.ts` (QUICK_ITEMS registry — arrange/group/
  align+distribute/toggles/history/tools; tool items derive from
  `toolbar/tools.ts`), `quickbar-state.ts` (pure state; default hides all tools),
  `useQuickActions.ts` (reactive bridge, mirrors `useActiveTool`), `icons.tsx`
  (`quickIcon`; align glyphs copied from AlignPanel, tools fall through to
  `TOOL_ICONS`), `QuickButton.tsx`, `QuickbarConfigMenu.tsx` (grouped sections),
  `QuickBar.tsx`, `quickbar.css`. `src/lib/binding-mode.ts`.
- Persistence in `preferences.ts`: `get/setQuickbarState` (`flow.quickbar`),
  `get/setBindingMode` (`flow.bindingMode`).
- `App.tsx` owns `quickbar` + `bindingMode` state; mounts `<QuickBar>`; seeds
  `initialData.appState.bindingMode` (see gotcha) + re-applies via effect.
- MenuBar: View ▸ **Show Quick Actions** checkbox.
- `index.css` hides native `.undo-redo-buttons` (moved into the bar; zoom kept).

## Key facts / gotchas
- **Toggles that work zero-fork** (executeAction + read appState flag via
  onChange): snap-to-objects (`objectsSnapMode`/`objectsSnapModeEnabled`), grid
  (`gridMode`/`gridModeEnabled`), zen (`zenMode`/`zenModeEnabled`), tool lock
  (`setActiveTool({locked})`). Plus all arrange/group/align/distribute/undo/redo
  actions.
- **"Snap to midpoints" was DROPPED** — not a real feature in the pinned fork
  (Excalidraw 0.18.1); upstream added it later. Backporting needs the snapping
  engine (snapping.ts has zero midpoint concept in 0.18.1). Follow-up if wanted.
- **Arrow binding = flow's 2nd fork edit** (after `executeAction`). 0.18.1 has no
  persistent binding toggle. Added `AppState.bindingMode?: "on"|"off"|"auto"`,
  honored by the ONE selector all binding reads through: `element/binding.ts`
  `isBindingEnabled`. Also `appState.ts` default "auto" + an `APP_STATE_STORAGE_CONF`
  entry (REQUIRED — `Record<keyof AppState>` fails the build otherwise). Rebuild
  dist with `node ../../scripts/buildPackage.js` from `packages/excalidraw`
  (yarn blocked on Node 25; dist gitignored). `.d.ts` not regenerated →
  bindingMode is flow-side cast (like executeAction).
- **CRITICAL seeding gotcha**: apply `bindingMode` via `initialData.appState`, NOT
  only a post-mount effect — an effect-only apply races Excalidraw's initialData
  restore and leaves appState at "auto". Runtime-verified via `window.h.app.state`.
- **Default binding = "on" (always bind)** per the user's "always set/unset"
  request; consequence: Ctrl-to-prevent-binding no longer applies while locked on.
  "off" = never bind; unexposed "auto" = Excalidraw's Ctrl-prevent default.
- **Layout**: docked bar is transparent inside the 36px menu strip → NO canvas
  inset change (unlike the rail/panel which reserve gutters). `left` measured from
  the last `.flow-menubar__trigger` right edge + 8px.
- **e2e duplicate-name fallout**: new bar labels collide by substring — "Arrow"
  (tool) ⊂ "Arrow binding", and align labels duplicate the Align panel. Existing
  specs were scoped (tool draws → `toolbar[name=Tools]`; align asserts →
  `.flow-align-panel`). New tests scope tool checks to the Quick actions toolbar.
- Config-menu default: tools hidden (opt-in); everything else shown.

## Tests
248 unit/component (vitest) + `e2e/quickbar.spec.ts` (8). Binding lock proven by
compiled-chunk selector + runtime appState tracking (live synthetic-event binding
doesn't reproduce — harness limit, not a defect).
