# Design: Illustrator-Style Dockable Panels

**Date:** 2026-07-08
**Status:** Implemented (2026-07-08)
**Branch context:** `feat/desktop-menu-bar-preferences`

## 1. Summary

Replace Excalidraw's context-aware properties island (the left-hand "island" that
appears on selection) with an **always-visible, Adobe-Illustrator-style accordion
of dockable sub-panels**: **Style**, **Stroke**, **Text** (and a reserved **Layers**
slot). Panels are collapsible, float/dock, tear off, reorder, resize, and persist —
the docking model ported from the `draw` project (vanilla JS → React/TS).

Almost entirely **flow-level**. The one fork edit is an additive imperative-API
export (`executeAction`) used to reuse Excalidraw's action logic for operations that
can't be reimplemented from element props (z-order, group, align, arrow elbow).

## 2. Goals

- Always-visible accordion (Style / Stroke / Text) replacing the island.
- Full draw-parity docking: collapse, dock⇄float, tear-off, drag-reorder, resize,
  named layouts — persisted to `localStorage`.
- Panels edit the live selection *and* the tool defaults when nothing is selected.
- Reintroduce an **Edit** menu carrying z-order + actions.
- Introduce a **units** preference for pixel-valued controls.

## 3. Architecture

- **Island hidden** via CSS (`.excalidraw .selected-shape-actions`), no fork edit.
- **`src/lib/selection-style.ts`** — pure read/write core: common value across the
  selection (or `MIXED`), immutable `updateSelected`, text-target resolution.
- **`useSelectionStyle` hook** — subscribes to Excalidraw `onChange`; reads selection
  (fallback to `currentItem*` defaults); writes via the public `updateScene`, using
  `newElementWith` (version bump → undo history) and `captureUpdate: IMMEDIATELY`.
- **Dock engine** (`src/ui/panels/dock/`) — pure reducer `panel-dock-state.ts` +
  React shell (pointer-driven drag/dock/reorder/resize), config menu, layout manager.
- **Control primitives** (`src/ui/panels/controls/`) — `ColorSwatch`, `SliderInput`,
  `IconToggleGroup`, `FontDropdown`, all flow-native.
- The dock publishes its reserved left width as `--flow-panel-reserved`; the canvas
  insets its left edge by it so a docked panel never covers Excalidraw's controls.

## 4. Key decisions

- **Per-swatch opacity** is carried as 8-digit hex (`#rrggbbaa`) in the color string,
  because Excalidraw's element `opacity` is a single global value. The canvas honors
  alpha and `restore.ts` leaves colors untouched.
- **Undo integration** requires `newElementWith` (bumps `version`/`versionNonce`);
  raw spreads read back but are never recorded in history.
- **`executeAction` fork export** (the only fork edit): dispatch a registered action
  by name (z-order, group, align, `changeArrowType`) with correct perform + history.
  Reused by the Edit menu and the Stroke panel's arrow-type (incl. elbow routing).
- **Font list** from the public `FONT_FAMILY` constant — no registry export needed.
- Arrow type sharp/round/**elbow** all dispatch `changeArrowType` (elbow needs
  Excalidraw's `App`/`LinearElementEditor`, so it can't be done from props alone).

## 5. Preferences

New **units** setting (px / pt / mm / cm / in; px canonical at 96 DPI,
`src/lib/units.ts`) surfaced in Preferences ▸ General; drives the stroke-width field.

## 6. Testing

Pure logic, control primitives, and the hook are unit-tested (Vitest/RTL). The dock,
panels, and end-to-end scene mutations are covered by Playwright e2e (`e2e/panels`,
`style-panel`, `stroke-panel`, `text-panel`, `edit-actions`) — including canvas
pixel/screenshot checks of opacity, elbow routing, and undo.

## 7. Follow-ups

- **Layers panel** — reserved slot; port from `draw` when the feature lands.
- Regenerate the vendor `.d.ts` (currently the `executeAction` type is augmented on
  flow's side) when a compatible Node/yarn toolchain is available.
