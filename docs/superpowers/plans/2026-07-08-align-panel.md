# Align Sub-Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dockable "Align" sub-panel exposing Excalidraw's align (6) and distribute (2) actions as momentary icon buttons, greyed when the selection is too small.

**Architecture:** A new momentary-button primitive `IconActionGroup` (sibling to the radio-semantics `IconToggleGroup`) renders two rows in a new `AlignPanel`, which dispatches each action through the existing `sel.executeAction(name)` bridge. A derived `selectedCount` on `useSelectionStyle` drives the grey-out thresholds. The panel is registered in `PanelsRoot`'s `defs`; the dock's `syncPanelDefs` auto-adopts the new id. No fork edits.

**Tech Stack:** React + TypeScript, Vite, Vitest + @testing-library/react (unit), Playwright (e2e), Excalidraw (vendored fork, consumed via `executeAction` export).

## Global Constraints

- **No fork edits.** `executeAction` is already exported; `alignLeft/alignRight/alignTop/alignBottom/alignHorizontallyCentered/alignVerticallyCentered` and `distributeHorizontally/distributeVertically` are already registered in the vendored fork.
- **Immutability / flow-native only.** No scene writes from flow for this feature — geometry is entirely each action's `perform`. The panel only dispatches.
- **Commit messages:** conventional commits (`feat:`, `test:`), **no attribution trailer** (project disables it — matches existing `git log`).
- **Panel order:** `Style · Stroke · Text · Align · Layers` for fresh users. Existing users with a saved `flow.panelLayout` get Align appended last (accepted — `syncPanelDefs` appends missing ids).
- **Thresholds:** Align row disabled when `selectedCount < 2`; Distribute row disabled when `selectedCount < 3`.
- **Branch:** work continues on `feat/align-panel` (already created; the design spec is committed there).
- **Test commands:** unit = `npx vitest run <file>`; e2e = `npx playwright test <file>`.

---

### Task 1: `IconActionGroup` primitive

A row of momentary icon buttons for fire-and-forget actions. Distinct from `IconToggleGroup` (radio, `aria-checked`, single `onChange`): these carry no selected state.

**Files:**
- Create: `src/ui/panels/controls/IconActionGroup.tsx`
- Test: `src/ui/panels/controls/IconActionGroup.test.tsx`

**Interfaces:**
- Consumes: nothing (leaf primitive).
- Produces:
  ```ts
  export interface ActionOption {
    key: string;
    label: string;      // accessible name + tooltip
    icon: ReactNode;
    onClick: () => void;
  }
  export function IconActionGroup(props: {
    options: readonly ActionOption[];
    ariaLabel: string;
    disabled?: boolean;
  }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/ui/panels/controls/IconActionGroup.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IconActionGroup, type ActionOption } from "./IconActionGroup";

const makeOpts = (onClick = () => {}): ActionOption[] => [
  { key: "left", label: "Align left", icon: <span>L</span>, onClick },
  { key: "right", label: "Align right", icon: <span>R</span>, onClick },
];

describe("IconActionGroup", () => {
  it("renders one button per option inside a group (not a radiogroup)", () => {
    render(<IconActionGroup options={makeOpts()} ariaLabel="Align" />);
    const group = screen.getByRole("group", { name: "Align" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align left" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Align right" })).toBeInTheDocument();
    // momentary buttons never carry checked state
    expect(screen.getByRole("button", { name: "Align left" })).not.toHaveAttribute("aria-checked");
  });

  it("fires the clicked option's onClick", async () => {
    const onClick = vi.fn();
    render(<IconActionGroup options={makeOpts(onClick)} ariaLabel="Align" />);
    await userEvent.click(screen.getByRole("button", { name: "Align right" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("disables every button and does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(<IconActionGroup options={makeOpts(onClick)} ariaLabel="Align" disabled />);
    const left = screen.getByRole("button", { name: "Align left" });
    expect(left).toBeDisabled();
    expect(screen.getByRole("group", { name: "Align" })).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(left);
    expect(onClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/controls/IconActionGroup.test.tsx`
Expected: FAIL — `Failed to resolve import "./IconActionGroup"` (module doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/panels/controls/IconActionGroup.tsx`:

```tsx
import type { ReactNode } from "react";

export interface ActionOption {
  key: string;
  /** Accessible name / tooltip for the button. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface IconActionGroupProps {
  options: readonly ActionOption[];
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * A row of momentary icon buttons — the shared primitive behind align and
 * distribute. Unlike IconToggleGroup these hold no selected state: each button
 * fires an action and forgets. Reuses the .flow-ctl-icons CSS.
 */
export function IconActionGroup({ options, ariaLabel, disabled = false }: IconActionGroupProps) {
  return (
    <div
      className="flow-ctl-icons"
      role="group"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          aria-label={opt.label}
          title={opt.label}
          className="flow-ctl-icons__btn"
          disabled={disabled}
          onClick={opt.onClick}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/controls/IconActionGroup.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/controls/IconActionGroup.tsx src/ui/panels/controls/IconActionGroup.test.tsx
git commit -m "feat: add IconActionGroup momentary-button primitive"
```

---

### Task 2: `selectedCount` on `useSelectionStyle`

Derived count of selected elements, driving the align/distribute grey-out thresholds.

**Files:**
- Modify: `src/ui/panels/useSelectionStyle.ts` (interface `SelectionStyle` + the hook body + the returned object)
- Test: `src/ui/panels/useSelectionStyle.test.tsx` (existing file — add a case)

**Interfaces:**
- Consumes: the existing `selectedIds: SelectedElementIds` already computed in the hook.
- Produces: `SelectionStyle.selectedCount: number` — the number of truthy entries in `selectedElementIds`.

- [ ] **Step 1: Write the failing test**

First open `src/ui/panels/useSelectionStyle.test.tsx` to match its existing mock-api setup (it already `vi.mock("@excalidraw/excalidraw")`). Add this test, adapting the mock-api helper already used in that file so `getAppState()` returns `selectedElementIds: { a: true, b: true, c: false }`:

```tsx
it("selectedCount counts only truthy selectedElementIds", () => {
  // Use the file's existing renderHook + mock-api helper; set the app state's
  // selectedElementIds to { a: true, b: true, c: false }.
  const { result } = renderHookWithApi({
    selectedElementIds: { a: true, b: true, c: false },
  });
  expect(result.current.selectedCount).toBe(2);
});
```

> Note: `renderHookWithApi` is a stand-in for whatever helper the existing test file uses to build the mock api and render the hook. Reuse the existing helper; only the assertion on `selectedCount` is new. If the file builds the mock inline per test, copy that inline setup and set `selectedElementIds` as above.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/useSelectionStyle.test.tsx`
Expected: FAIL — `result.current.selectedCount` is `undefined`, so `expect(undefined).toBe(2)` fails.

- [ ] **Step 3: Write minimal implementation**

In `src/ui/panels/useSelectionStyle.ts`:

Add to the `SelectionStyle` interface, right after `hasSelection: boolean;`:

```ts
  /** Number of selected elements (truthy selectedElementIds). Drives align
   *  (>=2) and distribute (>=3) enablement. */
  selectedCount: number;
```

Add the derivation next to the existing `hasSelection` line:

```ts
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;
```

Add `selectedCount` to the returned object (next to `hasSelection`):

```ts
    hasSelection,
    selectedCount,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/useSelectionStyle.test.tsx`
Expected: PASS (existing cases + the new one).

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/useSelectionStyle.ts src/ui/panels/useSelectionStyle.test.tsx
git commit -m "feat: expose selectedCount from useSelectionStyle"
```

---

### Task 3: `AlignPanel` component + dock registration

The panel itself: two rows (Align, Distribute) of `IconActionGroup` buttons, greyed by `selectedCount`, dispatching via `sel.executeAction`. Registered in the dock. Registration is folded in here because the panel is not reachable without it and the change is one line.

**Files:**
- Create: `src/ui/panels/AlignPanel.tsx`
- Test: `src/ui/panels/AlignPanel.test.tsx`
- Modify: `src/ui/panels/PanelsRoot.tsx` (import + one `defs` entry)

**Interfaces:**
- Consumes: `IconActionGroup` + `ActionOption` (Task 1); `SelectionStyle` with `selectedCount` (Task 2) and the existing `executeAction(name: string, value?: unknown): void`.
- Produces: `export function AlignPanel(props: { sel: SelectionStyle }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Create `src/ui/panels/AlignPanel.test.tsx`. The panel only reads `sel.selectedCount` and calls `sel.executeAction`, so a partial mock cast to `SelectionStyle` is enough — no need to mock `@excalidraw/excalidraw`.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AlignPanel } from "./AlignPanel";
import type { SelectionStyle } from "./useSelectionStyle";

function mockSel(selectedCount: number): { sel: SelectionStyle; executeAction: ReturnType<typeof vi.fn> } {
  const executeAction = vi.fn();
  const sel = { selectedCount, executeAction } as unknown as SelectionStyle;
  return { sel, executeAction };
}

describe("AlignPanel", () => {
  it("dispatches the matching action when an align button is clicked", async () => {
    const { sel, executeAction } = mockSel(2);
    render(<AlignPanel sel={sel} />);
    await userEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(executeAction).toHaveBeenCalledWith("alignLeft");
  });

  it("dispatches distribute actions", async () => {
    const { sel, executeAction } = mockSel(3);
    render(<AlignPanel sel={sel} />);
    await userEvent.click(screen.getByRole("button", { name: "Distribute horizontally" }));
    expect(executeAction).toHaveBeenCalledWith("distributeHorizontally");
  });

  it("greys align (<2) and distribute (<3) rows below their thresholds", () => {
    const { sel } = mockSel(1);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Align left" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();
  });

  it("enables align at 2 but keeps distribute disabled until 3", () => {
    const { sel } = mockSel(2);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Align left" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Distribute vertically" })).toBeDisabled();
  });

  it("enables distribute at 3", () => {
    const { sel } = mockSel(3);
    render(<AlignPanel sel={sel} />);
    expect(screen.getByRole("button", { name: "Distribute vertically" })).toBeEnabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/AlignPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./AlignPanel"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/panels/AlignPanel.tsx`. Icons are hand-rolled inline SVG in the `alignIcon` style already used by `TextPanel` (small `currentColor` marks, `aria-hidden`). Guide line shows the alignment edge; two shapes sit relative to it.

```tsx
import { IconActionGroup, type ActionOption } from "./controls/IconActionGroup";
import type { SelectionStyle } from "./useSelectionStyle";

/** Small inline icon wrapper (18x14, currentColor) matching TextPanel's style. */
function icon(children: React.ReactNode) {
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      {children}
    </svg>
  );
}

const line = (d: string) => (
  <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
);

// Align: a guide line at the target edge + two bars positioned against it.
const ALIGN_LEFT = icon(<>{line("M2 1 V13")}<rect x="3.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_HCENTER = icon(<>{line("M9 1 V13")}<rect x="5.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_RIGHT = icon(<>{line("M16 1 V13")}<rect x="7.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>);
const ALIGN_TOP = icon(<>{line("M1 2 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="3.5" width="3" height="9" fill="currentColor" /></>);
const ALIGN_VCENTER = icon(<>{line("M1 7 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="2.5" width="3" height="9" fill="currentColor" /></>);
const ALIGN_BOTTOM = icon(<>{line("M1 12 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="1.5" width="3" height="9" fill="currentColor" /></>);

// Distribute: three evenly spaced bars along the axis.
const DIST_H = icon(<><rect x="2" y="3" width="2.5" height="8" fill="currentColor" /><rect x="7.75" y="3" width="2.5" height="8" fill="currentColor" /><rect x="13.5" y="3" width="2.5" height="8" fill="currentColor" /></>);
const DIST_V = icon(<><rect x="4" y="2" width="10" height="2.5" fill="currentColor" /><rect x="4" y="5.75" width="10" height="2.5" fill="currentColor" /><rect x="4" y="9.5" width="10" height="2.5" fill="currentColor" /></>);

/**
 * Align panel: align (6) and distribute (2) actions dispatched through the
 * shared executeAction bridge. Align needs >=2 selected, distribute >=3;
 * rows grey out below their threshold. All geometry is Excalidraw's action —
 * flow only dispatches.
 */
export function AlignPanel({ sel }: { sel: SelectionStyle }) {
  const run = (name: string) => () => sel.executeAction(name);

  const alignOptions: ActionOption[] = [
    { key: "left", label: "Align left", icon: ALIGN_LEFT, onClick: run("alignLeft") },
    { key: "hcenter", label: "Align center", icon: ALIGN_HCENTER, onClick: run("alignHorizontallyCentered") },
    { key: "right", label: "Align right", icon: ALIGN_RIGHT, onClick: run("alignRight") },
    { key: "top", label: "Align top", icon: ALIGN_TOP, onClick: run("alignTop") },
    { key: "vcenter", label: "Align middle", icon: ALIGN_VCENTER, onClick: run("alignVerticallyCentered") },
    { key: "bottom", label: "Align bottom", icon: ALIGN_BOTTOM, onClick: run("alignBottom") },
  ];

  const distributeOptions: ActionOption[] = [
    { key: "dh", label: "Distribute horizontally", icon: DIST_H, onClick: run("distributeHorizontally") },
    { key: "dv", label: "Distribute vertically", icon: DIST_V, onClick: run("distributeVertically") },
  ];

  const alignDisabled = sel.selectedCount < 2;
  const distributeDisabled = sel.selectedCount < 3;

  return (
    <div className="flow-align-panel">
      <div className="flow-ctl-row" aria-disabled={alignDisabled || undefined}>
        <span className="flow-ctl-row__label">Align</span>
        <div className="flow-ctl-row__control">
          <IconActionGroup options={alignOptions} ariaLabel="Align" disabled={alignDisabled} />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={distributeDisabled || undefined}>
        <span className="flow-ctl-row__label">Distribute</span>
        <div className="flow-ctl-row__control">
          <IconActionGroup options={distributeOptions} ariaLabel="Distribute" disabled={distributeDisabled} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/AlignPanel.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Register the panel in the dock**

In `src/ui/panels/PanelsRoot.tsx`:

Add the import next to the other panel imports:

```tsx
import { AlignPanel } from "./AlignPanel";
```

Add the def entry between `text` and `layers`:

```tsx
    { id: "text", label: "Text", render: () => <TextPanel sel={sel} /> },
    { id: "align", label: "Align", render: () => <AlignPanel sel={sel} /> },
    { id: "layers", label: "Layers", render: () => <LayersPlaceholder /> },
```

- [ ] **Step 6: Verify the full unit suite is green**

Run: `npx vitest run`
Expected: PASS — all suites, including the new `IconActionGroup`, `AlignPanel`, and `useSelectionStyle` cases.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/AlignPanel.tsx src/ui/panels/AlignPanel.test.tsx src/ui/panels/PanelsRoot.tsx
git commit -m "feat: add Align sub-panel with align/distribute actions"
```

---

### Task 4: e2e coverage

Verify the panel end-to-end in a real browser: the Align sub-panel exists, buttons enable/disable by selection size, clicking dispatches without error, and a screenshot confirms alignment visually. Exact-coordinate assertions are intentionally avoided — there is no window-exposed scene API and autosave is async, so geometry checks would be flaky; correctness of the geometry is Excalidraw's action, which we only dispatch.

**Files:**
- Create: `e2e/align-panel.spec.ts`

**Interfaces:**
- Consumes: the rendered app (`/`), the dock (`.flow-pnl`), toolbar test ids (`toolbar-rectangle`), and the panel buttons by accessible name (`Align left`, `Distribute horizontally`, etc.).
- Produces: nothing consumed by later tasks (final task).

- [ ] **Step 1: Write the failing test**

Create `e2e/align-panel.spec.ts`. Mirror the conventions in `e2e/text-panel.spec.ts` / `e2e/style-panel.spec.ts` (force-click the visually-hidden tool radio; drag on the canvas right of the docked panel). To reach the Align panel, click its title in the accordion so its body is visible before querying buttons.

```ts
import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/97196cc9-5c01-4299-a65a-c305e9b38b42/scratchpad";

/** Draw a rectangle by dragging between two viewport points; leaves it selected. */
async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByTestId("toolbar-rectangle").click({ force: true });
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

/** Reveal the Align sub-panel body (click its accordion title if collapsed). */
async function openAlignPanel(page: Page) {
  const title = page.getByText("Align", { exact: true }).first();
  await title.click();
  await expect(page.getByRole("button", { name: "Align left" })).toBeVisible();
}

test("align buttons are disabled without a 2+ selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await openAlignPanel(page);
  // No selection at all.
  await expect(page.getByRole("button", { name: "Align left" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();

  // A single element is still below the align threshold.
  await drawRect(page, 560, 300, 660, 380);
  await expect(page.getByRole("button", { name: "Align left" })).toBeDisabled();
});

test("align enables with 2 selected and dispatches; distribute needs 3", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await openAlignPanel(page);

  await drawRect(page, 560, 300, 640, 360);
  await drawRect(page, 720, 440, 800, 500);
  await page.keyboard.press("Control+a");

  const alignLeft = page.getByRole("button", { name: "Align left" });
  await expect(alignLeft).toBeEnabled();
  // Distribute needs 3.
  await expect(page.getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();

  await alignLeft.click();
  // Draw a third and select all → distribute enables.
  await drawRect(page, 620, 380, 700, 440);
  await page.keyboard.press("Control+a");
  const distH = page.getByRole("button", { name: "Distribute horizontally" });
  await expect(distH).toBeEnabled();
  await distH.click();

  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/align-panel.png` });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test e2e/align-panel.spec.ts`
Expected: FAIL initially only if a selector is wrong. Since Task 3 is already implemented, this should actually PASS. If it was run before Task 3, it fails at `openAlignPanel` (no "Align left" button). Run it now to confirm GREEN; if any selector mismatches (e.g. the accordion title needs a different locator), fix the locator and re-run.

> TDD note: this task lands after the component exists, so the e2e is a verification gate rather than red-first. If you want a red-first signal, run it once before merging Task 3's registration step.

- [ ] **Step 3: Confirm the screenshot**

Open `${OUT}/align-panel.png` and confirm three rectangles are visibly left-aligned and horizontally distributed. If the icons are hard to read at panel size, adjust the SVG paths in `AlignPanel.tsx` and re-run the unit + e2e suites (legibility is an accepted iteration point per the spec's Risks).

- [ ] **Step 4: Run the full e2e suite**

Run: `npx playwright test`
Expected: PASS — existing specs plus `align-panel.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add e2e/align-panel.spec.ts
git commit -m "test: e2e for the Align sub-panel"
```

---

## Self-Review

**Spec coverage:**
- Align + Distribute rows → Task 3 (options + icons + dispatch). ✓
- New `IconActionGroup` primitive → Task 1. ✓
- Grey-out at <2 / <3 → Task 2 (`selectedCount`) + Task 3 (thresholds) + Tasks 3/4 tests. ✓
- Slot after Text, before Layers → Task 3 Step 5. ✓
- No fork edits → Global Constraints; all actions dispatched via existing `executeAction`. ✓
- Keep Edit ▸ Align submenu → untouched (no task modifies `MenuBar.tsx`). ✓
- Distribute panel-only (not added to Edit menu) → no MenuBar change. ✓
- Icons hand-rolled inline SVG → Task 3 Step 3. ✓
- Tests: primitive unit + selectedCount unit + panel unit + e2e → Tasks 1–4. ✓
- Persisted-layout auto-adoption → covered by existing `syncPanelDefs` (no code needed); documented in Global Constraints. ✓

**Placeholder scan:** One intentional stand-in in Task 2 Step 1 (`renderHookWithApi`) — flagged explicitly because the existing test file's exact mock helper must be reused rather than guessed; the assertion and the mock state shape are concrete. No other placeholders.

**Type consistency:** `ActionOption` / `IconActionGroup` signatures match between Task 1 (definition) and Task 3 (consumption). `selectedCount: number` matches between Task 2 (definition) and Task 3 (use). Action name strings match the fork's registered names listed in the spec table.
