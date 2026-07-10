# View-Menu Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five live checkbox toggles — Grid, Snap to Objects, Arrow Binding, Tool Lock, Zen Mode — to the desktop menu bar's View menu.

**Architecture:** A new `useViewToggles(api)` reactive-bridge hook (mirroring `useActiveTool`/`useBottomActions`) subscribes to Excalidraw's `onChange` and exposes `{checked, toggle}` for the four appState-derived toggles (grid/snap/toolLock/zen). `MenuBar` takes `api`, calls the hook, and renders the group; Arrow Binding stays App-owned (flow-persisted `bindingMode`) and is passed in as props. Zero fork edits.

**Tech Stack:** React + TypeScript, Radix `@radix-ui/react-menubar`, Vitest + React Testing Library, Playwright.

## Global Constraints

- **Zero fork edits.** Action names (`gridMode`, `objectsSnapMode`, `zenMode`) and `activeTool.locked` are the existing public surface (used by BottomBar/ToolBar). No `vendor/excalidraw` changes.
- **App must not re-render on `onChange`.** The reactive subscription lives in the hook called by `MenuBar`, never in `App`.
- Menu order (top→bottom): **Grid, Snap to Objects, Arrow Binding, Tool Lock, Zen Mode**.
- Checkbox items use the existing `flow-menu__item flow-menu__item--check` classes + `Menubar.ItemIndicator` (`✓`), like "Show Toolbar".
- Arrow Binding toggles through App's `handleSetBindingMode` (state + `flow.bindingMode` persistence + `updateScene`) — never a raw appState write.
- No keyboard-shortcut hints on these rows. No new persisted preferences.

---

### Task 1: `useViewToggles` reactive hook

**Files:**
- Create: `src/ui/menubar/useViewToggles.ts`
- Test: `src/ui/menubar/useViewToggles.test.ts`

**Interfaces:**
- Consumes: `ExcalidrawAPI` from `../../lib/excalidraw-scene` (has `onChange(cb): () => void`, `getAppState()`, `executeAction(name, value?)`, `setActiveTool(arg)`).
- Produces:
  ```ts
  export interface ViewToggle { checked: boolean; toggle: () => void; }
  export interface ViewToggles {
    grid: ViewToggle; objectsSnap: ViewToggle; toolLock: ViewToggle; zenMode: ViewToggle;
  }
  export function useViewToggles(api: ExcalidrawAPI | null): ViewToggles;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/ui/menubar/useViewToggles.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useViewToggles } from "./useViewToggles";

type Api = Parameters<typeof useViewToggles>[0];

function fakeApi(state: Record<string, unknown>) {
  return {
    onChange: () => () => {},
    getAppState: () => state,
    executeAction: vi.fn(),
    setActiveTool: vi.fn(),
  };
}

const baseState = {
  gridModeEnabled: true,
  objectsSnapModeEnabled: false,
  zenModeEnabled: true,
  activeTool: { type: "rectangle", locked: true },
};

describe("useViewToggles", () => {
  it("reflects appState flags in checked", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    expect(result.current.grid.checked).toBe(true);
    expect(result.current.objectsSnap.checked).toBe(false);
    expect(result.current.zenMode.checked).toBe(true);
    expect(result.current.toolLock.checked).toBe(true);
  });

  it("dispatches the matching action for grid/snap/zen toggles", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    result.current.grid.toggle();
    result.current.objectsSnap.toggle();
    result.current.zenMode.toggle();
    expect(api.executeAction).toHaveBeenCalledWith("gridMode");
    expect(api.executeAction).toHaveBeenCalledWith("objectsSnapMode");
    expect(api.executeAction).toHaveBeenCalledWith("zenMode");
  });

  it("toggles the tool lock via setActiveTool with the flipped locked flag", () => {
    const api = fakeApi(baseState);
    const { result } = renderHook(() => useViewToggles(api as unknown as Api));
    result.current.toolLock.toggle();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: false });
  });

  it("is inert when api is null (checked false, toggles no-op)", () => {
    const { result } = renderHook(() => useViewToggles(null));
    expect(result.current.grid.checked).toBe(false);
    expect(result.current.toolLock.checked).toBe(false);
    expect(() => {
      result.current.grid.toggle();
      result.current.toolLock.toggle();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/menubar/useViewToggles.test.ts`
Expected: FAIL — cannot resolve `./useViewToggles`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/menubar/useViewToggles.ts`:

```ts
import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

/** setActiveTool's arg is a discriminated union; our partial is a subset, so
 *  cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

export interface ViewToggle {
  checked: boolean;
  toggle: () => void;
}

export interface ViewToggles {
  grid: ViewToggle;
  objectsSnap: ViewToggle;
  toolLock: ViewToggle;
  zenMode: ViewToggle;
}

const NOOP = () => {};

/**
 * Reactive bridge for the View menu's canvas toggles. Subscribes to `onChange`
 * so checkmarks re-render when state changes (including via keyboard/other
 * bars), reads the flags from `getAppState()`, and toggles through the public
 * `executeAction` / `setActiveTool` API. Mirrors useActiveTool/useBottomActions.
 */
export function useViewToggles(api: ExcalidrawAPI | null): ViewToggles {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const appState = api?.getAppState();
  const activeType = appState?.activeTool?.type ?? "selection";
  const locked = appState?.activeTool?.locked ?? false;

  const action = (name: string): (() => void) =>
    api ? () => api.executeAction(name) : NOOP;

  return {
    grid: { checked: Boolean(appState?.gridModeEnabled), toggle: action("gridMode") },
    objectsSnap: {
      checked: Boolean(appState?.objectsSnapModeEnabled),
      toggle: action("objectsSnapMode"),
    },
    toolLock: {
      checked: locked,
      toggle: api
        ? () => api.setActiveTool({ type: activeType, locked: !locked } as SetToolArg)
        : NOOP,
    },
    zenMode: { checked: Boolean(appState?.zenModeEnabled), toggle: action("zenMode") },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/menubar/useViewToggles.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/menubar/useViewToggles.ts src/ui/menubar/useViewToggles.test.ts
git commit -m "feat(view-menu): add useViewToggles reactive bridge hook"
```

---

### Task 2: Render the toggle group in MenuBar

**Files:**
- Modify: `src/ui/menubar/MenuBar.tsx`
- Test: `src/ui/menubar/MenuBar.test.tsx`

**Interfaces:**
- Consumes: `useViewToggles` (Task 1); `ExcalidrawAPI` from `../../lib/excalidraw-scene`.
- Produces: `MenuBarProps` gains `api: ExcalidrawAPI | null`, `isArrowBindingOn: boolean`, `onToggleArrowBinding: () => void`; **loses** `onToggleGrid`. The View menu renders five `menuitemcheckbox` rows named exactly: `Grid`, `Snap to Objects`, `Arrow Binding`, `Tool Lock`, `Zen Mode`.

- [ ] **Step 1: Write the failing test**

In `src/ui/menubar/MenuBar.test.tsx`, update the shared `props` object: remove `onToggleGrid: noop,` and add a fake api + the two arrow-binding props. Add a `fakeApi` helper near the top (after `const noop`):

```ts
function fakeApi(state: Record<string, unknown> = {}) {
  return {
    onChange: () => () => {},
    getAppState: () => ({
      gridModeEnabled: false,
      objectsSnapModeEnabled: true,
      zenModeEnabled: false,
      activeTool: { type: "selection", locked: false },
      ...state,
    }),
    executeAction: vi.fn(),
    setActiveTool: vi.fn(),
  };
}
```

In the shared `props` object replace `onResetZoom: noop, onToggleGrid: noop, onAbout: noop,` with `onResetZoom: noop, onAbout: noop,` and append to the object:

```ts
  api: fakeApi(),
  isArrowBindingOn: false,
  onToggleArrowBinding: noop,
```

Then add these tests inside `describe("MenuBar", …)`:

```ts
it("shows the five canvas toggles in the View menu", async () => {
  const user = userEvent.setup();
  render(<MenuBar {...props} api={fakeApi()} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  for (const name of ["Grid", "Snap to Objects", "Arrow Binding", "Tool Lock", "Zen Mode"]) {
    expect(await screen.findByRole("menuitemcheckbox", { name })).toBeInTheDocument();
  }
});

it("reflects live checked state from appState", async () => {
  const user = userEvent.setup();
  render(<MenuBar {...props} api={fakeApi({ gridModeEnabled: false, objectsSnapModeEnabled: true })} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  expect(await screen.findByRole("menuitemcheckbox", { name: "Snap to Objects" })).toBeChecked();
  expect(screen.getByRole("menuitemcheckbox", { name: "Grid" })).not.toBeChecked();
});

it("dispatches gridMode when Grid is clicked", async () => {
  const user = userEvent.setup();
  const api = fakeApi();
  render(<MenuBar {...props} api={api} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Grid" }));
  expect(api.executeAction).toHaveBeenCalledWith("gridMode");
});

it("dispatches objectsSnapMode when Snap to Objects is clicked", async () => {
  const user = userEvent.setup();
  const api = fakeApi();
  render(<MenuBar {...props} api={api} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Snap to Objects" }));
  expect(api.executeAction).toHaveBeenCalledWith("objectsSnapMode");
});

it("dispatches zenMode when Zen Mode is clicked", async () => {
  const user = userEvent.setup();
  const api = fakeApi();
  render(<MenuBar {...props} api={api} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Zen Mode" }));
  expect(api.executeAction).toHaveBeenCalledWith("zenMode");
});

it("flips the tool lock via setActiveTool when Tool Lock is clicked", async () => {
  const user = userEvent.setup();
  const api = fakeApi({ activeTool: { type: "selection", locked: false } });
  render(<MenuBar {...props} api={api} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Tool Lock" }));
  expect(api.setActiveTool).toHaveBeenCalledWith({ type: "selection", locked: true });
});

it("fires onToggleArrowBinding when Arrow Binding is clicked", async () => {
  const user = userEvent.setup();
  const onToggleArrowBinding = vi.fn();
  render(<MenuBar {...props} api={fakeApi()} onToggleArrowBinding={onToggleArrowBinding} />);
  await user.click(screen.getByRole("menuitem", { name: "View" }));
  await user.click(await screen.findByRole("menuitemcheckbox", { name: "Arrow Binding" }));
  expect(onToggleArrowBinding).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/menubar/MenuBar.test.tsx`
Expected: FAIL — the checkbox rows don't exist; TS error on removed `onToggleGrid` / missing new props.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/menubar/MenuBar.tsx`:

Add imports at the top (after the existing imports):

```ts
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useViewToggles } from "./useViewToggles";
```

In `MenuBarProps`, remove the `onToggleGrid` member and add:

```ts
  /** Live Excalidraw handle; drives the View-menu canvas toggles. */
  api: ExcalidrawAPI | null;
  /** Whether arrow-binding is on (flow-owned bindingMode). */
  isArrowBindingOn: boolean;
  /** Flip the arrow-binding lock. */
  onToggleArrowBinding: () => void;
```

Change the component signature to compute the hook. Replace:

```ts
export function MenuBar(props: MenuBarProps) {
  return (
```

with:

```ts
export function MenuBar(props: MenuBarProps) {
  const view = useViewToggles(props.api);
  return (
```

Replace the existing "Toggle Grid" item (the `Menubar.Item` with `onSelect={props.onToggleGrid}`) and the separator that precedes the "Show Toolbar" checkbox — i.e. replace this block:

```tsx
            <Menubar.Item className="flow-menu__item" onSelect={props.onToggleGrid}>
              Toggle Grid
            </Menubar.Item>
```

with the five-checkbox group (keep the `<Menubar.Separator>` that already sits above it after "Reset Zoom", and add a trailing separator before "Show Toolbar"):

```tsx
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={view.grid.checked}
              onCheckedChange={view.grid.toggle}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">✓</Menubar.ItemIndicator>
              Grid
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={view.objectsSnap.checked}
              onCheckedChange={view.objectsSnap.toggle}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">✓</Menubar.ItemIndicator>
              Snap to Objects
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isArrowBindingOn}
              onCheckedChange={props.onToggleArrowBinding}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">✓</Menubar.ItemIndicator>
              Arrow Binding
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={view.toolLock.checked}
              onCheckedChange={view.toolLock.toggle}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">✓</Menubar.ItemIndicator>
              Tool Lock
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={view.zenMode.checked}
              onCheckedChange={view.zenMode.toggle}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">✓</Menubar.ItemIndicator>
              Zen Mode
            </Menubar.CheckboxItem>
            <Menubar.Separator className="flow-menu__sep" />
```

(The separator that previously sat *between* "Toggle Grid" and "Show Toolbar" moves to *after* the new group — net: one separator above the group, one below, exactly as the spec's mock shows.)

Verify there is exactly one `<Menubar.Separator>` immediately before the "Show Toolbar" `CheckboxItem` after this edit (the trailing separator added above); if the original block already had one there, do not duplicate it — the mock is: `Reset Zoom` / separator / [5 toggles] / separator / `Show Toolbar`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/menubar/MenuBar.test.tsx`
Expected: PASS (new + existing tests). If a duplicate-separator renders, it's cosmetic and won't fail tests — visually confirm one separator each side.

- [ ] **Step 5: Commit**

```bash
git add src/ui/menubar/MenuBar.tsx src/ui/menubar/MenuBar.test.tsx
git commit -m "feat(view-menu): render Grid/Snap/Arrow-Binding/Tool-Lock/Zen toggles"
```

---

### Task 3: Wire MenuBar props in App

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: MenuBar's new prop contract (Task 2); `isBindingActive`, `toggledBindingMode` from `./lib/binding-mode`.
- Produces: live app wiring. No new exports.

> No isolated unit test (App wiring); Task 4's e2e is the behavioral gate. Verify with typecheck + full unit run.

- [ ] **Step 1: Add binding-mode helper imports**

In `src/App.tsx`, change the binding-mode import. Find:

```ts
import { type BindingMode } from "./lib/binding-mode";
```

and replace with:

```ts
import { type BindingMode, isBindingActive, toggledBindingMode } from "./lib/binding-mode";
```

- [ ] **Step 2: Update the MenuBar usage**

In the `<MenuBar … />` JSX, remove the line:

```tsx
        onToggleGrid={withApi(toggleGrid)}
```

and in its place add:

```tsx
        api={excalidrawApi}
        isArrowBindingOn={isBindingActive(bindingMode)}
        onToggleArrowBinding={() => handleSetBindingMode(toggledBindingMode(bindingMode))}
```

- [ ] **Step 3: Drop the now-unused `toggleGrid` import**

In the `./lib/view-actions` import block, remove `toggleGrid,` (grid now toggles through `useViewToggles`). Leave `zoomIn`, `zoomOut`, `zoomToFit`, `resetZoom`, and any other members intact.

- [ ] **Step 4: Typecheck + full unit suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS — no type errors (removed `onToggleGrid`, added the three props; `toggleGrid` no longer referenced), all unit tests green.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(view-menu): wire api + arrow-binding toggle into MenuBar"
```

---

### Task 4: End-to-end View-toggle test

**Files:**
- Create: `e2e/view-toggles.spec.ts`

**Interfaces:**
- Consumes: the wired MenuBar (Tasks 2–3). Reads live state via `window.h.state` (test hook; optional-chained for the mount race, like the grid-size/object-snap specs).

- [ ] **Step 1: Write the test**

Create `e2e/view-toggles.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

type H = { state?: Record<string, unknown> & { activeTool?: { locked?: boolean } } };
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

async function clickViewToggle(page: Page, name: string) {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "View" })).toBeVisible();
});

test("Grid toggle flips gridModeEnabled", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.gridModeEnabled).toBe(false);
  await clickViewToggle(page, "Grid");
  await expect.poll(async () => (await readState(page))?.gridModeEnabled).toBe(true);
});

test("Snap to Objects toggle flips objectsSnapModeEnabled (defaults on)", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.objectsSnapModeEnabled).toBe(true);
  await clickViewToggle(page, "Snap to Objects");
  await expect.poll(async () => (await readState(page))?.objectsSnapModeEnabled).toBe(false);
});

test("Zen Mode toggle flips zenModeEnabled", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(false);
  await clickViewToggle(page, "Zen Mode");
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(true);
});

test("Tool Lock toggle flips activeTool.locked", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(false);
  await clickViewToggle(page, "Tool Lock");
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(true);
});

test("Arrow Binding toggle flips bindingMode on→off", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("on");
  await clickViewToggle(page, "Arrow Binding");
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("off");
});
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test e2e/view-toggles.spec.ts`
Expected: PASS (5 tests). Run twice to confirm stability. If clicking a checkbox closes the menu (Radix default) that's fine — each test toggles once. If the "Grid" name substring-matches another item, the `exact: true` guards it.

- [ ] **Step 3: Commit**

```bash
git add e2e/view-toggles.spec.ts
git commit -m "test(view-menu): e2e for the five View toggles"
```

---

### Task 5: Full suite + memory note

**Files:**
- Modify: `.claude/memory/MEMORY.md` (add a pointer)
- Create: `.claude/memory/view-menu-toggles.md`

- [ ] **Step 1: Run the full unit + e2e suites**

Run: `npx vitest run && npx playwright test`
Expected: all green (unit grows by ~11; e2e by 5). Note any pre-existing unrelated failure (e.g. `e2e/menu-preferences.spec.ts` About-links, known-broken since commit `06e568e`) without fixing it here.

- [ ] **Step 2: Write the memory file**

Create `.claude/memory/view-menu-toggles.md` capturing: View menu gained five live checkbox toggles (Grid, Snap to Objects, Arrow Binding, Tool Lock, Zen Mode); `src/ui/menubar/useViewToggles.ts` reactive bridge (onChange→bump, reads getAppState, toggles via `executeAction("gridMode"|"objectsSnapMode"|"zenMode")` + `setActiveTool({type,locked})`); `MenuBar` now takes `api` and calls the hook so re-renders stay scoped to the menu (App never re-renders on onChange); Arrow Binding stays App-owned via `bindingMode` (`isBindingActive`/`toggledBindingMode`) props; the old plain "Toggle Grid" item became the Grid checkbox (`onToggleGrid`/`toggleGrid` removed); **zero fork edits**. Link `[[bottom-bar]]`, `[[quick-actions-bar]]`, `[[vertical-toolbar]]`, `[[selection-mode]]`.

- [ ] **Step 3: Add the MEMORY.md pointer**

Append one line to `.claude/memory/MEMORY.md`:

```
- [View-menu toggles](view-menu-toggles.md) — View menu: live checkboxes for Grid/Snap/Arrow-Binding/Tool-Lock/Zen; useViewToggles reactive bridge; zero fork; shipped 2026-07-09
```

- [ ] **Step 4: Commit**

```bash
git add -f .claude/memory/view-menu-toggles.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record View-menu toggles"
```

(`.claude/` is gitignored; memory files are force-tracked — `git add -f` is required.)

---

## Self-Review

**1. Spec coverage:**
- Five checkboxes, order Grid/Snap/Arrow Binding/Tool Lock/Zen → Task 2. ✅
- Grid converted from plain item to checkbox; `onToggleGrid`/`toggleGrid` removed → Tasks 2, 3. ✅
- Reactive bridge, re-renders scoped to menu (not App) → Task 1 hook, consumed in MenuBar Task 2. ✅
- State mapping (gridMode/objectsSnapMode/zenMode actions; activeTool.locked; bindingMode via handleSetBindingMode) → Task 1 + Task 3. ✅
- Zero fork edits → Global Constraints; all touch points are flow-level. ✅
- Tests: hook unit, MenuBar RTL, e2e → Tasks 1, 2, 4. ✅

**2. Placeholder scan:** No TBD/TODO; every code step is complete. Task 5 Step 2 is prose for a memory doc (not code), acceptable.

**3. Type consistency:** `useViewToggles`/`ViewToggle`/`ViewToggles`/`grid|objectsSnap|toolLock|zenMode`, prop names `api`/`isArrowBindingOn`/`onToggleArrowBinding`, and action strings `"gridMode"|"objectsSnapMode"|"zenMode"` are used identically across Tasks 1→2→3→4. Removed `onToggleGrid` consistently in Tasks 2 and 3. No mismatches.
