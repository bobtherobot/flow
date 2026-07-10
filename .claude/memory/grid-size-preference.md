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
  `handleChangeGridSize` runs `clampGridSize` (range + step-round) then updates
  state + persists; an effect applies it live via
  `excalidrawApi.updateScene({ appState: { gridSize } })` — **no cast**,
  since `gridSize` is already typed on Excalidraw's `AppState`;
  `initialData.appState.gridSize` seeded so first paint already uses the
  stored value (no flash of default-20 grid). Passed to `PreferencesDialog`
  as `gridSize`/`onChangeGridSize` props.
- `src/ui/PreferencesDialog.tsx`: new `.flow-num` labeled-number-input row
  (label, number `<input>`, "px" suffix). The input is bound to the shared
  **`useNumberField`** hook (`src/ui/panels/controls/`), so it **commits on
  blur/Enter, not per keystroke** (Escape reverts). New `.flow-num` /
  `.flow-num__*` CSS in `preferences-dialog.css` (reusable row pattern for
  future numeric prefs, parallel to `.flow-seg` from [[selection-mode]]).

### GOTCHA — never clamp a number input on every `onChange` (fixed a7433f0)
The row first clamped on every keystroke (`onChange` → `clampGridSize` → back
up as the controlled value). That rewrote the field mid-typing: typing "3"
clamped to the min 5, then "0" made "50" — the field "always became 50" and
users couldn't enter their value. Fix: reuse `useNumberField` (the same hook
behind the Transform-panel `NumberInput`), which keeps its own local text
state and only commits on blur/Enter. `App.handleChangeGridSize` owns the
step-round so the input's reflected value, live appState, and stored value all
agree. Rule for any flow numeric input: bind `useNumberField`, don't clamp
per keystroke.

## Tests
`src/lib/grid.test.ts` (clamp/guard boundaries), `preferences.test.ts`
round-trip (get/set, clamp-on-read, clamp-on-write, corrupt/missing storage),
`PreferencesDialog.test.tsx` RTL coverage of the new row, and
`e2e/grid-size.spec.ts` — live update (`window.h.state.gridSize` reflects a
Preferences edit without reload) + persist-across-reload.

### e2e mount-race — found and fixed (commit d6d2882)
Under full-suite 8-worker parallelism, "persists across reload" once threw
`Cannot read properties of undefined (reading 'gridSize')`: `window.h` is
created at Excalidraw module load, but its `state` getter is only added in the
App component's `componentDidMount`, which runs *after* flow's own menubar (the
`File` menuitem the test waits on) renders. So post-`page.reload()` the read
could hit `window.h.state` while still `undefined`. Fix: `readGridSize` now
optional-chains (`h?.state?.gridSize`) so it returns `undefined` instead of
throwing, and `expect.poll` keeps polling until the getter is ready. Verified
stable: reload test 13/13 pass across `--repeat-each=5` solo + `--repeat-each=3`
full-suite parallel. Lesson: waiting on flow chrome ≠ Excalidraw API ready;
poll defensively when reading `window.h.state`.

## Full suite (2026-07-09, after this feature + flake fix)
364 unit tests green. E2E green for this feature (reload race fixed above).
One **pre-existing, unrelated** failure remains in `e2e/menu-preferences.spec.ts`
("Help ▸ About shows both repo links": expects a link named `/excalidraw fork/i`,
but `AboutDialog.tsx` has rendered plain "Excalidraw" text since commit
`06e568e` — predates this branch entirely; no files this feature touched are
involved). It shows a similar solo-pass/parallel-fail signature, so it may also
be a mount-race worth a separate follow-up — but it is not caused by this branch.

Related: [[selection-mode]] (contrast — needed a fork field + cast; this
feature needed neither), [[bottom-bar]] (zero-fork-edit pattern, same as
grid-size).
