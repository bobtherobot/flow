# Search sub-panel — Design

**Date:** 2026-07-09
**Status:** Shipped

## Summary

Canvas text search moved out of Excalidraw's native sidebar into flow's own
controls dock as a **Search sub-panel** (Style·Stroke·Text·Align·**Search**·
Layers). Running search from the bottom bar — or pressing Ctrl/Cmd+F —
auto-opens and focuses the panel. The native Excalidraw search sidebar (and its
library sibling) is fully retired.

## Why

The native search sidebar renders inside the Excalidraw container and fought
flow's own right-docked panels (clipped/squeezed, hard to make reliably
visible). Owning search as a flow panel removes that conflict and makes it feel
native to flow.

## How it works

- **Fork export** `getSearchMatches(query, elements)` — a pure function
  extracted from `SearchMenu.tsx`'s internals (`getMatchedLines`,
  `getMatchPreview`, `escapeSpecialCharacters`, `normalizeWrappedText`), reusing
  Excalidraw's `measureText`/`getFontString` so highlight geometry is exact.
  Returns `{ id, index, preview, matchedLines }[]`.
- flow pushes results to `appState.searchMatches` via the public `updateScene`;
  the interactive canvas renders highlights (focused = orange, others = yellow)
  with **no Excalidraw UI**. Jump-to-match uses `api.scrollToContent`.
- The panel: search input + match count + prev/next + a clickable results list
  (preview with the matched substring emphasised).
- Coordination: App owns a transient `SearchSignal { query: string|null, nonce }`.
  The bottom-bar input bumps it with a string (adopt + run); Ctrl/Cmd+F bumps it
  with `null` (open + focus, keep query). `PanelDock` opens the Search panel when
  the nonce increments (new `openSub` dock action).

## Decisions

- **One additive fork export** (chosen over a no-fork reimplementation, which
  risked highlight geometry drift). Second fork export after `executeAction`.
- **Full results list** (vs. minimal input+nav).
- **Ctrl/Cmd+F repointed** to flow's panel via a capture-phase listener that
  pre-empts Excalidraw's own shortcut.

## Gotchas

- The fork type augmentation file (`src/excalidraw-fork.d.ts`) MUST include
  `export {}` — without it, `declare module "@excalidraw/excalidraw"` shadows the
  whole package instead of merging, breaking every other import.
- The esbuild package build does not emit `.d.ts`, hence the flow-side
  augmentation (same situation as `executeAction`).
- Rebuild the vendor dist from `packages/excalidraw` under Node 22:
  `node ../../scripts/buildPackage.js`.

## Tests

- Unit: `search-matches` wrapper (5), `SearchPanel` (5), dock `openSub` (2).
- e2e: `bottombar.spec.ts` search case (panel opens, pre-filled, native sidebar
  hidden); `panels.spec.ts` panel order includes Search.
- Runtime-verified by screenshot: two matches highlighted on canvas + the panel
  listing them.
