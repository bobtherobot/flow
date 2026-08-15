# Grid line color preference — design

**Date:** 2026-08-15
**Status:** Approved, ready for planning

## Goal

Add a global **Grid color** control to `File ▸ Preferences ▸ General`, directly
below the existing **Grid size** row, so the user can recolor the canvas grid.
The value is an app-wide preference (like grid size, laser color, and selection
mode), never a per-document property.

## Why this needs a fork edit (unlike grid size)

`gridSize` needed **zero** fork edits because it is a native `appState` field
that both the grid renderer and grid-snapping already read.

Grid *color* is not exposed at all. It is a module-level constant in the vendor
renderer — `vendor/excalidraw/packages/excalidraw/renderer/staticScene.ts:46-55`:

```ts
const GridLineColor = {
  [THEME.LIGHT]: { bold: "#dddddd", regular: "#e5e5e5" },
  [THEME.DARK]:  { bold: applyDarkModeFilter("#dddddd"),
                   regular: applyDarkModeFilter("#e5e5e5") },
} as const;
```

`strokeGrid` (same file, line 57) reads it at two `context.strokeStyle` sites —
one in the vertical-line loop (line 102-104), one in the horizontal (line
123-125). There is no `renderConfig` hook, no appState field, and no export to
override. Making the color configurable therefore requires an additive fork
field, mirroring how `laserColor`, `bindingMode`, and `selectionMode` were
threaded.

**Theme is a non-issue.** flow pins `theme="light"` (`src/App.tsx:454`), so the
dark-theme branch of `GridLineColor` is unreachable in flow and needs no
equivalent preference. The fork edit leaves the constant in place as the
fallback for any consumer that doesn't supply the new fields.

## Two line weights, one user-facing control

Excalidraw draws two kinds of grid line:

| Line     | Frequency        | Dash   | Width                        |
|----------|------------------|--------|------------------------------|
| regular  | every cell       | dashed | `min(1/zoom, 1)`             |
| bold     | every `gridStep` | solid  | `min(1/zoom, 4)`             |

The user picks **one** color. It is applied verbatim to the **regular** lines —
they are the overwhelming majority of what's on screen, so "what you picked is
what you see". The **bold** color is derived silently by lightening each channel
by **8** (`0xE5 − 0xDD`, the magnitude of Excalidraw's own two-tone gap),
clamped at `0xFF`.

**The delta direction is deliberately inverted from upstream.** Excalidraw ships
bold *darker* than regular. flow goes bold *lighter*, because a 4px solid line
reads much heavier than a 1px dashed one; lightening the heavy line evens out
the two weights' perceived contrast rather than compounding it. This was an
explicit product call, made with the upstream behavior on the table.

`gridStep` and the bold-detection logic are untouched — bold lines keep
auto-tracking the grid size, exactly as [grid size](2026-07-09-grid-size-preference-design.md)
left them.

## Default `#dddddd`

Both of today's shades stay on canvas with their roles swapped:

| | today | after |
|---|---|---|
| regular (thin, dashed) | `#e5e5e5` | `#dddddd` |
| bold (thick, solid)    | `#dddddd` | `#e5e5e5` |

Same two colors, same total ink, re-weighted per the rationale above.

## Derivation lives in flow, not the fork

flow computes **both** colors and seeds **two** appState fields, `gridColor`
(regular) and `gridColorBold`. The fork is a dumb conduit: it reads two fields
and assigns them: no flow logic crosses into `vendor/`.

The alternative — one field plus a `+8` helper inside `staticScene.ts` — saves
one field declaration per fork file but puts a flow product rule where an
upstream replay can drop it silently, and where it cannot be unit-tested. Given
[the upgrade memory's](../../../.claude/memory/excalidraw-upgrade.md)
replay-don't-merge workflow, the extra declaration is the cheaper trade.

Only `flow.gridColor` is ever persisted. `gridColorBold` is always derived at
seed/update time, so the two cannot drift out of sync.

## UI

A new row in `PreferencesDialog.tsx`, immediately after the Grid size row,
using the existing `.flow-num` row pattern:

- Label: **Grid color**
- Control: `ColorSwatch` (`src/ui/panels/controls/ColorSwatch.tsx`) — preset
  palette, OS color dialog, hex field. Hue only; no opacity control, no
  transparent option (a transparent grid is just "grid off", which the bottom
  bar already toggles).
- Identical in shape to the existing **Laser pointer** row, minus its opacity
  `NumberInput`. That row already proves `ColorSwatch` works inside this dialog
  (popover stacking, outside-click dismissal).

No new CSS: `.flow-num` / `.flow-num__label` and the `flow-ctl-color` styles are
both already imported by this dialog.

## Persistence

`src/lib/grid.ts` (the existing grid-preference module — folded in rather than a
new file, since it is the same concern and only 25 lines):

```ts
export const DEFAULT_GRID_COLOR = "#dddddd";
export const GRID_BOLD_LIGHTEN = 8;              // 0xE5 − 0xDD
export function isGridColor(value: unknown): value is string;
export function boldGridColor(hex: string): string;
```

`boldGridColor` normalizes through the existing `scrubHex`
(`src/lib/color-palettes.ts:122`) — which handles `#rgb` shorthand, strips an
`#rrggbbaa` alpha, and lowercases — then adds `GRID_BOLD_LIGHTEN` to each
channel, clamped at 255. Unparseable input returns the derived default
(`#e5e5e5`) rather than throwing, so a corrupt stored value can never blank the
grid.

`src/app/preferences.ts` gains `getGridColor` / `setGridColor` over
`flow.gridColor`, following the `getLaserColor` shape: guard on read,
try/catch around `localStorage` on both sides, default on miss or corrupt.

## Global-preference plumbing

`src/lib/flow-app-state.ts`:

- `FlowAppStatePrefs` gains `gridColor: string`.
- `flowSeedAppState` seeds **both** `gridColor` and
  `gridColorBold: boldGridColor(gridColor)`, so first paint and `File ▸ New`
  both render the preferred grid.
- `FLOW_GLOBAL_APP_STATE_KEYS` gains **both** keys, so opening a saved
  `.excalidraw` written by someone else cannot clobber the local preference.

Both additions are mandatory. The
[flow-global-appstate memory](../../../.claude/memory/flow-global-appstate.md)
records that missing either one is a silent failure — the seed omission is what
made `File ▸ New` draw 0×0 boxes.

## App wiring

`src/App.tsx`, mirroring the `selectionMode` block:

```ts
const [gridColor, setGridColorState] = useState<string>(() => getGridColor());
const handleChangeGridColor = useCallback((next: string) => {
  const color = isGridColor(next) ? next : DEFAULT_GRID_COLOR;
  setGridColorState(color);
  setGridColor(color);
}, []);
useEffect(() => {
  if (!excalidrawApi) return;
  excalidrawApi.updateScene({
    appState: { gridColor, gridColorBold: boldGridColor(gridColor) },
  } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
}, [excalidrawApi, gridColor]);
```

The cast is required because the new fields are fork additions absent from the
vendor `.d.ts` — the same reason `laserColor` and `selectionMode` cast, and
unlike `gridSize`, which does not. `appStatePrefs` gains `gridColor`.

## Fork edit (additive — 3 files)

> **SUPERSEDED during execution:** this was actually **4 files**. A 4th file,
> `packages/excalidraw/components/canvases/StaticCanvas.tsx`, needed
> `gridColor` / `gridColorBold` added to `getRelevantAppStateProps` (the
> `React.memo` comparator) — without it, an appState-only `updateScene` call
> (no other tracked prop changing) never triggers a repaint, so the new grid
> color silently fails to apply until something else forces a re-render.

1. **`packages/excalidraw/types.ts`**
   - `AppState`: `gridColor?: string;` and `gridColorBold?: string;` beside the
     existing flow fields (~line 360).
   - `StaticCanvasAppState` (line 203): pick both, beside `gridSize` / `gridStep`
     (line 210-211). This is the type the static renderer actually receives —
     omitting it here compiles on the flow side but leaves the renderer unable
     to see the fields.
2. **`packages/excalidraw/appState.ts`**
   - `getDefaultAppState` (~line 91): both fields, defaulting to the existing
     `GridLineColor` light values **in upstream's orientation**
     (`gridColor: "#e5e5e5"`, `gridColorBold: "#dddddd"`) so a non-flow consumer
     sees no change. flow's inverted pair arrives via `flowSeedAppState`, which
     overrides these — the vendor default is not flow's default and is not
     expected to match it.

     > **SUPERSEDED during execution:** ruled out as a Critical bug. Hardcoding
     > light-theme literals here makes the `??` fallback in
     > `renderer/staticScene.ts` permanently unreachable (the fields are never
     > `undefined`), which paints a near-white grid on the fork's DARK theme.
     > The shipped implementation drops these defaults entirely — `gridColor`
     > / `gridColorBold` stay `undefined` in `getDefaultAppState` so the `??`
     > in `staticScene.ts` resolves `GridLineColor[theme]` per theme, exactly
     > as it did before this feature.
   - `APP_STATE_STORAGE_CONF` (~line 233): both as
     `{ browser: false, export: false, server: false }` — persistence is
     flow-owned, matching `laserColor` / `selectionMode`.
3. **`packages/excalidraw/renderer/staticScene.ts`**
   - `strokeGrid` takes two new params, `gridColor` and `gridColorBold`.
   - Both `strokeStyle` ternaries (lines 102-104, 123-125) switch from
     `GridLineColor[theme].bold/regular` to the params.
   - The call site (line 272) passes `appState.gridColor` /
     `appState.gridColorBold`, each falling back to the existing
     `GridLineColor[renderConfig.theme]` value when undefined.

The `GridLineColor` constant stays — it becomes the fallback, which keeps the
edit additive and keeps the dark-theme branch honest for any non-flow consumer.

Requires a vendor rebuild (`npm run build:excalidraw`) before the new fields are
visible to the app.

## Testing

**Unit**
- `src/lib/grid.test.ts` — `boldGridColor`: the default case; clamping at
  near-white (`#fefefe` → `#ffffff`, no wraparound); `#rgb` shorthand;
  `#rrggbbaa` alpha stripped; garbage → the default's bold. `isGridColor`
  accept/reject.
- `src/app/preferences.test.ts` — `getGridColor`/`setGridColor` round-trip,
  missing key → default, corrupt value → default, throwing `localStorage`
  swallowed on both paths.
- `src/lib/flow-app-state.test.ts` — `flowSeedAppState` emits both fields with
  the bold one derived; `withoutFlowGlobals` strips both.
- `src/ui/PreferencesDialog.test.tsx` — the row renders with its label and
  swatch, and picking a color fires `onChangeGridColor`.

**E2E** — new `e2e/grid-color.spec.ts`:
- Live update: change the color in Preferences, assert `window.h.state.gridColor`
  and `gridColorBold` reflect it without a reload.
- Persist across reload.

Both reads must optional-chain (`h?.state?.gridColor`) inside an `expect.poll`.
The [grid-size memory](../../../.claude/memory/grid-size-preference.md) records
that `window.h.state` is populated in `componentDidMount`, *after* flow's own
menubar renders — so waiting on flow chrome does not mean the Excalidraw API is
ready, and a direct read flakes under parallel workers.

## Scope / non-goals

- No opacity control. One flat hue; the derived bold shade is invisible to the user.
- No separate bold/regular pickers.
- No dark-theme variant — flow is light-only.
- No per-document grid color.
- `gridStep` and bold-line detection unchanged.
- No change to how the grid is toggled on/off (bottom bar / View menu).

## Fork footprint

Two additive `AppState` fields, their `StaticCanvasAppState` picks, two default
entries, two storage-conf entries, and a mechanical param thread through one
render function. No new exports, no behavior change for a non-flow consumer
(every new field falls back to today's constant). Consistent with the project's
lean/additive fork strategy.
