# Marquee selection mode (touch vs enclose)

A **Select** segmented control in File ▸ Preferences (General) —
`Select: [marquee touch] [marquee enclose]` — chooses how drag-selection picks
elements. Shipped 2026-07-09. Radio semantics (role="radiogroup" + role="radio"
buttons), touch listed first per the UI spec; **default = enclose** (preserves
Excalidraw's stock behavior).

- **enclose**: select only elements the marquee rectangle fully contains (Excalidraw default).
- **touch**: select any element the marquee rectangle intersects (AABB overlap).

## Fork change (additive — 3rd appState fork field; mirrors bindingMode/laserColor)
Submodule `vendor/excalidraw` branch `flow`:
- `types.ts`: `AppState.selectionMode?: "enclose" | "touch"`.
- `appState.ts`: default `selectionMode: "enclose"` in getDefaultAppState +
  storage-conf `{ browser:false, export:false, server:false }` (flow owns persistence).
- `scene/selection.ts`: `getElementsWithinSelection` gained a 5th param
  `selectionMode: "enclose" | "touch" = "enclose"`. "touch" swaps the containment
  test for an AABB-intersection test. **Default keeps enclose**, so the OTHER caller
  (`frame.ts` frame-membership) is unaffected — only the marquee passes the mode.
- `components/App.tsx` (~line 8719, the "regular box-select" branch): passes
  `this.state.selectionMode` as the 5th arg.

## Rebuild gotcha (IMPORTANT — cost me time)
- Run the package build from **`vendor/excalidraw/packages/excalidraw`** (entry points
  are relative): `node ../../scripts/buildPackage.js`. Running it from the submodule
  root fails ("entry point index.tsx cannot be marked as external").
- **Do NOT `rm -rf dist` without regenerating types.** `build:esm` does
  `rm -rf dist && buildPackage.js && yarn gen:types`; yarn is blocked on Node 25, so
  buildPackage.js alone leaves `dist/` with **no `.d.ts`** → flow's tsc can't resolve
  `@excalidraw/excalidraw` (types live at `dist/types/excalidraw/`). Regenerate them by
  running tsc directly: from `packages/excalidraw`, `node_modules/.bin/tsc -p tsconfig.json`
  (emits `.d.ts` to `dist/types/` even though it prints pre-existing upstream type errors
  — cornerRadius/Point noise, not from our edit). buildPackage.js does NOT emit types.

## flow side
- `src/lib/selection-mode.ts`: `SelectionMode = "touch" | "enclose"`,
  `DEFAULT_SELECTION_MODE="enclose"`, `SELECTION_MODE_ORDER=["touch","enclose"]`,
  `SELECTION_MODE_LABELS`, `isSelectionMode`.
- `src/app/preferences.ts`: `get/setSelectionMode` over `flow.selectionMode`.
- `src/App.tsx`: state + handler + effect + `initialData.appState.selectionMode` seed —
  cloned from the bindingMode block. Not in vendor `.d.ts`, so updateScene arg is cast
  (same as bindingMode/laserColor).
- `src/ui/PreferencesDialog.tsx`: the `.flow-seg` segmented control (new reusable CSS
  in preferences-dialog.css: `.flow-seg` / `.flow-seg__btn` with `aria-checked`).
- Tests: `selection-mode.test.ts`, preferences round-trip, PreferencesDialog RTL,
  and **`e2e/selection-mode.spec.ts`** — draws a rect, marquees only its corner, and
  asserts the Transform panel's Width field enables (selected) in touch but not enclose;
  a full-enclosure marquee selects in both (sanity). Width field = the selection signal
  (`getByRole("spinbutton",{name:"Width",exact:true})`; plain "Width" also matches the
  Stroke-width sliders).

## NOT yet committed
Vendor source edits live in the `vendor/excalidraw` working tree on branch `flow` —
**uncommitted**. dist is gitignored, so the fork edit is only durable once the submodule
`flow` branch is committed AND the parent gitlink is bumped. See [[left-panel-accordion]]
for the executeAction fork-export precedent and [[laser-color]] for the appState-field pattern.
