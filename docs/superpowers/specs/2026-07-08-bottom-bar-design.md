# Bottom Bar — Design

**Date:** 2026-07-08
**Status:** Shipped

## Summary

A flow-native horizontal **bottom bar**, docked bottom-left — a sibling of the
quick-actions bar (`src/ui/quickbar`) built on the same dockable infra. It
gathers view/canvas controls that previously lived in Excalidraw's native
bottom-left footer plus two new ones:

- **Grid toggle** — `gridMode` via `executeAction` (zero-fork)
- **Zen mode toggle** — `zenMode` via `executeAction` (zero-fork)
- **Zoom controls** — `−  {pct}%  +`; the `%` resets to 100%. Excalidraw's
  native footer zoom is hidden and relocated here.
- **Canvas background** — reuses the `ColorSwatch` primitive, bound to
  `appState.viewBackgroundColor` via `changeViewBackgroundColor`
- **Search** — inline input + magnify; on execute, opens Excalidraw's native
  search sidebar pre-filled with the query (reuses all match highlighting/nav)

Dockable/floatable, closeable, show/hide from **View ▸ Show Bottom Bar**, and
per-item configurable from the hamburger menu — identical UX to the tool rail
and quick-actions bar.

## Decisions

- **Dock model:** bottom-left strip (own floating-style pill; clears the left
  tool rail by reading `--flow-toolbar-reserved`). Does not reserve a canvas
  gutter (like the quickbar), so no canvas inset change.
- **Search:** inline input that **drives the native search** rather than
  reimplementing it. The bridge (`src/lib/search-bridge.ts`) opens the sidebar
  and pushes the query into Excalidraw's controlled input via the prototype
  value setter + a dispatched `input` event, rAF-retried until it mounts.
- **Fork footprint: ZERO.** Everything routes through the public API + the
  existing `executeAction` export + a DOM bridge for search + CSS.

## Notable gotchas

- **`overflow-x: auto` clips popovers.** A scroll container forces
  `overflow-y` to clip too, swallowing the ColorSwatch popover. The bar uses
  `overflow: visible` and hugs its compact content instead.
- **Search shares the default sidebar with the (hidden) library.** flow hid
  `.default-sidebar` wholesale to remove the library; the canvas search renders
  in that same sidebar. Fixed by scoping the hide with `:has()`:
  `.default-sidebar:not(:has(.layer-ui__search-inputWrapper))` — search shows,
  library stays hidden. The library trigger button stays hidden outright.
- **Native footer hidden via `.App-menu_bottom`** (whole footer): zoom moved to
  the bar, undo/redo already in the quickbar, help icon already hidden. The
  footer's exit-zen button goes too, but the bar's zen toggle (visible in zen
  mode, being outside the Excalidraw tree) covers exiting.
- Config menu opens **upward** (bar is at the bottom): the menu subtracts its
  measured height from the anchor before clamping.

## Tests

- Unit/component (vitest): `bottombar-state` reducer, `useBottomActions` bridge,
  `search-bridge`, and the zoom/search controls.
- e2e (`e2e/bottombar.spec.ts`): docked render, grid toggle, zoom +/reset,
  background swatch, search → visible native sidebar, View toggle + persist,
  config hide + persist, tear-off float, native footer hidden.
