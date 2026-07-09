# Laser color in the Color panel — design

**Date:** 2026-07-09
**Status:** Approved, ready for planning

## Goal

Add a "Laser" color control to the Color sub-panel, alongside Fill / Stroke /
Text, so the user can set the laser-pointer trail color (with opacity). The
value is a **global** tool preference (like the arrow-binding lock), not a
per-document property.

## Why laser is different from Fill / Stroke / Text

Fill / Stroke / Text are per-element properties (`backgroundColor` /
`strokeColor`) edited via `ColorRow` against the current selection, falling back
to the `currentItem*` defaults when nothing is selected.

The laser trail is **not an element**:

- There is no `appState` field for the local trail color — the local trail's
  fill is hardcoded to `DEFAULT_LASER_COLOR = "red"` in
  `vendor/.../laser-trails.ts:25`. The only existing laser-color plumbing is
  `collaborator.pointer.laserColor` (remote collaborators).
- There is nothing in a selection to target, so the Laser row is **always** a
  global default — never per-element, never greyed.

Making the local trail color configurable therefore requires a small additive
fork edit. This mirrors the existing `bindingMode` fork field, which is also a
global tool preference owned by flow.

## Alpha support (why the opacity slider is included)

The trail color is applied as a raw SVG `fill` presentation attribute
(`animated-trail.ts:129-132`: `trailElement.setAttribute("fill", options.fill(this))`)
with no normalization between flow's value and the DOM. SVG `fill` accepts full
CSS Color syntax (`rgba(...)`, 8-digit `#rrggbbaa`) in every evergreen browser
Excalidraw targets, so alpha is honored. The trail's time/length decay only
thins the stroke geometry; it does not touch fill, so an alpha channel composes
cleanly.

Because the existing `ColorRow` already produces 8-digit `#rrggbbaa` via
`combineColorAlpha`, the Laser row can be visually identical to the other rows,
opacity slider included.

## UI (flow-side)

A fourth row in `ColorPanel.tsx`, label "Laser":

- Reuse the existing `ColorRow` (`ColorSwatch` + opacity `SliderInput`).
- `ids={{}}` (empty): `readFormValue` with empty ids returns the fallback, and
  `setProp`/`update` with empty ids touch no elements — so the row reads and
  writes purely the global value.
- `fallbackColor={appState.laserColor ?? DEFAULT_LASER_HEX}`.
- No `allowTransparent` (a transparent laser is pointless); no `disabled` logic.

## Write path (persist + live update)

`ColorRow` gains one optional prop:

```ts
onWrite?: (color: string) => void;
```

When provided, it replaces the internal `sel.setProp(...)` call inside
`ColorRow`'s `write` helper. All swatch/alpha/combine logic stays shared — no
duplication. Fill / Stroke / Text rows omit the prop and behave exactly as
today.

The Laser row wires `onWrite` to a new `App` handler:

```ts
const handleChangeLaserColor = useCallback((color: string) => {
  setLaserColor(color);                                  // localStorage flow.laserColor
  apiRef.current?.updateScene({ appState: { laserColor: color } });  // live recolor
}, []);
```

`updateScene` mutates the running `app.state.laserColor`, and the trail's fill
closure re-reads it each frame, so the pointer recolors instantly.

## Persistence (flow-owned, mirrors `bindingMode`)

New module `src/lib/laser-color.ts`:

```ts
export const DEFAULT_LASER_HEX = "#ff0000"; // hex form of the fork's "red" default
export function getLaserColor(): string;    // localStorage["flow.laserColor"] ?? DEFAULT_LASER_HEX
export function setLaserColor(color: string): void;
```

`DEFAULT_LASER_HEX` is hex (not the named `"red"`) so `splitColorAlpha` /
`ColorSwatch` handle it. Seeded into `initialData.appState.laserColor` in
`App.tsx`, alongside the existing `bindingMode` seed.

## Fork edit (additive — 4 touch-points, 3 files)

Mirrors how `bindingMode` was threaded:

1. `types.ts` — add `laserColor?: string;` to the `AppState` interface.
2. `appState.ts` `getDefaultAppState` — `laserColor: DEFAULT_LASER_COLOR`.
3. `appState.ts` storage conf — `laserColor: { browser: false, export: false, server: false }`
   (persistence owned by flow).
4. `laser-trails.ts:25` — change
   `fill: () => DEFAULT_LASER_COLOR`
   to
   `fill: () => this.app.state.laserColor || DEFAULT_LASER_COLOR`.

Requires a fork rebuild: `node scripts/buildPackage.js` (yarn/tsc are
Node-25-blocked per the panel memory; the `.d.ts` is not regenerated, so the
flow side keeps its type augmentation for the new field if needed).

The collaborator trail path (`collaborator.pointer?.laserColor || getClientColor(...)`)
is left unchanged — only the local trail is made configurable.

## Testing

- **Unit:** `laser-color.test.ts` — get/set/default round-trip over a mocked
  `localStorage`. Extend `ColorPanel` RTL coverage to assert the Laser row
  renders and that `onWrite` fires with the combined 8-digit hex (swatch hue +
  opacity).
- **e2e:** extend `color-panel.spec.ts` (or a new spec) — set a laser color,
  activate the laser tool, drag across the canvas, and pixel-sample the trail to
  prove the chosen color (with alpha) renders. Reuses the canvas-sampling
  pattern already used for the opacity-blend test.

## Scope / non-goals

- No change to collaborator trail coloring.
- Not per-document; global only.
- No new UI primitive — `ColorRow` is reused with one optional prop.

## Fork footprint

Adds one additive `AppState` field + a one-line read in `laser-trails.ts`,
consistent with the project's lean/additive fork strategy. No new exports.
