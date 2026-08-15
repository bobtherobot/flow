# Grid Line Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global **Grid color** preference to `File ▸ Preferences ▸ General`, directly below **Grid size**, recoloring the canvas grid app-wide.

**Architecture:** The user picks one color. It is applied verbatim to the thin/regular grid lines; the bold every-Nth-cell lines are derived by lightening each channel by 8 (clamped at `0xFF`). The derivation lives in flow (`src/lib/grid.ts`, unit-tested) and flow seeds **two** appState fields — `gridColor` and `gridColorBold` — so the `vendor/excalidraw` fork stays a mechanical conduit with no flow logic in it. Only `flow.gridColor` is persisted; the bold value is always derived, so they cannot drift.

**Tech Stack:** React 19 + TypeScript, Vitest + React Testing Library (unit), Playwright (e2e). Excalidraw fork consumed as `@excalidraw/excalidraw` (git submodule at `vendor/excalidraw`).

**Spec:** [docs/superpowers/specs/2026-08-15-grid-line-color-design.md](../specs/2026-08-15-grid-line-color-design.md)

## Global Constraints

- **Default grid color `#dddddd`** (the thin/regular lines). Derived bold = `#e5e5e5`.
- **Bold is LIGHTER than regular by exactly 8 per channel.** This is deliberately inverted from upstream Excalidraw, which ships bold *darker*. Do not "fix" it to match upstream.
- **One user-facing control.** No opacity, no separate bold picker, no transparent option, no dark-theme variant (flow pins `theme="light"`).
- **`gridStep` and bold-line detection are untouched.** Bold lines keep auto-tracking the grid size.
- **Storage key `flow.gridColor`**, canonical `#rrggbb` lowercase.
- **Fork edits must be additive.** The existing `GridLineColor` constant stays as the fallback so a non-flow consumer sees no change.
- **New global prefs go in BOTH `flowSeedAppState` and `FLOW_GLOBAL_APP_STATE_KEYS`** (`src/lib/flow-app-state.ts`). Missing either is a known silent failure in this codebase.
- Immutable updates, explicit types on exported functions, no `console.log`.

---

### Task 1: `grid.ts` — color constants, guard, and the bold derivation

**Files:**
- Modify: `src/lib/grid.ts` (append; existing size exports untouched)
- Test: `src/lib/grid.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `scrubHex` from `src/lib/color-palettes.ts` (line 122) — normalizes `#rgb` shorthand, strips an `#rrggbbaa` alpha, lowercases, returns `string | null`. `color-palettes.ts` has zero imports of its own, so this adds no dependency weight.
- Produces:
  - `DEFAULT_GRID_COLOR = "#dddddd"` (`string`)
  - `GRID_BOLD_LIGHTEN = 8` (`number`)
  - `isGridColor(value: unknown): value is string`
  - `boldGridColor(hex: string): string`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/grid.test.ts`:

```ts
import { DEFAULT_GRID_COLOR, isGridColor, boldGridColor } from "./grid";

describe("boldGridColor", () => {
  it("lightens each channel by 8 from the default", () => {
    // #dd = 221, +8 = 229 = #e5 — flow's bold lines are LIGHTER than the thin
    // ones, deliberately inverting upstream Excalidraw.
    expect(boldGridColor(DEFAULT_GRID_COLOR)).toBe("#e5e5e5");
  });

  it("lightens each channel independently", () => {
    expect(boldGridColor("#001020")).toBe("#081828");
  });

  it("clamps at ff instead of wrapping around", () => {
    expect(boldGridColor("#fefefe")).toBe("#ffffff");
    expect(boldGridColor("#ffffff")).toBe("#ffffff");
  });

  it("accepts #rgb shorthand", () => {
    // #abc expands to #aabbcc; aa+8=b2, bb+8=c3, cc+8=d4
    expect(boldGridColor("#abc")).toBe("#b2c3d4");
  });

  it("strips an alpha channel", () => {
    expect(boldGridColor("#dddddd80")).toBe("#e5e5e5");
  });

  it("uppercase input returns lowercase output", () => {
    expect(boldGridColor("#DDDDDD")).toBe("#e5e5e5");
  });

  it("returns the derived default for unparseable input", () => {
    expect(boldGridColor("banana")).toBe("#e5e5e5");
    expect(boldGridColor("")).toBe("#e5e5e5");
  });
});

describe("isGridColor", () => {
  it("accepts 3-, 6-, and 8-digit hex", () => {
    expect(isGridColor("#abc")).toBe(true);
    expect(isGridColor("#dddddd")).toBe(true);
    expect(isGridColor("#ddddddff")).toBe(true);
  });

  it("rejects non-hex and non-strings", () => {
    expect(isGridColor("dddddd")).toBe(false);
    expect(isGridColor("#gggggg")).toBe(false);
    expect(isGridColor("banana")).toBe(false);
    expect(isGridColor(null)).toBe(false);
    expect(isGridColor(20)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/grid.test.ts`
Expected: FAIL — `boldGridColor is not a function` / `DEFAULT_GRID_COLOR` undefined.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/grid.ts`:

```ts
import { scrubHex } from "./color-palettes";

/** flow's persistent grid *color* preference. Written into `appState.gridColor`
 *  (the thin, dashed regular lines); the bold every-`gridStep` lines get
 *  `boldGridColor` of it. Bold is LIGHTER than regular here — deliberately the
 *  inverse of upstream Excalidraw, whose bold is darker. A 4px solid line reads
 *  far heavier than a 1px dashed one, so lightening it evens out the two
 *  weights' perceived contrast instead of compounding it. */
export const DEFAULT_GRID_COLOR = "#dddddd";

/** Per-channel lightening applied to the bold lines. 8 is the magnitude of
 *  Excalidraw's own two-tone gap (0xE5 − 0xDD), reused so the derived pair keeps
 *  the separation upstream tuned by eye. */
export const GRID_BOLD_LIGHTEN = 8;

const GRID_HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Type guard for an unknown persisted value (a hex color string). */
export function isGridColor(value: unknown): value is string {
  return typeof value === "string" && GRID_HEX.test(value);
}

/** The bold-gridline color derived from the user's chosen (regular) color:
 *  each channel lightened by `GRID_BOLD_LIGHTEN`, clamped at 255. Unparseable
 *  input yields the default's bold shade rather than throwing, so a corrupt
 *  stored value can never blank the grid. */
export function boldGridColor(hex: string): string {
  const base = scrubHex(hex) ?? DEFAULT_GRID_COLOR;
  const packed = Number.parseInt(base.slice(1), 16);
  const lighten = (channel: number) =>
    Math.min(255, channel + GRID_BOLD_LIGHTEN)
      .toString(16)
      .padStart(2, "0");
  return `#${lighten((packed >> 16) & 0xff)}${lighten((packed >> 8) & 0xff)}${lighten(
    packed & 0xff,
  )}`;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/grid.test.ts`
Expected: PASS — all `boldGridColor` / `isGridColor` cases plus the pre-existing `clampGridSize` / `isGridSize` suites.

- [ ] **Step 5: Commit**

```bash
git add src/lib/grid.ts src/lib/grid.test.ts
git commit -m "feat(grid): add grid color constants and the bold-shade derivation"
```

---

### Task 2: Persist the preference

**Files:**
- Modify: `src/app/preferences.ts` (add after the `setLaserColor` block, ~line 224)
- Test: `src/app/preferences.test.ts` (append a new `describe` block; extend the import list at the top)

**Interfaces:**
- Consumes: `DEFAULT_GRID_COLOR`, `isGridColor` from Task 1.
- Produces: `getGridColor(): string`, `setGridColor(color: string): void` over the `flow.gridColor` key.

- [ ] **Step 1: Write the failing test**

Add `getGridColor, setGridColor,` to the existing import block at the top of `src/app/preferences.test.ts` (alongside `getGridSize, setGridSize,`), add `import { DEFAULT_GRID_COLOR } from "../lib/grid";`, then append:

```ts
describe("grid color persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default when unset", () => {
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });

  it("round-trips a valid value", () => {
    setGridColor("#3366aa");
    expect(getGridColor()).toBe("#3366aa");
  });

  it("falls back to the default on a corrupt stored value", () => {
    localStorage.setItem("flow.gridColor", "banana");
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });

  it("normalizes a valid non-canonical value on write", () => {
    setGridColor("#ABC");
    expect(getGridColor()).toBe("#aabbcc");
  });

  it("ignores an invalid value on write rather than storing it", () => {
    setGridColor("nope");
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getGridColor is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/app/preferences.ts`, extend the existing grid import:

```ts
import {
  clampGridSize,
  isGridSize,
  DEFAULT_GRID_SIZE,
  DEFAULT_GRID_COLOR,
  isGridColor,
} from "../lib/grid";
```

`scrubHex` is already imported from `../lib/color-palettes` on the following line — no change needed there.

Then add after the `setLaserColor` function:

```ts
const GRID_COLOR_KEY = "flow.gridColor";

/** Read the app-wide grid-line color (default on miss/corrupt). */
export function getGridColor(): string {
  try {
    const raw = localStorage.getItem(GRID_COLOR_KEY);
    return isGridColor(raw) ? (scrubHex(raw) ?? DEFAULT_GRID_COLOR) : DEFAULT_GRID_COLOR;
  } catch {
    return DEFAULT_GRID_COLOR;
  }
}

/** Persist the app-wide grid-line color, normalized to canonical `#rrggbb`.
 *  An unparseable value is dropped rather than stored, so a bad write can never
 *  poison the next read. */
export function setGridColor(color: string): void {
  const hex = isGridColor(color) ? scrubHex(color) : null;
  if (!hex) return;
  try {
    localStorage.setItem(GRID_COLOR_KEY, hex);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat(prefs): persist the grid color under flow.gridColor"
```

---

### Task 3: Seed it as a flow-owned global appState value

**Files:**
- Modify: `src/lib/flow-app-state.ts`
- Test: `src/lib/flow-app-state.test.ts`

**Interfaces:**
- Consumes: `boldGridColor` from Task 1.
- Produces: `FlowAppStatePrefs` gains `gridColor: string`; `flowSeedAppState` emits `gridColor` **and** `gridColorBold`; `FLOW_GLOBAL_APP_STATE_KEYS` gains both keys.

Both the seed and the key list are mandatory. `File ▸ New` calls `resetScene()`, which replaces appState wholesale — a global the seed forgets silently reverts. A global missing from the key list gets clobbered by whatever an opened `.excalidraw` carries.

- [ ] **Step 1: Write the failing test**

In `src/lib/flow-app-state.test.ts`, add `gridColor: "#dddddd",` to the `PREFS` const, then extend the first assertion and append a new test:

```ts
// inside "carries every app-wide preference through to appState"
expect(flowSeedAppState({ ...PREFS })).toMatchObject({
  currentItemRoughness: 0,
  bindingMode: "on",
  laserColor: "#ff0000",
  selectionMode: "enclose",
  gridSize: 20,
  gridColor: "#dddddd",
  gridColorBold: "#e5e5e5",
});
```

```ts
it("derives the bold gridline color rather than taking it as a preference", () => {
  // Only gridColor is persisted; the bold shade is always computed, so the two
  // cannot drift out of sync.
  const seed = flowSeedAppState({ ...PREFS, gridColor: "#001020" }) as Record<
    string,
    unknown
  >;

  expect(seed.gridColor).toBe("#001020");
  expect(seed.gridColorBold).toBe("#081828");
});

it("treats both grid colors as flow globals, so an opened document cannot override them", () => {
  const stripped = withoutFlowGlobals({
    gridColor: "#ff0000",
    gridColorBold: "#ff0808",
    viewBackgroundColor: "#ffffff",
  });

  expect(stripped).not.toHaveProperty("gridColor");
  expect(stripped).not.toHaveProperty("gridColorBold");
  expect(stripped).toHaveProperty("viewBackgroundColor", "#ffffff");
});
```

The pre-existing "covers every flow-owned global key" test then automatically enforces that both new keys are in the seed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/flow-app-state.test.ts`
Expected: FAIL — `gridColor` missing from the seed; `withoutFlowGlobals` leaves both keys in place.

- [ ] **Step 3: Write the implementation**

In `src/lib/flow-app-state.ts`, add the import:

```ts
import { boldGridColor } from "./grid";
```

Add to the interface:

```ts
export interface FlowAppStatePrefs {
  sloppiness: Sloppiness;
  bindingMode: BindingMode;
  laserColor: string;
  selectionMode: SelectionMode;
  gridSize: number;
  gridColor: string;
}
```

Destructure `gridColor` in the `flowSeedAppState` parameter list, and add after the existing `gridSize` seed line:

```ts
    // Seed the grid colors at init (fork fields; same race rationale as
    // bindingMode). Only gridColor is a stored preference — the bold shade is
    // always derived here so the pair can never drift.
    gridColor,
    gridColorBold: boldGridColor(gridColor),
```

Add both keys to the globals list:

```ts
export const FLOW_GLOBAL_APP_STATE_KEYS = [
  "bindingMode",
  "laserColor",
  "selectionMode",
  "gridSize",
  "gridColor",
  "gridColorBold",
  "currentItemFlowShape",
] as const;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/flow-app-state.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/flow-app-state.ts src/lib/flow-app-state.test.ts
git commit -m "feat(prefs): seed grid colors as flow-owned global appState"
```

---

### Task 4: Fork edit — thread the two colors into the grid renderer

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/types.ts` (~line 360 and line 203-219)
- Modify: `vendor/excalidraw/packages/excalidraw/appState.ts` (~line 91 and ~line 235)
- Modify: `vendor/excalidraw/packages/excalidraw/renderer/staticScene.ts` (lines 57-69, 102-104, 123-125, 272-282)

> **SUPERSEDED during execution:** this ended up as **4 files**, not 3. A 4th
> file, `packages/excalidraw/components/canvases/StaticCanvas.tsx`, needed
> `gridColor` / `gridColorBold` added to `getRelevantAppStateProps` (the
> `React.memo` comparator) — otherwise an appState-only `updateScene` call
> never triggers a repaint and the color change silently doesn't apply.

**Interfaces:**
- Consumes: nothing from earlier tasks (the fork holds no flow logic).
- Produces: `appState.gridColor` and `appState.gridColorBold`, both `string | undefined`, honored by the static grid renderer. Task 6 writes them via `updateScene`.

This is the only task touching `vendor/`. Keep it purely mechanical — **no derivation logic in the fork.** Every new field falls back to the existing `GridLineColor` constant so a non-flow consumer is unaffected.

- [ ] **Step 1: Add the AppState fields**

In `vendor/excalidraw/packages/excalidraw/types.ts`, after the `selectionMode` field (~line 364):

```ts
  /** flow addition: canvas grid line colors. `gridColor` paints the thin,
   *  dashed regular lines; `gridColorBold` the solid every-`gridStep` lines.
   *  Both undefined = Excalidraw's built-in two-tone constant. */
  gridColor?: string;
  gridColorBold?: string;
```

- [ ] **Step 2: Pick both into `StaticCanvasAppState`**

Still in `types.ts`, in the `StaticCanvasAppState` type (line 203), beside `gridSize` / `gridStep` (lines 210-211):

```ts
    gridSize: AppState["gridSize"];
    gridStep: AppState["gridStep"];
    gridColor: AppState["gridColor"]; // flow
    gridColorBold: AppState["gridColorBold"]; // flow
```

This is the type the static renderer actually receives. Omitting it here still compiles on the flow side but leaves `renderStaticScene` unable to see the fields.

- [ ] **Step 3: Add defaults and storage config**

In `vendor/excalidraw/packages/excalidraw/appState.ts`, after the `selectionMode` default (~line 92):

```ts
    gridColor: "#e5e5e5", // flow: thin gridline color (upstream regular shade)
    gridColorBold: "#dddddd", // flow: bold gridline color (upstream bold shade)
```

Note these are **upstream's orientation** (bold darker) so a non-flow consumer sees no change. flow's inverted pair arrives via `flowSeedAppState` and overrides them — the vendor default is not flow's default and is not meant to match it.

> **SUPERSEDED during execution:** ruled out as a Critical bug. These literals
> make the `??` fallback in `renderer/staticScene.ts` permanently unreachable
> (the fields would never be `undefined`), which paints a near-white grid on
> the fork's DARK theme. The shipped implementation drops these defaults
> entirely — `gridColor` / `gridColorBold` stay `undefined` in
> `getDefaultAppState`, so `??` resolves `GridLineColor[theme]` per theme, same
> as before this feature.

After the `selectionMode` storage entry (~line 235):

```ts
  // flow: persistence owned by flow (localStorage flow.gridColor), re-applied on load.
  gridColor: { browser: false, export: false, server: false },
  gridColorBold: { browser: false, export: false, server: false },
```

- [ ] **Step 4: Thread the colors through `strokeGrid`**

In `vendor/excalidraw/packages/excalidraw/renderer/staticScene.ts`, add two params to the `strokeGrid` signature (after `theme`, before `width`):

```ts
const strokeGrid = (
  context: CanvasRenderingContext2D,
  /** grid cell pixel size */
  gridSize: number,
  /** setting to 1 will disble bold lines */
  gridStep: number,
  scrollX: number,
  scrollY: number,
  zoom: Zoom,
  theme: StaticCanvasRenderConfig["theme"],
  /** flow: thin/regular line color; falls back to the built-in constant */
  gridColor: string,
  /** flow: bold line color; falls back to the built-in constant */
  gridColorBold: string,
  width: number,
  height: number,
) => {
```

Replace **both** `strokeStyle` assignments (lines 102-104 in the vertical loop and 123-125 in the horizontal loop) with:

```ts
    context.strokeStyle = isBold ? gridColorBold : gridColor;
```

Leave `GridLineColor`, the `isBold` detection, the dash arrays, and the line widths exactly as they are.

- [ ] **Step 5: Pass them at the call site**

In the same file, update the `strokeGrid` call (line 272):

```ts
    strokeGrid(
      context,
      appState.gridSize,
      appState.gridStep,
      appState.scrollX,
      appState.scrollY,
      appState.zoom,
      renderConfig.theme,
      appState.gridColor ?? GridLineColor[renderConfig.theme].regular,
      appState.gridColorBold ?? GridLineColor[renderConfig.theme].bold,
      normalizedWidth / appState.zoom.value,
      normalizedHeight / appState.zoom.value,
    );
```

Use `??`, not `||`. An empty string can never reach here (flow validates before writing), but `||` on colors is exactly the falsy-coercion class of bug the drawing-defaults memory records costing three separate fork fixes on `strokeWidth`.

- [ ] **Step 6: Rebuild the vendor package**

Run: `npm run build:excalidraw`
Expected: build completes with no errors. Until this runs, the new fields are invisible to the app.

- [ ] **Step 7: Verify the app still typechecks and the suite is green**

Run: `npm run typecheck && npx vitest run`
Expected: PASS. No behavior change yet — the vendor defaults reproduce today's grid exactly.

- [ ] **Step 8: Commit**

Two commits — the submodule and the parent repo are separate.

```bash
git -C vendor/excalidraw add packages/excalidraw/types.ts packages/excalidraw/appState.ts packages/excalidraw/renderer/staticScene.ts
git -C vendor/excalidraw commit -m "flow: make grid line colors configurable via appState"
git add vendor/excalidraw
git commit -m "build: bump fork for configurable grid line colors"
```

---

### Task 5: The Preferences row

**Files:**
- Modify: `src/ui/PreferencesDialog.tsx`
- Test: `src/ui/PreferencesDialog.test.tsx`

**Interfaces:**
- Consumes: `ColorSwatch` from `./panels/controls/ColorSwatch` (already imported by this file for the Laser row).
- Produces: `PreferencesDialogProps` gains `gridColor: string` and `onChangeGridColor: (value: string) => void`. Task 6 supplies both.

`ColorSwatch` renders a trigger button labeled with `ariaLabel`, and inside its popover a native color input labeled `` `${ariaLabel} custom` `` and a hex text field labeled `` `${ariaLabel} hex` `` that commits on blur/Enter. No new CSS is needed — `.flow-num` and the `flow-ctl-color` styles are both already imported here.

- [ ] **Step 1: Write the failing test**

In `src/ui/PreferencesDialog.test.tsx`, add to `setup()`: a `const onChangeGridColor = vi.fn();`, the props `gridColor="#dddddd"` and `onChangeGridColor={onChangeGridColor}`, and `onChangeGridColor` to the returned object. Then append:

```ts
it("shows the grid color swatch reflecting the current value", () => {
  setup();
  expect(screen.getByRole("button", { name: "Grid color" })).toBeInTheDocument();
});

it("fires onChangeGridColor with a hex committed from the picker", async () => {
  const { onChangeGridColor } = setup();
  await userEvent.click(screen.getByRole("button", { name: "Grid color" }));
  const hex = screen.getByLabelText("Grid color hex");
  await userEvent.type(hex, "#3366aa");
  fireEvent.blur(hex);
  expect(onChangeGridColor).toHaveBeenCalledWith("#3366aa");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/PreferencesDialog.test.tsx`
Expected: FAIL — no button named "Grid color".

- [ ] **Step 3: Write the implementation**

In `src/ui/PreferencesDialog.tsx`, add to `PreferencesDialogProps` after `onChangeGridSize`:

```ts
  /** Canvas grid line color as `#rrggbb` — a global preference. The bold
   *  gridlines are derived from it, so there is only ever one control. */
  gridColor: string;
  onChangeGridColor: (value: string) => void;
```

Destructure `gridColor, onChangeGridColor,` in the component signature, then insert this block immediately after the Grid size block (after the `</div>` closing `.flow-num`, before the Laser pointer block):

```tsx
            {category === "general" && (
              <div className="flow-num">
                <span className="flow-num__label">Grid color</span>
                <ColorSwatch
                  value={gridColor}
                  onChange={onChangeGridColor}
                  ariaLabel="Grid color"
                />
              </div>
            )}
```

A `<span>`, not a `<label>`: `ColorSwatch`'s trigger is a button carrying its own `aria-label`, so a `<label htmlFor>` would have nothing valid to point at.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/ui/PreferencesDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/PreferencesDialog.tsx src/ui/PreferencesDialog.test.tsx
git commit -m "feat(prefs): add the Grid color row below Grid size"
```

---

### Task 6: Wire it through `App.tsx`

**Files:**
- Modify: `src/App.tsx` (state block ~lines 222-243; dialog props ~lines 512-525)

**Interfaces:**
- Consumes: `getGridColor` / `setGridColor` (Task 2), `DEFAULT_GRID_COLOR` / `isGridColor` / `boldGridColor` (Task 1), the `PreferencesDialog` props (Task 5), the fork fields (Task 4).
- Produces: nothing downstream; this is the integration point.

- [ ] **Step 1: Add the state and the live-apply effect**

Extend the existing imports — `getGridColor, setGridColor` from `./app/preferences`, and `DEFAULT_GRID_COLOR, isGridColor, boldGridColor` from `./lib/grid` (which already supplies `clampGridSize`).

Insert immediately after the `gridSize` effect (~line 237):

```ts
  // Grid color: flow's app-wide gridline color. Fork appState fields (absent
  // from the vendor .d.ts) so updateScene needs the same cast as selectionMode
  // and laserColor. Only gridColor is stored — gridColorBold is derived on every
  // write, so the pair cannot drift.
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

- [ ] **Step 2: Add it to the seeded preferences**

Update the `appStatePrefs` object (~line 242):

```ts
  const appStatePrefs = {
    sloppiness,
    bindingMode,
    laserColor,
    selectionMode,
    gridSize,
    gridColor,
  };
```

This is what `initialData` reads at mount and what `File ▸ New` re-seeds from, so first paint and a new document both get the preferred grid.

- [ ] **Step 3: Pass the props to the dialog**

In the `<PreferencesDialog>` JSX (~line 519), after `onChangeGridSize`:

```tsx
          gridColor={gridColor}
          onChangeGridColor={handleChangeGridColor}
```

- [ ] **Step 4: Verify the whole suite and typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: PASS — all suites green.

- [ ] **Step 5: Verify by hand**

Run: `npm run dev`, open the app, turn the grid on from the bottom bar, then `File ▸ Preferences` and change **Grid color**. Confirm:
- The grid recolors live, without closing the dialog.
- Bold lines are visibly *lighter* than thin lines.
- Reload — the color survives.
- `File ▸ New` — the color survives.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(prefs): apply the grid color preference to the canvas"
```

---

### Task 7: End-to-end coverage

**Files:**
- Create: `e2e/grid-color.spec.ts`

**Interfaces:**
- Consumes: the full feature, tasks 1-6.
- Produces: nothing.

Both reads must optional-chain (`h?.state?.gridColor`) inside an `expect.poll`. `window.h` exists at Excalidraw module load, but its `state` getter is only attached in `componentDidMount`, which runs *after* flow's menubar renders — so waiting on the `File` menuitem does **not** mean the API is ready, and a direct read flakes under parallel workers. This is the exact race that was fixed in `e2e/grid-size.spec.ts`.

- [ ] **Step 1: Write the test**

Create `e2e/grid-color.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function setGridColor(page: Page, hex: string) {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await page.getByRole("button", { name: "Grid color" }).click();
  const field = page.getByLabel("Grid color hex");
  await field.fill(hex);
  await field.press("Enter");
  await page.getByRole("button", { name: "Done" }).click();
}

function readGridColors(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          h?: { state?: { gridColor?: string; gridColorBold?: string } };
        }
      ).h?.state,
  );
}

test("grid-color preference updates the live appState colors", async ({ page }) => {
  await page.goto("/");
  // Wait for the app to be interactive before touching window.h (mount race).
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  // flow's default pair: thin #dddddd, bold derived 8 lighter.
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#dddddd");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#e5e5e5");

  await setGridColor(page, "#001020");
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#001020");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#081828");
});

test("grid-color preference persists across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await setGridColor(page, "#3366aa");
  await page.reload();
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#3366aa");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#3b6eb2");
});
```

- [ ] **Step 2: Run the new spec**

Run: `npx playwright test e2e/grid-color.spec.ts`
Expected: PASS, both tests.

If a stale Vite dev server is running, kill it first — the upgrade memory records stray servers producing misleading e2e results:

```bash
pkill -f "vite" || true
```

- [ ] **Step 3: Run it repeatedly to prove it is not flaky**

Run: `npx playwright test e2e/grid-color.spec.ts --repeat-each=5`
Expected: 10/10 PASS.

- [ ] **Step 4: Run the full e2e suite**

Run: `npx playwright test`
Expected: no *new* failures. Two failures in `e2e/text-panel.spec.ts` are **pre-existing on `main`** (confirmed in the color-system memory) — do not chase them.

- [ ] **Step 5: Commit**

```bash
git add e2e/grid-color.spec.ts
git commit -m "test(e2e): cover grid color live update and persistence"
```

---

### Task 8: Record the feature in project memory

**Files:**
- Create: `.claude/memory/grid-line-color.md`
- Modify: `.claude/memory/MEMORY.md` (append one line)

Per `CLAUDE.md`, substantial sessions consolidate context into repo-local memory.

- [ ] **Step 1: Write the memory file**

Create `.claude/memory/grid-line-color.md` covering: the inverted bold-lighter delta and *why* (perceived weight of 4px solid vs 1px dashed) so a future reader does not "correct" it to match upstream; the two-field design and why the derivation stayed in flow rather than the fork; the exact fork touch-points; and anything that actually went wrong during implementation.

- [ ] **Step 2: Add the index line**

Append to `.claude/memory/MEMORY.md`:

```markdown
- [Grid line color](grid-line-color.md) — global `flow.gridColor` in File ▸ Preferences; one picked color paints the thin lines, bold derived +8 per channel (LIGHTER — deliberately inverted from upstream); 2 fork appState fields, derivation kept in flow; shipped 2026-08-15
```

- [ ] **Step 3: Commit**

```bash
git add .claude/memory/grid-line-color.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record the grid line color preference"
```

---

## Verification Checklist

Before calling this done:

- [ ] `npm run typecheck` clean
- [ ] `npx vitest run` — all unit suites green
- [ ] `npx playwright test` — no new failures vs `main` (2 pre-existing `text-panel.spec.ts` failures expected)
- [ ] Manual: grid recolors live, bold lines lighter than thin, survives reload and `File ▸ New`
- [ ] `git -C vendor/excalidraw diff --stat main...HEAD` — 3 files changed by this feature, all additive
