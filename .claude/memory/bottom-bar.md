# Bottom bar (horizontal, bottom-left docked)

Flow-native horizontal bottom bar — sibling of the [[quick-actions-bar]] on the
bottom-left. Grid/zen toggles, zoom cluster, canvas-background swatch, inline
search. Draggable/detachable/closeable; per-item show/hide; View ▸ Show Bottom
Bar. Spec: `docs/superpowers/specs/2026-07-08-bottom-bar-design.md`. Shipped
2026-07-08. Mirrors quickbar infra; dispatches via `executeAction`.

## Shipped
- `src/ui/bottombar/`: `bottombar-state.ts` (pure state; `shouldRedock` keyed to
  the BOTTOM edge), `items.ts` (BOTTOM_ITEMS: gridMode/zenMode/zoom/background/
  search, `kind` drives which control renders), `useBottomActions.ts` (reactive
  bridge — reads grid/zen/zoomPct/viewBackgroundColor via onChange bump),
  `icons.tsx`, `BottomButton.tsx`, `ZoomControl.tsx` (− {pct}% +; % resets),
  `BackgroundControl.tsx` (wraps `ColorSwatch`), `SearchControl.tsx` (input
  type=search + magnify), `BottombarConfigMenu.tsx` (opens UPWARD), `BottomBar.tsx`,
  `bottombar.css`.
- `src/lib/search-bridge.ts`: `openSearch(api,q)` + `pushQueryIntoSearchInput` —
  opens native search (`executeAction("searchMenu")`) and pushes the query into
  Excalidraw's controlled input via the prototype value setter + dispatched
  `input` event, rAF-retried (MAX_FRAMES=30) until the sidebar mounts.
- Persistence: `preferences.ts` `get/setBottombarState` (`flow.bottombar`).
- `App.tsx` owns `bottombar` state; mounts `<BottomBar>`; MenuBar View ▸ Show
  Bottom Bar.
- `index.css`: hides native `.App-menu_bottom` (zoom relocated); and the
  library-hide rule now scoped with `:has()` (see gotcha).

## Key facts / gotchas
- **ZERO fork edits.** Toggles via `executeAction("gridMode"|"zenMode")`; zoom
  via `src/lib/view-actions.ts`; background via
  `executeAction("changeViewBackgroundColor", { viewBackgroundColor })` — value
  must be an OBJECT (the action spreads `value` into appState), not a bare string.
- **`overflow-x:auto` clips popovers** — it forces overflow-y to clip too,
  swallowing the ColorSwatch popover. Bar uses `overflow: visible` + hugs content.
  The ColorSwatch popover is flipped upward inside the bar
  (`.flow-bottombar .flow-ctl-color__popover { top:auto; bottom:calc(100%+6px) }`).
- **Search shares the default sidebar with the (hidden) library.** flow hid
  `.default-sidebar` wholesale to kill the library; search renders there too.
  Fixed: `.default-sidebar:not(:has(.layer-ui__search-inputWrapper))` hides only
  when NOT search. Library trigger button still hidden outright.
- **Docked search sidebar was effectively invisible** (clipped by the
  excalidraw container's `overflow:hidden` + squeezed between canvas and flow's
  right panel). Fix: pin it as a FIXED overlay when showing search —
  `.default-sidebar:has(.layer-ui__search-inputWrapper){ position:fixed; top:var(--flow-menubar-h); right:var(--flow-panel-reserved); bottom:0; z-index:150 }`
  so it sits just left of flow's controls panel, never clipped. Verified by screenshot.
- **Library TAB (in the search sidebar's tab strip) hidden** via the stable Radix
  suffix selector `.sidebar-tab-trigger[aria-controls$="-content-library"]` (the
  id prefix is auto-generated). Only the search tab remains.
- **Dock-left clears the tool rail** by reading `--flow-toolbar-reserved`
  (published by ToolBar on documentElement); re-measured on resize + visibility.
- Redock fires when a dropped floating bar's bottom edge is within 48px of the
  viewport bottom (opposite edge vs quickbar's top-edge redock).
- Native footer `.App-menu_bottom` fully hidden — its exit-zen button is covered
  by the bar's zen toggle (stays visible in zen; flow chrome is outside `.excalidraw`).

## Tests
17 e2e-relevant + unit: `bottombar-state.test.ts`, `useBottomActions.test.tsx`,
`controls.test.tsx`, `src/lib/search-bridge.test.ts`, `e2e/bottombar.spec.ts` (10).
Full suite after: 280 unit + 51 e2e green.
