# Laser color (global, in File ▸ Preferences)

A **Laser pointer** row in Preferences ▸ General (below Grid size) sets the
laser-pointer trail color + opacity. Shipped 2026-07-09 (merged to `main`,
commit `e67ce0c`). Spec/plan: `docs/superpowers/specs|plans/2026-07-09-laser-color*`.

**Moved 2026-08-07** out of the Color sub-panel into Preferences — a global
preference belongs with the other globals, not with the per-element color rows.
The move retired `ColorRow`'s `onWrite` hatch (see below); Preferences now
composes `ColorSwatch` + `NumberInput` directly against `splitColorAlpha` /
`combineColorAlpha`, with `laserColor` + `onChangeLaserColor` props from `App`.

## Why it's different from Fill/Stroke/Text
Those are per-element props (`backgroundColor`/`strokeColor`) edited against the
selection. The laser trail is **not an element** — 0.18.1 hardcoded the local
trail fill to `DEFAULT_LASER_COLOR = "red"`. So the Laser row is **always a
global default** (never targets a selection, never greyed). It's a flow-owned
preference, mirroring the `bindingMode` pattern (see [[left-panel-accordion]]).

## Fork change (additive — mirrors bindingMode; 2nd appState fork field)
Submodule `vendor/excalidraw` branch `flow`, commit `4a6fdc77`:
- `types.ts`: `AppState.laserColor?: string`.
- `appState.ts`: default `laserColor: DEFAULT_LASER_COLOR` in getDefaultAppState +
  storage-conf `{ browser:false, export:false, server:false }` (flow owns persistence).
- `laser-trails.ts:25`: local trail fill `() => this.app.state.laserColor || DEFAULT_LASER_COLOR`
  (closure re-reads each frame → recolors live). Collaborator trail path untouched.
- Rebuild: `node scripts/buildPackage.js`. Parent gitlink bumped separately (`68d104c`).

## flow side
- `PreferencesDialog` owns the row (`.flow-prefs__laser`). It imports
  `panels/panels.css` for the shared `.flow-ctl-*` control styles so the dialog does
  not depend on the panels being mounted, and forces the picker popover **upward**
  (`bottom: calc(100% + 6px)`) because `.flow-dialog` is `overflow: clip` and a
  downward popover off the last field would be cut off.
- HISTORICAL: `ColorRow` used to carry an `onWrite?: (color:string)=>void` hatch
  (plus `ids={{}}`) so the laser row could be always-global inside the Color panel.
  Removed with the 2026-08-07 move — if a future always-global color row is wanted
  in a panel, that hatch is the pattern to reinstate.
- `src/lib/laser-color.ts`: `DEFAULT_LASER_HEX="#ff0000"` (hex form of fork's "red";
  splitColorAlpha needs hex), `isLaserColor` (3/6/8-digit). `preferences.ts`:
  `get/setLaserColor` over `flow.laserColor`.
- `App.tsx`: `laserColor` state + `handleChangeLaserColor` (setLaserColor + updateScene)
  + effect on `[excalidrawApi, laserColor]` + `initialData.appState.laserColor` seed —
  all cloned from the `bindingMode` block. `laserColor` isn't in the vendor `.d.ts`, so
  reads/writes use localized casts (same as bindingMode).
- Opacity works because SVG `fill` honors 8-digit hex/rgba in evergreen browsers;
  `combineColorAlpha` already produces `#rrggbbaa`. Trail decay thins geometry, not fill.

## Tests
`laser-color.test.ts`, `preferences.test.ts` (persistence), `PreferencesDialog.test.tsx`
(swatch/opacity reflect the current color; preset pick preserves opacity; opacity
change fires the combined hex). `ColorPanel.test.tsx` asserts the Laser row is *gone*.
e2e `laser-color.spec.ts`: swatch round-trip through File ▸ Preferences (surviving a
dialog close/reopen) + live trail render (`.SVGLayer svg path` fill == chosen color,
asserted mid-drag).

## Gotchas
- e2e depends on the locally-rebuilt gitignored dist — CI must `buildPackage.js` first.
- RTL: the picker's presets come from the seeded **Pastel** palette in jsdom (no
  localStorage fixture), so unit tests must pick a Pastel hex, not a Vibrant one.
  The e2e specs pin their own palette via `pinPresets`.
- Deferred minors (safe): setLaserColor no write-time validation; e2e first-path
  selector assumes a single trail path (true today).
