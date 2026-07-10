# Grid Size Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global, app-wide **Grid size** preference (in px) to `File ▸ Preferences` that controls the canvas grid used by the grid option.

**Architecture:** Excalidraw already exposes `appState.gridSize` (native field, default 20), read by both the grid renderer and grid-snapping. This feature is entirely flow-level: a pure `grid.ts` lib (bounds + clamp), a `flow.gridSize` localStorage preference, App wiring that seeds `initialData.appState.gridSize` and applies changes via `updateScene`, and a number-input row in the Preferences dialog. **No `vendor/excalidraw` fork edit and no type cast** are required — `gridSize` is already in the vendor `.d.ts`.

**Tech Stack:** React + TypeScript, Vitest + React Testing Library (unit), Playwright (e2e). Excalidraw fork consumed as `@excalidraw/excalidraw` (git submodule at `vendor/excalidraw`).

## Global Constraints

- **Grid size range:** min **5**, max **100**, step **5**, default **20** (verbatim from spec).
- **Zero fork edits.** Do not touch `vendor/excalidraw`. `gridSize` is a native appState field — no `as unknown as` cast on `updateScene`/`initialData`.
- **`gridStep` untouched.** Leave it at its default (5); bold gridlines auto-track.
- **Global scope.** One value in flow localStorage under key `flow.gridSize`; applies to every drawing.
- **Immutable updates**, explicit types on exported functions, no `console.log`.
- All preference reads validate through `clampGridSize` so a corrupt stored value can never yield an invalid grid size.

---

### Task 1: `grid.ts` lib — bounds, `clampGridSize`, `isGridSize`

**Files:**
- Create: `src/lib/grid.ts`
- Test: `src/lib/grid.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MIN_GRID_SIZE = 5`, `MAX_GRID_SIZE = 100`, `GRID_SIZE_STEP = 5`, `DEFAULT_GRID_SIZE = 20` (all `number` consts).
  - `clampGridSize(value: number): number` — NaN/non-finite → `DEFAULT_GRID_SIZE`; clamp to `[MIN, MAX]`; round to nearest multiple of `GRID_SIZE_STEP`.
  - `isGridSize(value: unknown): value is number` — true when a finite number in `[MIN, MAX]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/grid.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  DEFAULT_GRID_SIZE,
  clampGridSize,
  isGridSize,
} from "./grid";

describe("clampGridSize", () => {
  it("returns the default for NaN / non-finite input", () => {
    expect(clampGridSize(Number.NaN)).toBe(DEFAULT_GRID_SIZE);
    expect(clampGridSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_GRID_SIZE);
  });

  it("clamps below the minimum up to MIN_GRID_SIZE", () => {
    expect(clampGridSize(2)).toBe(MIN_GRID_SIZE);
    expect(clampGridSize(-40)).toBe(MIN_GRID_SIZE);
  });

  it("clamps above the maximum down to MAX_GRID_SIZE", () => {
    expect(clampGridSize(500)).toBe(MAX_GRID_SIZE);
  });

  it("rounds to the nearest step", () => {
    expect(clampGridSize(22)).toBe(20);
    expect(clampGridSize(23)).toBe(25);
    expect(clampGridSize(47)).toBe(45);
  });

  it("passes a valid in-range multiple through unchanged", () => {
    expect(clampGridSize(20)).toBe(20);
    expect(clampGridSize(50)).toBe(50);
  });
});

describe("isGridSize", () => {
  it("accepts finite numbers within range", () => {
    expect(isGridSize(5)).toBe(true);
    expect(isGridSize(20)).toBe(true);
    expect(isGridSize(100)).toBe(true);
  });

  it("rejects out-of-range, non-finite, and non-number values", () => {
    expect(isGridSize(4)).toBe(false);
    expect(isGridSize(101)).toBe(false);
    expect(isGridSize(Number.NaN)).toBe(false);
    expect(isGridSize("20")).toBe(false);
    expect(isGridSize(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/grid.test.ts`
Expected: FAIL — cannot resolve `./grid` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/grid.ts`:

```ts
/** flow's persistent grid-size preference. Written into `appState.gridSize`,
 *  which Excalidraw's grid renderer and grid-snapping both read. Values are
 *  clamped to a sane px range and rounded to a fixed step so the visible grid
 *  and the snap increment stay usable. */
export const MIN_GRID_SIZE = 5;
export const MAX_GRID_SIZE = 100;
export const GRID_SIZE_STEP = 5;
export const DEFAULT_GRID_SIZE = 20;

/** Clamp to [MIN, MAX], round to the nearest step; NaN/non-finite → default. */
export function clampGridSize(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_GRID_SIZE;
  const clamped = Math.min(MAX_GRID_SIZE, Math.max(MIN_GRID_SIZE, value));
  return Math.round(clamped / GRID_SIZE_STEP) * GRID_SIZE_STEP;
}

/** Type guard for an unknown persisted value. */
export function isGridSize(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_GRID_SIZE &&
    value <= MAX_GRID_SIZE
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/grid.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/grid.ts src/lib/grid.test.ts
git commit -m "feat(grid): add grid-size lib (bounds, clamp, guard)"
```

---

### Task 2: `flow.gridSize` preference get/set

**Files:**
- Modify: `src/app/preferences.ts` (add a grid-size block near the `selectionMode` block ending at line 158)
- Test: `src/app/preferences.test.ts` (add a `describe("grid size preference", …)` block)

**Interfaces:**
- Consumes: `clampGridSize`, `isGridSize`, `DEFAULT_GRID_SIZE` from `../lib/grid` (Task 1).
- Produces:
  - `getGridSize(): number` — reads `localStorage["flow.gridSize"]`, parses to number, returns `clampGridSize` of it when `isGridSize`, else `DEFAULT_GRID_SIZE` (also on parse failure / storage error).
  - `setGridSize(value: number): void` — writes `clampGridSize(value)` as a string; swallows storage errors (matches existing setters).

- [ ] **Step 1: Write the failing test**

Add to `src/app/preferences.test.ts` (a new `describe` block; also add `getGridSize, setGridSize` to the existing import from `./preferences`):

```ts
describe("grid size preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 20 when unset", () => {
    expect(getGridSize()).toBe(20);
  });

  it("round-trips a valid value", () => {
    setGridSize(40);
    expect(getGridSize()).toBe(40);
  });

  it("clamps an out-of-range value on write", () => {
    setGridSize(500);
    expect(getGridSize()).toBe(100);
  });

  it("falls back to the default on a corrupt stored value", () => {
    localStorage.setItem("flow.gridSize", "banana");
    expect(getGridSize()).toBe(20);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getGridSize` / `setGridSize` are not exported (import error).

- [ ] **Step 3: Write minimal implementation**

In `src/app/preferences.ts`, add to the imports at the top of the file:

```ts
import { clampGridSize, isGridSize, DEFAULT_GRID_SIZE } from "../lib/grid";
```

Then append after the `setSelectionMode` function (currently ends at line 158):

```ts
const GRID_SIZE_KEY = "flow.gridSize";

/** Read the app-wide grid-size preference (default on miss/corrupt). */
export function getGridSize(): number {
  try {
    const raw = localStorage.getItem(GRID_SIZE_KEY);
    if (raw === null) return DEFAULT_GRID_SIZE;
    const parsed = Number(raw);
    return isGridSize(parsed) ? clampGridSize(parsed) : DEFAULT_GRID_SIZE;
  } catch {
    return DEFAULT_GRID_SIZE;
  }
}

/** Persist the app-wide grid-size preference (clamped before write). */
export function setGridSize(value: number): void {
  try {
    localStorage.setItem(GRID_SIZE_KEY, String(clampGridSize(value)));
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: PASS (new block green, existing blocks unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat(grid): persist flow.gridSize preference"
```

---

### Task 3: Grid-size row in PreferencesDialog + CSS

**Files:**
- Modify: `src/ui/PreferencesDialog.tsx`
- Modify: `src/ui/preferences-dialog.css`
- Test: `src/ui/PreferencesDialog.test.tsx`

**Interfaces:**
- Consumes: `MIN_GRID_SIZE`, `MAX_GRID_SIZE`, `GRID_SIZE_STEP`, `clampGridSize` from `../lib/grid` (Task 1).
- Produces: `PreferencesDialog` gains two required props:
  - `gridSize: number`
  - `onChangeGridSize: (value: number) => void`
  The input is a `type="number"` with accessible label **"Grid size"**; on `change` it commits `clampGridSize(Number(e.target.value))` to `onChangeGridSize`.

- [ ] **Step 1: Write the failing test**

Update `setup()` in `src/ui/PreferencesDialog.test.tsx` to add the new prop (add `const onChangeGridSize = vi.fn();`, pass `gridSize={20}` and `onChangeGridSize={onChangeGridSize}` to the rendered element, and return `onChangeGridSize`). Then add these tests inside `describe("PreferencesDialog", …)`:

```ts
it("shows the grid-size input reflecting the current value", () => {
  setup({ gridSize: 40 });
  expect(screen.getByLabelText("Grid size")).toHaveValue(40);
});

it("fires onChangeGridSize with the entered value", async () => {
  const { onChangeGridSize } = setup();
  const input = screen.getByLabelText("Grid size");
  await userEvent.clear(input);
  await userEvent.type(input, "50");
  expect(onChangeGridSize).toHaveBeenLastCalledWith(50);
});

it("clamps an out-of-range entry before firing onChangeGridSize", async () => {
  const { onChangeGridSize } = setup();
  const input = screen.getByLabelText("Grid size");
  await userEvent.clear(input);
  await userEvent.type(input, "500");
  expect(onChangeGridSize).toHaveBeenLastCalledWith(100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/PreferencesDialog.test.tsx`
Expected: FAIL — no element labeled "Grid size" (and TS error: missing `gridSize`/`onChangeGridSize` props).

- [ ] **Step 3: Write minimal implementation**

In `src/ui/PreferencesDialog.tsx`:

Add to the `../lib/grid` import (new import line):

```ts
import {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  GRID_SIZE_STEP,
  clampGridSize,
} from "../lib/grid";
```

Add to `PreferencesDialogProps`:

```ts
  gridSize: number;
  onChangeGridSize: (value: number) => void;
```

Add `gridSize` and `onChangeGridSize` to the destructured params. Add a `useId` for the input near the existing `unitsId`:

```ts
  const gridSizeId = useId();
```

Insert this block in the General category, immediately after the `flow-seg-field` Select block (after the closing `)}` of the `selectionMode` block, before the `category === "keyboard"` block):

```tsx
{category === "general" && (
  <div className="flow-num">
    <label className="flow-num__label" htmlFor={gridSizeId}>
      Grid size
    </label>
    <div className="flow-num__control">
      <input
        id={gridSizeId}
        className="flow-num__input"
        type="number"
        min={MIN_GRID_SIZE}
        max={MAX_GRID_SIZE}
        step={GRID_SIZE_STEP}
        value={gridSize}
        onChange={(e) => onChangeGridSize(clampGridSize(Number(e.target.value)))}
      />
      <span className="flow-num__suffix">px</span>
    </div>
  </div>
)}
```

Then append to `src/ui/preferences-dialog.css`:

```css
/* Number-input field (e.g. Grid size). */
.flow-num {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-top: 1rem;
}
.flow-num__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #4a5163;
}
.flow-num__control {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  width: fit-content;
}
.flow-num__input {
  font: inherit;
  font-size: 0.875rem;
  width: 5rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid #d6dae4;
  border-radius: 8px;
  background: #fbfcfe;
  color: #4a5163;
}
.flow-num__input:focus-visible {
  outline: 2px solid #6366f1;
  outline-offset: -2px;
}
.flow-num__suffix {
  font-size: 0.8125rem;
  color: #6b7280;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/PreferencesDialog.test.tsx`
Expected: PASS (new tests green; existing dialog tests unaffected).

- [ ] **Step 5: Commit**

```bash
git add src/ui/PreferencesDialog.tsx src/ui/preferences-dialog.css src/ui/PreferencesDialog.test.tsx
git commit -m "feat(grid): grid-size number input in Preferences"
```

---

### Task 4: Wire gridSize into App (state, persistence, apply, seed)

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `getGridSize`, `setGridSize` (Task 2); `PreferencesDialog`'s `gridSize`/`onChangeGridSize` props (Task 3).
- Produces: live `appState.gridSize` reflects the persisted preference on load and on change. No new exports.

> There is no isolated unit test for App wiring; Task 5's e2e is the behavioral gate. Verify this task with a typecheck + full unit run (Step 4).

- [ ] **Step 1: Add imports and state**

In `src/App.tsx`, add `getGridSize, setGridSize` to the existing `./app/preferences` import block (lines 13–21):

```ts
  getGridSize, setGridSize,
```

Immediately after the `selectionMode` effect (ends at line 197), add:

```ts
  // Grid size: flow's app-wide grid-cell size (px). Native appState field, so
  // no cast is needed (unlike selectionMode/bindingMode/laserColor above).
  const [gridSize, setGridSizeState] = useState<number>(() => getGridSize());
  const handleChangeGridSize = useCallback((next: number) => {
    setGridSizeState(next);
    setGridSize(next);
  }, []);
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({ appState: { gridSize } });
  }, [excalidrawApi, gridSize]);
```

- [ ] **Step 2: Seed initialData and pass props to the dialog**

In the `initialData` `appState` object (around lines 389–401), add after `selectionMode,`:

```ts
              // Seed the grid size at init so the grid renders at the preferred
              // cell size on first paint (native field; no cast needed).
              gridSize,
```

In the `<PreferencesDialog … />` JSX (around lines 448–456), add after the `onChangeSelectionMode` prop:

```tsx
          gridSize={gridSize}
          onChangeGridSize={handleChangeGridSize}
```

- [ ] **Step 3: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors (`gridSize` is a native appState field), all unit tests green.

- [ ] **Step 4: Verify manually in the running app (optional but recommended)**

Run: `npm run dev`, open the app, `File ▸ Preferences`, set Grid size to 50, enable the grid (bottom bar grid toggle). Expected: grid cells visibly larger; value persists across reload.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(grid): apply and persist grid-size preference in App"
```

---

### Task 5: End-to-end grid-size test

**Files:**
- Create: `e2e/grid-size.spec.ts`

**Interfaces:**
- Consumes: the wired dialog + App from Tasks 3–4. Reads the live grid size via `window.h.state.gridSize` (Excalidraw's test hook, exposed in dev/test mode; already used elsewhere in the e2e suite via `window.h`).

- [ ] **Step 1: Write the failing test**

Create `e2e/grid-size.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

async function setGridSize(page: Page, value: number) {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const input = page.getByLabelText("Grid size");
  await input.fill(String(value));
  await input.blur();
  await page.getByRole("button", { name: "Done" }).click();
}

function readGridSize(page: Page) {
  return page.evaluate(
    () => (window as unknown as { h: { state: { gridSize: number } } }).h.state.gridSize,
  );
}

test("grid-size preference updates the live appState.gridSize", async ({ page }) => {
  await page.goto("/");

  // Default is Excalidraw's 20.
  expect(await readGridSize(page)).toBe(20);

  await setGridSize(page, 50);
  expect(await readGridSize(page)).toBe(50);
});

test("grid-size preference persists across reload", async ({ page }) => {
  await page.goto("/");
  await setGridSize(page, 40);
  await page.reload();
  expect(await readGridSize(page)).toBe(40);
});
```

- [ ] **Step 2: Run test to verify it fails (if run before Tasks 3–4 land) or passes**

Run: `npx playwright test e2e/grid-size.spec.ts`
Expected (with Tasks 3–4 complete): PASS. If the "Grid size" label is missing, the wiring from Tasks 3–4 is incomplete — fix there, not here.

- [ ] **Step 3: Commit**

```bash
git add e2e/grid-size.spec.ts
git commit -m "test(grid): e2e for grid-size preference + persistence"
```

---

### Task 6: Full suite + memory note

**Files:**
- Create: `.claude/memory/grid-size-preference.md`
- Modify: `.claude/memory/MEMORY.md` (add a one-line pointer)

- [ ] **Step 1: Run the full unit + e2e suite**

Run: `npx vitest run && npx playwright test`
Expected: all green (previous baseline was 280 unit + 51 e2e; this adds ~10 unit + 2 e2e).

- [ ] **Step 2: Write the memory file**

Create `.claude/memory/grid-size-preference.md` summarizing: global `flow.gridSize` preference (5–100, step 5, default 20) in File ▸ Preferences; **zero fork edits** (native `gridSize` appState field, no cast); files `src/lib/grid.ts`, `preferences.ts` get/set, App state+effect+seed, `PreferencesDialog` `.flow-num` row; controls both visible grid and snap increment; `gridStep` untouched. Link `[[selection-mode]]` and `[[bottom-bar]]`.

- [ ] **Step 3: Add the MEMORY.md pointer**

Append one line to `.claude/memory/MEMORY.md`:

```
- [Grid size preference](grid-size-preference.md) — global flow.gridSize (5–100, default 20) in File ▸ Preferences; zero fork (native appState field); shipped 2026-07-09
```

- [ ] **Step 4: Commit**

```bash
git add .claude/memory/grid-size-preference.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record grid-size preference"
```

---

## Self-Review

**1. Spec coverage:**
- Number input (px) control → Task 3. ✅
- Range 5–100, step 5, default 20 → Global Constraints + Task 1 (`clampGridSize`). ✅
- Global app-wide, `flow.gridSize` localStorage → Task 2. ✅
- Applied on load (initialData seed) + live on change (effect) → Task 4. ✅
- Controls grid render + snap increment (both read `appState.gridSize`) → inherent; verified by Task 5 e2e reading `window.h.state.gridSize`. ✅
- Validation/clamp on read and on input commit → Task 1 (`clampGridSize`), Task 2 (get/set), Task 3 (input onChange). ✅
- `gridStep` untouched, no fork edit, no cast → Global Constraints + Task 4 note. ✅
- Tests: grid.test.ts, preferences round-trip, dialog RTL, e2e → Tasks 1, 2, 3, 5. ✅

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step shows complete code. Task 6 Step 2 describes prose content for a memory doc (not code), which is acceptable.

**3. Type consistency:** `clampGridSize`/`isGridSize`/`getGridSize`/`setGridSize`/`gridSize`/`onChangeGridSize` names and `number` types are used identically across Tasks 1→2→3→4→5. `DEFAULT_GRID_SIZE`/`MIN_GRID_SIZE`/`MAX_GRID_SIZE`/`GRID_SIZE_STEP` consts referenced consistently. No mismatches.
