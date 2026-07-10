# Grid size preference

A global **Grid size** number input (px) in File ▸ Preferences (General),
below the **Select** control — `flow.gridSize`, range **5–100, step 5, default
20**. Shipped 2026-07-09.

## Zero fork edits
Unlike [[selection-mode]] (3rd appState fork field + `updateScene` cast),
`gridSize` is a **native** Excalidraw `appState` field already — no
`vendor/excalidraw` change, no cast needed anywhere in the App.tsx apply path.
It controls **both** the visible grid render **and** the grid-snap increment
(both read `appState.gridSize`); `gridStep` (bold-gridline-every-N logic) is
left at Excalidraw's default so bold gridlines keep auto-tracking the grid
size.

## Shipped
- `src/lib/grid.ts`: `MIN_GRID_SIZE=5`, `MAX_GRID_SIZE=100`,
  `GRID_SIZE_STEP=5`, `DEFAULT_GRID_SIZE=20`; `clampGridSize` (clamp to
  range, round to nearest step, NaN/non-finite → default); `isGridSize` type
  guard for persisted values.
- `src/app/preferences.ts`: `get/setGridSize` over `flow.gridSize`
  (localStorage). Read path: missing/non-numeric/out-of-range → default;
  in-range → `clampGridSize`-normalized. Write path always clamps before
  persisting.
- `src/App.tsx`: `gridSize` state seeded from `getGridSize()`;
  `handleChangeGridSize` updates state + persists; an effect applies it live
  via `excalidrawApi.updateScene({ appState: { gridSize } })` — **no cast**,
  since `gridSize` is already typed on Excalidraw's `AppState`;
  `initialData.appState.gridSize` seeded so first paint already uses the
  stored value (no flash of default-20 grid). Passed to `PreferencesDialog`
  as `gridSize`/`onChangeGridSize` props.
- `src/ui/PreferencesDialog.tsx`: new `.flow-num` labeled-number-input row
  (label, number `<input>`, "px" suffix) — `onChange` clamps via
  `clampGridSize` before calling back up. New `.flow-num` / `.flow-num__*`
  CSS in `preferences-dialog.css` (reusable row pattern for future numeric
  prefs, parallel to `.flow-seg` from [[selection-mode]]).

## Tests
`src/lib/grid.test.ts` (clamp/guard boundaries), `preferences.test.ts`
round-trip (get/set, clamp-on-read, clamp-on-write, corrupt/missing storage),
`PreferencesDialog.test.tsx` RTL coverage of the new row, and
`e2e/grid-size.spec.ts` — live update (`window.h.state.gridSize` reflects a
Preferences edit without reload) + persist-across-reload.

### e2e flake note (not a regression)
Under full-suite 8-worker parallelism, "persists across reload" occasionally
throws `Cannot read properties of undefined (reading 'gridSize')` from
`window.h` being read immediately post-`page.reload()` before Excalidraw's API
attaches to `window.h` — a mount-race, same family as the comment already in
the spec about waiting for the File menu before touching `window.h` (that
guard exists before the read, but doesn't guarantee `window.h` itself is
attached under heavy CPU contention). Reproduced once in a full 75-test /
8-worker run; passed 10/10 in isolated re-runs (3 solo + `--repeat-each=5`).
Not caused by app logic — the value was correct in every run that read it
successfully.

## Full suite (2026-07-09, after this feature)
364 unit tests green. E2E: 73/75 green — the 2 failures are (1) the flake
above, confirmed non-reproducing in isolation, and (2) a **pre-existing,
unrelated** failure in `e2e/menu-preferences.spec.ts` ("Help ▸ About shows
both repo links": expects a link named `/excalidraw fork/i`, but
`AboutDialog.tsx` has rendered plain "Excalidraw" text since commit
`06e568e` — predates this branch entirely, no files this feature touched are
involved).

Related: [[selection-mode]] (contrast — needed a fork field + cast; this
feature needed neither), [[bottom-bar]] (zero-fork-edit pattern, same as
grid-size).
