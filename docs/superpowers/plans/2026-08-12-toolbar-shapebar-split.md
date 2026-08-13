# Toolbar / Shapebar Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split flow's single 88px left tool rail into a slim 44px toolbar (9 non-shape tools) and an 80px two-column shapebar (6 shape tools), built from one component, with layouts that no longer change when a rail docks.

**Architecture:** `ToolBar.tsx` generalises into a props-driven `ToolRail`, instantiated twice by a new thin `ToolRails` wrapper that owns the reserved-gutter CSS variable and the dock-slot arithmetic. The tool registry splits into `TOOLS` / `SHAPES` / `ALL_TOOLS`. The docked-vs-floating layout difference is removed by putting the tool grid and footer inside a content wrapper that hugs its content and scrolls, instead of letting the grid absorb a viewport-tall shell.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library (jsdom) for unit/component tests, Playwright for e2e. No new dependencies. Zero Excalidraw fork edits.

Spec: `docs/superpowers/specs/2026-08-12-toolbar-shapebar-split-design.md`

## Global Constraints

- **Zero fork edits.** Nothing in `vendor/excalidraw` is touched by this plan. Every tool is driven through the public `setActiveTool` / `updateScene` API, as today.
- **Widths:** toolbar `44` px (one 36px button column + 4px padding each side), shapebar `80` px (two 36px columns + 4px padding each side). Button size stays `36` px.
- **Toolbar tools, in order:** `selection`, `hand`, `text`, `freedraw`, `line`, `frame`, `image`, `eraser`, `laser`.
- **Shapebar tools, in order:** `arrow`, `arrow-curved`, `arrow-elbow`, `rectangle`, `diamond`, `ellipse`.
- **No tool id, label, or shortcut changes.** `ToolId`, `TOOL_ICONS`, and `useActiveTool` stay as they are. Existing accessible names (`"Rectangle"`, `"Curved arrow"`, `"Toolbar options"`, `"Detach toolbar"`, …) must keep working; the shapebar's equivalents are `"Shapebar options"`, `"Detach shapebar"`, `"Hide shapebar"`, `"Dock shapebar"`.
- **Rail aria-labels:** toolbar `"Tools"` (unchanged), shapebar `"Shapes"`.
- **Persistence keys:** `flow.toolbar` (unchanged) and the new `flow.shapebar`. No migration; stale ids in either `hiddenTools` are inert.
- **Shapebar defaults to visible and docked.** Anything else and the shape tools vanish for existing users on upgrade.
- **The suite stays green after every task.** Task 2 deliberately keeps `ToolRail` rendering all 15 tools so no intermediate commit has missing buttons; Task 7 removes that scaffold.
- Commit messages follow conventional commits (`feat:`, `refactor:`, `test:`, `fix:`, `docs:`).
- Run unit tests with `npx vitest run <path>`, the whole unit suite with `npx vitest run`, typecheck with `npm run typecheck`, e2e with `npx playwright test <path>`. **Kill stray vite servers before trusting e2e** (`pkill -f "vite" || true`) — a known trap in this repo.

---

### Task 1: One shared e2e tool-picking helper

Ten e2e specs each reach rail tools through their own copy of
`page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name, exact: true })`.
Once the shapes move to a second rail, every one of those breaks. Centralise
first, so the split changes one file instead of ten — and so Spec 2's eleven new
shapes don't reintroduce the fan-out.

**Files:**
- Create: `e2e/helpers/rails.ts`
- Modify: `e2e/edit-actions.spec.ts:5-17`, `e2e/number-field.spec.ts:14-23`, `e2e/stroke-panel.spec.ts:5-32`, `e2e/style-memory.spec.ts:25-52`, `e2e/transform-panel.spec.ts:4-13`, `e2e/drawing-defaults.spec.ts:4-13`, `e2e/tool-override.spec.ts:27-32`, `e2e/selection-mode.spec.ts:24-29`, `e2e/toolbar.spec.ts`, `e2e/new-document.spec.ts:44,83`

**Interfaces:**
- Consumes: nothing.
- Produces: `pickTool(page: Page, label: string): Promise<void>` and `railButton(page: Page, label: string): Locator` from `e2e/helpers/rails.ts`.

- [ ] **Step 1: Write the helper**

Create `e2e/helpers/rails.ts`:

```ts
import type { Locator, Page } from "@playwright/test";

/**
 * A tool button in either of flow's rails, by exact accessible name.
 *
 * Scoped to `.flow-toolbar` rather than to a rail's aria-label: the toolbar
 * ("Tools") and the shapebar ("Shapes") share the class, so one locator spans
 * both and callers don't have to know which rail a tool lives in. Scoping at
 * all matters because quick-actions labels substring-collide with tool labels
 * ("Arrow" is inside "Arrow binding").
 *
 * `exact` matters because the arrow tool is three buttons — "Arrow",
 * "Curved arrow", "Elbow arrow" — and a substring match on "Arrow" hits all
 * three.
 */
export function railButton(page: Page, label: string): Locator {
  return page.locator(".flow-toolbar").getByRole("button", { name: label, exact: true });
}

/** Click a tool in either rail. */
export async function pickTool(page: Page, label: string): Promise<void> {
  await railButton(page, label).click();
}
```

- [ ] **Step 2: Verify the helper works against the current single rail**

Refactor one spec first as a canary. In `e2e/transform-panel.spec.ts`, replace the local `draw` body's tool click:

```ts
import { pickTool } from "./helpers/rails";

async function draw(page: Page, tool: string, x2: number, y2: number) {
  await pickTool(page, tool);
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}
```

Run: `pkill -f "vite" || true; npx playwright test e2e/transform-panel.spec.ts`
Expected: PASS, same count as before the change.

- [ ] **Step 3: Refactor the remaining nine specs**

Apply the identical substitution everywhere the rail-scoped locator appears. Each of these keeps its own mouse coordinates — only the click changes:

- `e2e/edit-actions.spec.ts` — `drawWith`
- `e2e/number-field.spec.ts` — `drawWith`
- `e2e/stroke-panel.spec.ts` — `drawWith` **and** `drawFrom`
- `e2e/style-memory.spec.ts` — `draw`, `pickSelection`, `addText`
- `e2e/drawing-defaults.spec.ts` — `draw` (both sites)
- `e2e/tool-override.spec.ts` — `pickTool` (delete the local one, import instead)
- `e2e/selection-mode.spec.ts` — `pickSelection`
- `e2e/new-document.spec.ts:44,83` — inline `Rectangle` clicks
- `e2e/toolbar.spec.ts` — the tool clicks only. **Leave the `getByRole("toolbar", { name: "Tools" })` assertions about the rail itself alone** — those are testing the rail, not reaching through it.

In `e2e/tool-override.spec.ts` the local function has the same name as the import; delete the local definition rather than aliasing.

- [ ] **Step 4: Run the full e2e suite**

Run: `pkill -f "vite" || true; npx playwright test`
Expected: PASS at the current baseline (137 passing, 2 known pre-existing `text-panel.spec.ts` failures — those two are documented as failing on `main` and are not yours to fix).

- [ ] **Step 5: Commit**

```bash
git add e2e/helpers/rails.ts e2e/*.spec.ts
git commit -m "test(e2e): one shared helper for picking rail tools"
```

---

### Task 2: Split the tool registry

`tools.ts` grows a second list, and the quickbar — which derives its tool items
from `TOOLS` — is repointed at the union so the six shapes don't silently
disappear from it as a side effect.

`ToolBar` renders the union too, as temporary scaffolding: this task must not
change what the UI shows. Task 7 replaces it.

**Files:**
- Modify: `src/ui/toolbar/tools.ts:44-60`
- Modify: `src/ui/toolbar/ToolBar.tsx:7,122`
- Modify: `src/ui/toolbar/ToolbarConfigMenu.tsx:3,46`
- Modify: `src/ui/quickbar/actions.ts:4,35`
- Test: `src/ui/toolbar/tools.test.ts`, `src/ui/quickbar/actions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TOOLS: readonly ToolDef[]` (9 entries), `SHAPES: readonly ToolDef[]` (6 entries), `ALL_TOOLS: readonly ToolDef[]` (15 entries) from `src/ui/toolbar/tools.ts`. `ToolDef`, `ToolId`, `ArrowType` unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `src/ui/toolbar/tools.test.ts`:

```ts
import { TOOLS, SHAPES, ALL_TOOLS } from "./tools";
import { TOOL_ICONS } from "./icons";

describe("the toolbar / shapebar split", () => {
  it("puts the nine non-shape tools in TOOLS, in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection",
      "hand",
      "text",
      "freedraw",
      "line",
      "frame",
      "image",
      "eraser",
      "laser",
    ]);
  });

  it("puts the six shape tools in SHAPES, arrows first", () => {
    expect(SHAPES.map((t) => t.id)).toEqual([
      "arrow",
      "arrow-curved",
      "arrow-elbow",
      "rectangle",
      "diamond",
      "ellipse",
    ]);
  });

  it("shares no id between the two lists", () => {
    const shapeIds = new Set(SHAPES.map((t) => t.id));
    expect(TOOLS.filter((t) => shapeIds.has(t.id))).toEqual([]);
  });

  it("ALL_TOOLS is both lists and nothing else", () => {
    expect(ALL_TOOLS).toHaveLength(TOOLS.length + SHAPES.length);
    expect(new Set(ALL_TOOLS.map((t) => t.id)).size).toBe(ALL_TOOLS.length);
  });

  it("has an icon for every tool in both lists", () => {
    for (const t of ALL_TOOLS) {
      expect(TOOL_ICONS[t.id], `missing icon for ${t.id}`).toBeTruthy();
    }
  });

  it("keeps the arrow variants mapped to the arrow tool", () => {
    const curved = SHAPES.find((t) => t.id === "arrow-curved");
    expect(curved).toMatchObject({ toolType: "arrow", arrowType: "round", shortcut: "" });
  });
});
```

Append to `src/ui/quickbar/actions.test.ts`:

```ts
import { ALL_TOOLS } from "../toolbar/tools";
import { TOOL_ITEM_IDS } from "./actions";

it("offers every tool from both rails as a quickbar item", () => {
  expect([...TOOL_ITEM_IDS].sort()).toEqual([...ALL_TOOLS.map((t) => t.id)].sort());
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/toolbar/tools.test.ts src/ui/quickbar/actions.test.ts`
Expected: FAIL — `SHAPES`/`ALL_TOOLS` are not exported from `./tools`.

- [ ] **Step 3: Split the registry**

Replace the `TOOLS` array in `src/ui/toolbar/tools.ts` (lines 39-60) with:

```ts
/** The toolbar's tools, rendered top-to-bottom. Everything that isn't a shape:
 *  pointers, text, freehand, line, frame, image and the two transient tools.
 *  Shortcuts mirror Excalidraw's defaults. */
export const TOOLS: readonly ToolDef[] = [
  { id: "selection", label: "Selection", shortcut: "V" },
  { id: "hand", label: "Hand (pan)", shortcut: "H" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "freedraw", label: "Draw", shortcut: "P" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "frame", label: "Frame", shortcut: "F" },
  { id: "image", label: "Image", shortcut: "9" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
  { id: "laser", label: "Laser pointer", shortcut: "K" },
];

/** The shapebar's tools, rendered top-to-bottom in a two-column grid. The arrow
 *  tool is split into three shape variants (sharp / curved / elbow); all three
 *  share Excalidraw's underlying `"arrow"` tool and differ only in the
 *  `currentItemArrowType` default they set, so new arrows are drawn with that
 *  shape. Pressing `A` repeatedly cycles them (native Excalidraw behaviour),
 *  which is why curved and elbow carry no shortcut of their own. */
export const SHAPES: readonly ToolDef[] = [
  { id: "arrow", label: "Arrow", shortcut: "A", arrowType: "sharp" },
  { id: "arrow-curved", label: "Curved arrow", shortcut: "", toolType: "arrow", arrowType: "round" },
  { id: "arrow-elbow", label: "Elbow arrow", shortcut: "", toolType: "arrow", arrowType: "elbow" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
];

/** Every tool flow surfaces, both rails. Consumers that care about the whole
 *  set rather than about one rail — the quick-actions bar's tool items — read
 *  this, so a tool moving between rails never silently drops out of them. */
export const ALL_TOOLS: readonly ToolDef[] = [...TOOLS, ...SHAPES];
```

- [ ] **Step 4: Repoint the three consumers**

`src/ui/quickbar/actions.ts` line 4 and line 34-35:

```ts
import { ALL_TOOLS, type ToolId } from "../toolbar/tools";

/** Tool items derived from the rails' ALL_TOOLS (DRY) — same ids/labels/
 *  shortcuts, spanning the toolbar and the shapebar. */
const TOOL_ITEMS: readonly QuickItem[] = ALL_TOOLS.map((t) => ({
```

`src/ui/toolbar/ToolBar.tsx` line 7 and line 122 — scaffolding, removed in Task 7:

```ts
// TEMPORARY (Task 2 → removed in Task 7): the rail still renders every tool so
// this commit changes no UI. Task 7 hands each rail its own list as a prop.
import { ALL_TOOLS } from "./tools";
```

```tsx
        {ALL_TOOLS.filter((t) => !state.hiddenTools.includes(t.id)).map((t) => {
```

`src/ui/toolbar/ToolbarConfigMenu.tsx` line 3 and line 46 — same scaffolding:

```ts
import { ALL_TOOLS } from "./tools";
```

```ts
  const rows = ALL_TOOLS.map((t) => ({ id: t.id as string, label: t.label }));
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/toolbar src/ui/quickbar && npm run typecheck`
Expected: PASS. `ToolBar.test.tsx` still passes unchanged — it asserts buttons exist, and all 15 still render.

- [ ] **Step 6: Commit**

```bash
git add src/ui/toolbar/tools.ts src/ui/toolbar/tools.test.ts src/ui/toolbar/ToolBar.tsx src/ui/toolbar/ToolbarConfigMenu.tsx src/ui/quickbar/actions.ts src/ui/quickbar/actions.test.ts
git commit -m "refactor(toolbar): split the tool registry into TOOLS and SHAPES"
```

---

### Task 3: Rail geometry as pure functions

The widths, the reserved gutter, the shapebar's dock offset, and the redock test
all become pure functions before any component reads them. Nothing renders
differently yet.

**Files:**
- Modify: `src/ui/toolbar/rail-layout.ts` (replaces `RAIL_WIDTH`)
- Modify: `src/ui/toolbar/toolbar-state.ts:50-53` (`shouldRedock` gains a slot)
- Modify: `src/ui/toolbar/ToolBar.tsx:14,30,58,96-97`, `src/ui/toolbar/RailColorControl.tsx:6,79`, `src/App.tsx:53,465`, `src/ui/toolbar/ToolBar.test.tsx:5,138-146`
- Test: Create `src/ui/toolbar/rail-layout.test.ts`; modify `src/ui/toolbar/toolbar-state.test.ts`

**Interfaces:**
- Consumes: `ToolbarState` from `./toolbar-state`.
- Produces, from `src/ui/toolbar/rail-layout.ts`:
  - `TOOL_RAIL_WIDTH: 44`, `SHAPE_RAIL_WIDTH: 80`
  - `isRailDocked(s: ToolbarState): boolean`
  - `railGutter(toolbar: ToolbarState, shapebar: ToolbarState): number`
  - `shapebarDockLeft(toolbar: ToolbarState): number`
  - From `./toolbar-state`: `shouldRedock(dropX: number, slotX: number, margin?: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/toolbar/rail-layout.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TOOL_RAIL_WIDTH,
  SHAPE_RAIL_WIDTH,
  isRailDocked,
  railGutter,
  shapebarDockLeft,
} from "./rail-layout";
import { DEFAULT_TOOLBAR_STATE } from "./toolbar-state";

const docked = DEFAULT_TOOLBAR_STATE;
const floating = { ...DEFAULT_TOOLBAR_STATE, floating: true };
const hidden = { ...DEFAULT_TOOLBAR_STATE, visible: false };

describe("rail widths", () => {
  it("is 44px for the toolbar — one 36px column plus padding", () => {
    expect(TOOL_RAIL_WIDTH).toBe(44);
  });

  it("is 80px for the shapebar — two 36px columns plus padding", () => {
    expect(SHAPE_RAIL_WIDTH).toBe(80);
  });
});

describe("isRailDocked", () => {
  it("needs both visible and not floating", () => {
    expect(isRailDocked(docked)).toBe(true);
    expect(isRailDocked(floating)).toBe(false);
    expect(isRailDocked(hidden)).toBe(false);
  });
});

describe("railGutter", () => {
  it("sums both docked rails", () => {
    expect(railGutter(docked, docked)).toBe(124);
  });

  it("counts only the docked one", () => {
    expect(railGutter(docked, floating)).toBe(44);
    expect(railGutter(hidden, docked)).toBe(80);
  });

  it("reserves nothing when neither is docked", () => {
    expect(railGutter(floating, hidden)).toBe(0);
  });
});

describe("shapebarDockLeft", () => {
  it("clears a docked toolbar", () => {
    expect(shapebarDockLeft(docked)).toBe(44);
  });

  it("slides to the screen edge when the toolbar is floating or hidden", () => {
    expect(shapebarDockLeft(floating)).toBe(0);
    expect(shapebarDockLeft(hidden)).toBe(0);
  });
});
```

Replace the `shouldRedock` block in `src/ui/toolbar/toolbar-state.test.ts` with:

```ts
describe("shouldRedock", () => {
  it("redocks a drop at or left of its own slot", () => {
    expect(shouldRedock(0, 0)).toBe(true);
    expect(shouldRedock(44, 44)).toBe(true);
    expect(shouldRedock(20, 44)).toBe(true);
  });

  it("redocks a drop just short of the slot's margin", () => {
    expect(shouldRedock(9, 0)).toBe(true);
    expect(shouldRedock(53, 44)).toBe(false);
  });

  it("leaves a drop out past the margin floating", () => {
    expect(shouldRedock(300, 0)).toBe(false);
    expect(shouldRedock(300, 44)).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/toolbar/rail-layout.test.ts src/ui/toolbar/toolbar-state.test.ts`
Expected: FAIL — `TOOL_RAIL_WIDTH` is not exported, and `shouldRedock` takes one argument.

- [ ] **Step 3: Rewrite rail-layout.ts**

Replace the whole file:

```ts
// src/ui/toolbar/rail-layout.ts

import type { ToolbarState } from "./toolbar-state";

/** Docked toolbar width: one 36px button column plus 4px padding each side. */
export const TOOL_RAIL_WIDTH = 44;

/** Docked shapebar width: two 36px button columns plus 4px padding each side.
 *  Two columns because the shapebar grows to seventeen tools once the new
 *  parametric shapes land, and a single column of seventeen runs off a laptop
 *  screen. */
export const SHAPE_RAIL_WIDTH = 80;

/** A rail occupies a dock slot only when it is both shown and not torn off. */
export function isRailDocked(state: ToolbarState): boolean {
  return state.visible && !state.floating;
}

/**
 * Total left gutter the canvas must inset by, in px.
 *
 * Pure so the two callers cannot drift: `ToolRails` writes it to
 * `--flow-toolbar-reserved`, and App passes the same number to the bottom bar
 * so its dock offset clears both rails.
 */
export function railGutter(toolbar: ToolbarState, shapebar: ToolbarState): number {
  return (
    (isRailDocked(toolbar) ? TOOL_RAIL_WIDTH : 0) +
    (isRailDocked(shapebar) ? SHAPE_RAIL_WIDTH : 0)
  );
}

/**
 * The shapebar's docked left edge. Slots collapse: hide or float the toolbar
 * and the docked shapebar slides to the screen edge rather than leaving a hole.
 */
export function shapebarDockLeft(toolbar: ToolbarState): number {
  return isRailDocked(toolbar) ? TOOL_RAIL_WIDTH : 0;
}
```

- [ ] **Step 4: Give `shouldRedock` the slot**

In `src/ui/toolbar/toolbar-state.ts`, replace lines 50-53:

```ts
/**
 * Whether a floating rail dropped with its left edge at `dropX` should re-dock
 * into the slot whose left edge is `slotX`.
 *
 * The slot is a parameter because the shapebar's slot is not at 0 — it sits to
 * the right of a docked toolbar. Testing against the screen edge instead would
 * make a floating shapebar impossible to re-dock by dragging.
 */
export function shouldRedock(
  dropX: number,
  slotX: number,
  margin: number = REDOCK_MARGIN,
): boolean {
  return dropX - slotX < margin;
}
```

- [ ] **Step 5: Update the five call sites**

`src/ui/toolbar/ToolBar.tsx` — swap the constant and pass slot 0 (this component becomes props-driven in Task 5; for now it is the toolbar, whose slot is always 0):

```ts
import { TOOL_RAIL_WIDTH } from "./rail-layout";
```

Line 30 → `left: (r?.right ?? TOOL_RAIL_WIDTH) + 4`.
Line 58 → `const reserved = state.visible && !state.floating ? TOOL_RAIL_WIDTH : 0;`
Lines 96-97 → `width: TOOL_RAIL_WIDTH` in both branches.
Line 89 → `if (shouldRedock(origin.current.x + m.dx, 0)) onChange({ ...state, floating: false });`

`src/ui/toolbar/RailColorControl.tsx` line 6 and 79:

```ts
import { TOOL_RAIL_WIDTH } from "./rail-layout";
```

```ts
    return { top: r?.top ?? 0, left: (r?.right ?? TOOL_RAIL_WIDTH) + POPUP_GAP };
```

`src/App.tsx` line 53 — swap the import:

```ts
import { railGutter } from "./ui/toolbar/rail-layout";
```

There is no shapebar state until Task 7, so add a module-level constant below the imports and pass it as the absent second rail:

```ts
/** Placeholder for the not-yet-wired shapebar (Task 7 replaces it with real
 *  state). Absent, so `railGutter` reserves the toolbar's width alone —
 *  exactly what App reserved before. */
const NO_SHAPEBAR: ToolbarState = { ...DEFAULT_TOOLBAR_STATE, visible: false };
```

Line 465 becomes:

```tsx
        toolbarReserved={railGutter(toolbar, NO_SHAPEBAR)}
```

`src/ui/toolbar/ToolBar.test.tsx` line 5 and lines 138-146 — the width assertion moves to `rail-layout.test.ts`, so delete the `is 88px wide` test and repoint the gutter ones:

```ts
import { TOOL_RAIL_WIDTH } from "./rail-layout";
```

```ts
  it("reserves the canvas gutter at the docked width", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe(`${TOOL_RAIL_WIDTH}px`);
  });
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/toolbar && npm run typecheck`
Expected: PASS.

The rail is now 44px wide while still holding 15 tools in two columns — visually cramped, and that is expected mid-plan. Tasks 6 and 7 resolve it. Do not "fix" it here.

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar/rail-layout.ts src/ui/toolbar/rail-layout.test.ts src/ui/toolbar/toolbar-state.ts src/ui/toolbar/toolbar-state.test.ts src/ui/toolbar/ToolBar.tsx src/ui/toolbar/ToolBar.test.tsx src/ui/toolbar/RailColorControl.tsx src/App.tsx
git commit -m "refactor(toolbar): rail geometry as pure functions, slot-aware redock"
```

---

### Task 4: Shapebar persistence

A second `flow.shapebar` key reusing the existing state shape and normaliser.

**Files:**
- Modify: `src/ui/toolbar/toolbar-state.ts:14-20`
- Modify: `src/app/preferences.ts:84-94`
- Test: `src/app/preferences.test.ts`

**Interfaces:**
- Consumes: `normalizeToolbarState`, `ToolbarState`.
- Produces: `DEFAULT_SHAPEBAR_STATE: ToolbarState` from `src/ui/toolbar/toolbar-state.ts`; `getShapebarState(): ToolbarState` and `setShapebarState(value: ToolbarState): void` from `src/app/preferences.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/app/preferences.test.ts` (follow the file's existing localStorage setup — it already clears storage between tests):

```ts
import { getShapebarState, setShapebarState } from "./preferences";
import { DEFAULT_SHAPEBAR_STATE } from "../ui/toolbar/toolbar-state";

describe("shapebar state", () => {
  it("defaults to shown and docked so the shape tools never vanish on upgrade", () => {
    expect(DEFAULT_SHAPEBAR_STATE).toMatchObject({ visible: true, floating: false });
    expect(DEFAULT_SHAPEBAR_STATE.hiddenTools).toEqual([]);
  });

  it("round-trips through its own key", () => {
    setShapebarState({ ...DEFAULT_SHAPEBAR_STATE, floating: true, x: 300, y: 120 });
    expect(getShapebarState()).toMatchObject({ floating: true, x: 300, y: 120 });
  });

  it("does not share storage with the toolbar", () => {
    setShapebarState({ ...DEFAULT_SHAPEBAR_STATE, hiddenTools: ["diamond"] });
    expect(localStorage.getItem("flow.shapebar")).toContain("diamond");
    expect(localStorage.getItem("flow.toolbar") ?? "").not.toContain("diamond");
  });

  it("falls back to the default on a junk payload", () => {
    localStorage.setItem("flow.shapebar", "{not json");
    expect(getShapebarState()).toEqual(DEFAULT_SHAPEBAR_STATE);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getShapebarState` is not exported.

- [ ] **Step 3: Add the default state**

In `src/ui/toolbar/toolbar-state.ts`, after `DEFAULT_TOOLBAR_STATE`:

```ts
/** The shapebar's factory state. Structurally identical to the toolbar's, but a
 *  separate object: Reset Layout copies each one independently, and the two are
 *  free to diverge later without a shared literal to untangle. Visible by
 *  default — anything else and the shape tools disappear on upgrade. */
export const DEFAULT_SHAPEBAR_STATE: ToolbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  hiddenTools: [],
};
```

- [ ] **Step 4: Add the accessors**

In `src/app/preferences.ts`, after the toolbar block (line 94):

```ts
const SHAPEBAR_KEY = "flow.shapebar";

/** Read the persisted shapebar state, normalized (default on miss/parse error).
 *  Same shape and normaliser as the toolbar's — the two rails differ in what
 *  they contain, not in what they persist. */
export function getShapebarState(): ToolbarState {
  return normalizeToolbarState(readJson(SHAPEBAR_KEY));
}

/** Persist the shapebar state. */
export function setShapebarState(value: ToolbarState): void {
  writeJson(SHAPEBAR_KEY, value);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/app/preferences.test.ts src/ui/toolbar && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/toolbar/toolbar-state.ts src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat(toolbar): persist shapebar layout under flow.shapebar"
```

---

### Task 5: Generalise `ToolBar` into `ToolRail` + a `ToolRails` wrapper

Pure refactor. One rail still renders, holding all 15 tools, and every existing
test must pass with only its import path and props changed.

**Files:**
- Rename: `src/ui/toolbar/ToolBar.tsx` → `src/ui/toolbar/ToolRail.tsx` (use `git mv`)
- Rename: `src/ui/toolbar/ToolBar.test.tsx` → `src/ui/toolbar/ToolRail.test.tsx`
- Create: `src/ui/toolbar/ToolRails.tsx`, `src/ui/toolbar/ToolRails.test.tsx`
- Modify: `src/ui/toolbar/ToolbarConfigMenu.tsx`, `src/ui/toolbar/ToolbarConfigMenu.test.tsx`, `src/ui/toolbar/RailColorControl.tsx:79`, `src/App.tsx:52,450`

**Interfaces:**
- Consumes: `TOOLS`/`SHAPES`/`ALL_TOOLS`, `railGutter`, `shapebarDockLeft`, `TOOL_RAIL_WIDTH`, `shouldRedock`, `useActiveTool`, `RailColorControl`, `useSelectionStyle`.
- Produces:
  - `ToolRail(props: ToolRailProps)` from `src/ui/toolbar/ToolRail.tsx`, where
    `ToolRailProps = { api: ExcalidrawAPI | null; tools: readonly ToolDef[]; width: number; columns: number; label: string; noun: string; dockLeft: number; state: ToolbarState; onChange: (next: ToolbarState) => void; footer?: ReactNode }`
  - `ToolRails(props: ToolRailsProps)` from `src/ui/toolbar/ToolRails.tsx`, where
    `ToolRailsProps = { api: ExcalidrawAPI | null; toolbar: ToolbarState; onToolbarChange: (next: ToolbarState) => void; shapebar: ToolbarState; onShapebarChange: (next: ToolbarState) => void }`
  - `ToolbarConfigMenu` gains a `noun: string` prop.

- [ ] **Step 1: Rename the files**

```bash
git mv src/ui/toolbar/ToolBar.tsx src/ui/toolbar/ToolRail.tsx
git mv src/ui/toolbar/ToolBar.test.tsx src/ui/toolbar/ToolRail.test.tsx
```

- [ ] **Step 2: Write the failing test for the new component**

Create `src/ui/toolbar/ToolRails.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolRails } from "./ToolRails";
import { DEFAULT_TOOLBAR_STATE, DEFAULT_SHAPEBAR_STATE } from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi() {
  return {
    getSceneElements: () => [],
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      currentItemArrowType: "sharp",
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      selectedElementIds: {},
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

function renderRails(
  toolbar = DEFAULT_TOOLBAR_STATE,
  shapebar = { ...DEFAULT_SHAPEBAR_STATE, visible: false },
) {
  return render(
    <ToolRails
      api={fakeApi()}
      toolbar={toolbar}
      onToolbarChange={() => {}}
      shapebar={shapebar}
      onShapebarChange={() => {}}
    />,
  );
}

describe("ToolRails", () => {
  it("mounts the toolbar", () => {
    renderRails();
    expect(screen.getByRole("toolbar", { name: "Tools" })).toBeInTheDocument();
  });

  it("gives the toolbar the color control", () => {
    const { container } = renderRails();
    expect(container.querySelector(".flow-toolbar__color")).toBeInTheDocument();
  });

  it("reserves the gutter for the docked rails", () => {
    renderRails();
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("44px");
  });

  it("reserves nothing when the toolbar is floating", () => {
    renderRails({ ...DEFAULT_TOOLBAR_STATE, floating: true });
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("0px");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/ui/toolbar/ToolRails.test.tsx`
Expected: FAIL — cannot resolve `./ToolRails`.

- [ ] **Step 4: Convert `ToolRail` to props**

In `src/ui/toolbar/ToolRail.tsx`: rename the component, replace the props
interface, delete the `useSelectionStyle` call and the `RailColorControl`
element (both move to `ToolRails`), delete the gutter effect (moves to
`ToolRails`), and read `width` / `columns` / `label` / `noun` / `dockLeft` from
props. The finished file:

```tsx
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./toolbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import type { ToolDef } from "./tools";
import { TOOL_ICONS } from "./icons";
import { ToolButton } from "./ToolButton";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { useActiveTool } from "./useActiveTool";
import { shouldRedock, withHiddenToggled, type ToolbarState } from "./toolbar-state";

const MENUBAR_H = 36;
/** On first detach, drop the rail this far below the menu bar so its drag grip
 *  clears the top main menu and stays reachable. */
const DETACH_GAP = 12;
/** Bottom breathing room for a floating rail's max-height, so a tall one
 *  scrolls inside itself instead of running off the viewport. */
const FLOAT_BOTTOM_GAP = 8;

interface ToolRailProps {
  api: ExcalidrawAPI | null;
  /** The tools this rail renders, top to bottom. */
  tools: readonly ToolDef[];
  /** Rail width in px, docked or floating. */
  width: number;
  /** Button grid column count. */
  columns: number;
  /** aria-label for the toolbar role ("Tools" / "Shapes"). */
  label: string;
  /** Lowercase noun for the menu strings ("toolbar" / "shapebar"). */
  noun: string;
  /** Left edge when docked. Non-zero for a rail that sits after another. */
  dockLeft: number;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
  /** Pinned under the tool grid. The toolbar passes the color control here. */
  footer?: ReactNode;
}

/**
 * Flow-native vertical tool rail, instantiated once per rail by `ToolRails`.
 * Docked to the left edge by default; can be torn off into a floating strip
 * (drag the top bar) or docked/undocked and have tools shown/hidden from the
 * hamburger menu. Drives tool selection through the public Excalidraw API; the
 * native island is hidden via CSS.
 */
export function ToolRail({
  api,
  tools,
  width,
  columns,
  label,
  noun,
  dockLeft,
  state,
  onChange,
  footer,
}: ToolRailProps) {
  const { activeType, arrowType, setTool } = useActiveTool(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  /** Anchor the config dropdown just to the right of the rail's top-left. */
  const configAnchor = (): MenuPoint => {
    const r = shellRef.current?.getBoundingClientRect();
    return { top: r?.top ?? MENUBAR_H, left: (r?.right ?? dockLeft + width) + 4 };
  };

  // Close the config menu on any outside pointer press (mirrors PanelShell).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-toolbar__hamburger")) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onTopbarPointerDown = useDrag({
    onStart: (e) => {
      // Don't start a drag from the hamburger button.
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? 0, y: r?.top ?? MENUBAR_H };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      // Against this rail's own slot, not the screen edge — the shapebar's slot
      // sits to the right of a docked toolbar.
      if (shouldRedock(origin.current.x + m.dx, dockLeft)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? {
        width,
        top: state.y,
        left: state.x,
        maxHeight: `calc(100vh - ${state.y}px - ${FLOAT_BOTTOM_GAP}px)`,
      }
    : { width, top: MENUBAR_H, left: dockLeft, bottom: 0 };

  const Noun = noun[0].toUpperCase() + noun.slice(1);

  return (
    <div
      ref={shellRef}
      className={`flow-toolbar ${state.floating ? "flow-toolbar--floating" : "flow-toolbar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label={label}
      aria-orientation="vertical"
    >
      <div className="flow-toolbar__topbar" onPointerDown={onTopbarPointerDown}>
        <span className="flow-toolbar__grip" aria-hidden="true">⠿</span>
        <button
          type="button"
          className="flow-toolbar__iconbtn flow-toolbar__hamburger"
          aria-label={`${Noun} options`}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
      </div>

      <div
        className="flow-toolbar__tools"
        style={{ "--flow-rail-cols": columns } as CSSProperties}
      >
        {tools
          .filter((t) => !state.hiddenTools.includes(t.id))
          .map((t) => {
            const toolType = t.toolType ?? t.id;
            // Arrow variants share activeType "arrow"; disambiguate on the shape.
            const active =
              activeType === toolType && (t.arrowType === undefined || arrowType === t.arrowType);
            return (
              <ToolButton
                key={t.id}
                icon={TOOL_ICONS[t.id]}
                label={t.label}
                shortcut={t.shortcut}
                active={active}
                onClick={() => setTool(toolType, t.arrowType)}
              />
            );
          })}
      </div>

      {footer}

      {menuOpen && (
        <ToolbarConfigMenu
          floating={state.floating}
          noun={noun}
          tools={tools}
          hiddenTools={state.hiddenTools}
          anchor={configAnchor()}
          onToggleFloating={() => {
            if (state.floating) {
              onChange({ ...state, floating: false });
            } else {
              // Detach in place, but keep the top (and its drag grip) clear of
              // the main menu bar so the rail stays reachable/movable.
              const r = shellRef.current?.getBoundingClientRect();
              const x = Math.round(r?.left ?? dockLeft);
              const y = Math.max(Math.round(r?.top ?? MENUBAR_H), MENUBAR_H + DETACH_GAP);
              onChange({ ...state, floating: true, x, y });
            }
            setMenuOpen(false);
          }}
          onToggleTool={(id) => onChange(withHiddenToggled(state, id))}
          onHide={() => {
            onChange({ ...state, visible: false });
            setMenuOpen(false);
          }}
        />
      )}
    </div>
  );
}
```

Note: `configAnchor` became a closure over `dockLeft`/`width` instead of a
module-level function, since it now needs both.

- [ ] **Step 5: Make the config menu list-driven**

In `src/ui/toolbar/ToolbarConfigMenu.tsx`, drop the `ALL_TOOLS` import and take
the list plus the noun as props:

```ts
import type { ToolDef } from "./tools";

interface ToolbarConfigMenuProps {
  floating: boolean;
  /** Lowercase rail noun for the action labels ("toolbar" / "shapebar"). */
  noun: string;
  /** The rail's tools — one show/hide checkbox each. */
  tools: readonly ToolDef[];
  hiddenTools: string[];
  /** Ideal top-left (near the hamburger); clamped into the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onToggleTool: (id: string) => void;
  /** Hide the whole rail (mirrors View ▸ Show Toolbar / Show Shapebar). */
  onHide: () => void;
}
```

Destructure `noun` and `tools`, then:

```ts
  const rows = tools.map((t) => ({ id: t.id as string, label: t.label }));
```

and in the JSX:

```tsx
        {floating ? `Dock ${noun}` : `Detach ${noun}`}
```

```tsx
        Hide {noun}
```

- [ ] **Step 6: Write `ToolRails`**

Create `src/ui/toolbar/ToolRails.tsx`:

```tsx
import { useEffect } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useSelectionStyle } from "../panels/useSelectionStyle";
import { ToolRail } from "./ToolRail";
import { RailColorControl } from "./RailColorControl";
import { TOOLS, SHAPES } from "./tools";
import type { ToolbarState } from "./toolbar-state";
import {
  TOOL_RAIL_WIDTH,
  SHAPE_RAIL_WIDTH,
  railGutter,
  shapebarDockLeft,
} from "./rail-layout";

interface ToolRailsProps {
  api: ExcalidrawAPI | null;
  toolbar: ToolbarState;
  onToolbarChange: (next: ToolbarState) => void;
  shapebar: ToolbarState;
  onShapebarChange: (next: ToolbarState) => void;
}

/**
 * Mounts flow's two left rails and owns everything that spans them: the
 * reserved canvas gutter, the dock-slot arithmetic, and the selection-style
 * bridge the toolbar's color control needs.
 *
 * The `useSelectionStyle` call lives here rather than in App for the reason
 * documented on `useActiveTool`'s call site: an onChange-driven state bump in
 * App re-renders `<Excalidraw>`, whose `componentDidUpdate` re-fires `onChange`
 * whether or not anything changed — a tight, un-terminating loop. Every other
 * onChange bridge in this codebase lives in a sibling of `<Excalidraw>`, never
 * in App, and this one follows the same rule.
 */
export function ToolRails({
  api,
  toolbar,
  onToolbarChange,
  shapebar,
  onShapebarChange,
}: ToolRailsProps) {
  const sel = useSelectionStyle(api);

  // Reserve the left gutter so the canvas insets around the docked rails
  // (keeping Excalidraw's bottom-left zoom/undo controls clear). Single writer:
  // ToolRail is mounted twice and would otherwise race over this one variable.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--flow-toolbar-reserved", `${railGutter(toolbar, shapebar)}px`);
    return () => {
      root.style.removeProperty("--flow-toolbar-reserved");
    };
  }, [toolbar, shapebar]);

  return (
    <>
      <ToolRail
        api={api}
        tools={TOOLS}
        width={TOOL_RAIL_WIDTH}
        columns={1}
        label="Tools"
        noun="toolbar"
        dockLeft={0}
        state={toolbar}
        onChange={onToolbarChange}
        footer={<RailColorControl sel={sel} />}
      />
      <ToolRail
        api={api}
        tools={SHAPES}
        width={SHAPE_RAIL_WIDTH}
        columns={2}
        label="Shapes"
        noun="shapebar"
        dockLeft={shapebarDockLeft(toolbar)}
        state={shapebar}
        onChange={onShapebarChange}
      />
    </>
  );
}
```

This already renders both rails; Task 7 wires App's state and menus to it. Until
then `ToolRails.test.tsx` passes `visible: false` for the shapebar, and App
still mounts the old single rail — which is why the next step keeps App on
`ToolRail` directly.

- [ ] **Step 7: Point App at `ToolRails`**

App must not mount `ToolRail` directly — it would have to call
`useSelectionStyle` for the color control's `sel`, which is the
`<Excalidraw>` onChange loop. Mount the wrapper, with the shapebar still
absent via Task 3's `NO_SHAPEBAR`.

In `src/App.tsx`, replace the `<ToolBar …>` element at line 450:

```tsx
      {/* Task 5 scaffold: the shapebar is not wired until Task 7, so it is
          passed as absent and its onChange is a no-op. */}
      <ToolRails
        api={excalidrawApi}
        toolbar={toolbar}
        onToolbarChange={setToolbar}
        shapebar={NO_SHAPEBAR}
        onShapebarChange={() => {}}
      />
```

and the import at line 52:

```ts
import { ToolRails } from "./ui/toolbar/ToolRails";
```

`ToolRails` hands the toolbar `TOOLS`, so the visible result of this commit is a
44px rail with the 9 non-shape tools and **no way to reach the shapes** — Task 7
lands the shapebar. Consequently **this task's e2e run is expected to fail on
shape-tool specs; do not try to fix e2e here.** The unit suite must still be
green.

- [ ] **Step 8: Update the moved unit tests**

In `src/ui/toolbar/ToolRail.test.tsx`: import `ToolRail`, and give every
`render` the new required props via a local helper:

```tsx
import { ToolRail } from "./ToolRail";
import { ALL_TOOLS, TOOLS, SHAPES } from "./tools";
import { TOOL_RAIL_WIDTH } from "./rail-layout";
import {
  DEFAULT_TOOLBAR_STATE,
  DEFAULT_SHAPEBAR_STATE,
  type ToolbarState,
} from "./toolbar-state";

function renderRail(
  state = DEFAULT_TOOLBAR_STATE,
  api = fakeApi(),
  onChange: (next: ToolbarState) => void = () => {},
  tools = ALL_TOOLS,
) {
  return render(
    <ToolRail
      api={api}
      tools={tools}
      width={TOOL_RAIL_WIDTH}
      columns={1}
      label="Tools"
      noun="toolbar"
      dockLeft={0}
      state={state}
      onChange={onChange}
    />,
  );
}
```

Then: replace each `render(<ToolBar … />)` with the helper; delete the two
gutter tests and the color-control DOM-order test (both now belong to
`ToolRails` — the gutter ones were added there in Step 2, and the color-control
one is re-added in Task 6 against the content wrapper); and add:

```tsx
  it("renders only the tools it is handed", () => {
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi(), () => {}, TOOLS);
    expect(screen.getByRole("button", { name: "Laser pointer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rectangle" })).toBeNull();
  });

  it("labels its hamburger and menu from the noun", () => {
    render(
      <ToolRail
        api={fakeApi()}
        tools={SHAPES}
        width={80}
        columns={2}
        label="Shapes"
        noun="shapebar"
        dockLeft={44}
        state={DEFAULT_SHAPEBAR_STATE}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Shapes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shapebar options" })).toBeInTheDocument();
  });

  it("renders a footer only when given one", () => {
    const { container } = renderRail();
    expect(container.querySelector(".flow-toolbar__color")).toBeNull();
  });
```

In `src/ui/toolbar/ToolbarConfigMenu.test.tsx`, add the `noun` and `tools` props
to its render calls and assert the list is what was passed:

```tsx
  it("lists one checkbox per tool it is given, named from the noun", () => {
    render(
      <ToolbarConfigMenu
        floating={false}
        noun="shapebar"
        tools={SHAPES}
        hiddenTools={[]}
        anchor={{ top: 0, left: 0 }}
        onToggleFloating={() => {}}
        onToggleTool={() => {}}
        onHide={() => {}}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "Detach shapebar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Hide shapebar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Diamond")).toBeInTheDocument();
    expect(screen.queryByLabelText("Laser pointer")).toBeNull();
  });
```

- [ ] **Step 9: Run the unit suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS. e2e is knowingly red until Task 7.

- [ ] **Step 10: Commit**

```bash
git add src/ui/toolbar src/App.tsx
git commit -m "refactor(toolbar): ToolRail takes its tools as props, ToolRails mounts them"
```

---

### Task 6: Stop the layout shifting when a rail docks

The docked shell stays viewport-tall — that is where the accepted white space
comes from — but its contents stop stretching into it.

**Files:**
- Modify: `src/ui/toolbar/ToolRail.tsx` (wrap the grid + footer)
- Modify: `src/ui/toolbar/toolbar.css:81-127`
- Test: `src/ui/toolbar/ToolRail.test.tsx`, `src/ui/toolbar/ToolRails.test.tsx`

**Interfaces:**
- Consumes: `ToolRail`'s existing props.
- Produces: a `.flow-toolbar__content` element wrapping `.flow-toolbar__tools` and the footer.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/toolbar/ToolRail.test.tsx`:

```tsx
  it("wraps the tool grid in a content box so a docked rail does not stretch it", () => {
    const { container } = renderRail();
    const content = container.querySelector(".flow-toolbar__content");
    expect(content).toBeInTheDocument();
    expect(content!.querySelector(".flow-toolbar__tools")).toBeInTheDocument();
  });

  it("drives the grid column count from the columns prop", () => {
    const { container } = renderRail();
    const grid = container.querySelector<HTMLElement>(".flow-toolbar__tools");
    expect(grid!.style.getPropertyValue("--flow-rail-cols")).toBe("1");
  });

  it("caps a floating rail's height so a tall one scrolls instead of overflowing", () => {
    const { container } = renderRail({ ...DEFAULT_TOOLBAR_STATE, floating: true, y: 100 });
    const shell = container.querySelector<HTMLElement>(".flow-toolbar");
    expect(shell!.style.maxHeight).toBe("calc(100vh - 100px - 8px)");
  });
```

Add to `src/ui/toolbar/ToolRails.test.tsx`:

```tsx
  it("puts the color control inside the content box, after the tool grid", () => {
    // Asserting only that the radiogroup exists would pass even if it were
    // mounted above the tool grid, or outside the content box where a docked
    // rail's stretch would shove it to the foot.
    const { container } = renderRails();
    const content = container.querySelector(".flow-toolbar__content")!;
    const tools = content.querySelector(".flow-toolbar__tools")!;
    const color = content.querySelector(".flow-toolbar__color");
    expect(color).toBeInTheDocument();
    expect(tools.compareDocumentPosition(color!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/toolbar/ToolRail.test.tsx src/ui/toolbar/ToolRails.test.tsx`
Expected: FAIL — no `.flow-toolbar__content` element.

- [ ] **Step 3: Add the content wrapper**

In `src/ui/toolbar/ToolRail.tsx`, wrap the grid and the footer:

```tsx
      {/* Content box, not a bare grid: a docked shell is viewport-tall, and a
          stretching grid is what used to make the docked layout differ from the
          floating one. `flex: 0 1 auto` hugs the content and only shrinks (into
          a scroll) when the tools genuinely don't fit. */}
      <div className="flow-toolbar__content">
        <div
          className="flow-toolbar__tools"
          style={{ "--flow-rail-cols": columns } as CSSProperties}
        >
          {tools
            .filter((t) => !state.hiddenTools.includes(t.id))
            .map((t) => {
              /* …unchanged… */
            })}
        </div>
        {footer}
      </div>
```

- [ ] **Step 4: Rewrite the CSS**

In `src/ui/toolbar/toolbar.css`, replace the block from `/* Tool button grid (two columns). */` through the end of the file:

```css
/*
 * Content box: tool grid plus the optional footer.
 *
 * A docked rail's shell runs to the bottom of the viewport (that's where its
 * background and right hairline come from), but its contents must not — the
 * rail used to lay out differently docked than floating because this grid was
 * `flex: 1 1 auto` and absorbed that height, and the color footer's
 * `margin-top: auto` then rode it to the very bottom of the screen. `0 1 auto`
 * hugs the content in both modes, and only shrinks — into a scroll — when the
 * tools genuinely don't fit the available height.
 */
.flow-toolbar__content {
  display: flex;
  flex-direction: column;
  align-self: stretch;
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
}

/* Tool button grid. Fixed 36px tracks, not `1fr`: `1fr` tracks resize with the
   shell, which is the other half of the docked/floating mismatch. */
.flow-toolbar__tools {
  display: grid;
  grid-template-columns: repeat(var(--flow-rail-cols, 1), 36px);
  justify-content: center;
  gap: 2px;
  padding: 4px;
}
.flow-toolbar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--flow-radius-sm);
  background: transparent;
  color: var(--flow-ink);
  cursor: pointer;
  transition: background var(--flow-dur-fast) var(--flow-ease),
    color var(--flow-dur-fast) var(--flow-ease);
}
.flow-toolbar__btn:hover {
  background: var(--flow-hover);
}
.flow-toolbar__btn[data-active] {
  background: var(--flow-active);
  color: var(--flow-accent);
}

/* Directly under the tool grid — docked and floating alike. No `margin-top:
   auto`: pinning it to the shell's foot is exactly the shift this removes. */
.flow-toolbar__color {
  display: flex;
  justify-content: center;
  flex-shrink: 0;
  padding: 8px 4px;
  border-top: 1px solid var(--flow-border);
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/ui/toolbar && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Look at it**

Run: `npm run dev`, open the app, and confirm by eye: the 9 toolbar tools sit in one 44px column with the color chooser directly beneath them and empty rail below; tear the rail off with the grip and the tools + chooser occupy the same positions relative to the rail's top. Then stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar/ToolRail.tsx src/ui/toolbar/toolbar.css src/ui/toolbar/ToolRail.test.tsx src/ui/toolbar/ToolRails.test.tsx
git commit -m "fix(toolbar): identical layout docked and floating"
```

---

### Task 7: The shapebar goes live

App owns a second rail state, the View menu gains its pair of entries, Reset
Layout covers it, and the Task 2/3/5 scaffolds come out.

**Files:**
- Modify: `src/App.tsx:16-18,53,112-140,401-418,450,465`
- Modify: `src/ui/menubar/MenuBar.tsx:28-34,238-247,265-275`
- Modify: `src/ui/toolbar/ToolRails.test.tsx`
- Test: `src/ui/menubar/MenuBar.test.tsx` (add to the existing View-menu tests)

**Interfaces:**
- Consumes: `getShapebarState`/`setShapebarState`, `DEFAULT_SHAPEBAR_STATE`, `ToolRails`, `railGutter`.
- Produces: `MenuBar` props `isShapebarVisible?: boolean`, `onToggleShapebar?: () => void`, `isShapebarFloating?: boolean`, `onDockShapebar?: () => void`.

- [ ] **Step 1: Write the failing tests**

In `src/ui/toolbar/ToolRails.test.tsx`, change the default so both rails are visible and assert the pairing:

```tsx
function renderRails(
  toolbar = DEFAULT_TOOLBAR_STATE,
  shapebar = DEFAULT_SHAPEBAR_STATE,
) { /* …as before… */ }

describe("two rails", () => {
  it("mounts the shapebar with the shape tools and no color control", () => {
    renderRails();
    const shapes = screen.getByRole("toolbar", { name: "Shapes" });
    expect(shapes.querySelector(".flow-toolbar__color")).toBeNull();
    expect(
      screen.getByRole("toolbar", { name: "Shapes" }).querySelector(".flow-toolbar__tools"),
    ).toBeInTheDocument();
  });

  it("keeps the shape tools out of the toolbar", () => {
    renderRails();
    const tools = screen.getByRole("toolbar", { name: "Tools" });
    expect(tools.textContent).not.toContain("Rectangle");
  });

  it("reserves both widths when both are docked", () => {
    renderRails();
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("124px");
  });

  it("docks the shapebar clear of the toolbar", () => {
    const { container } = renderRails();
    const shapes = container.querySelectorAll<HTMLElement>(".flow-toolbar")[1];
    expect(shapes.style.left).toBe("44px");
  });

  it("slides the shapebar to the edge when the toolbar is hidden", () => {
    const { container } = renderRails({ ...DEFAULT_TOOLBAR_STATE, visible: false });
    const shapes = container.querySelector<HTMLElement>(".flow-toolbar")!;
    expect(shapes.style.left).toBe("0px");
  });
});
```

In `src/ui/menubar/MenuBar.test.tsx`, add inside the existing `describe("MenuBar")`. The file's shared fixture is called `props` (not `baseProps`) — reuse it, don't invent one:

```tsx
  it("toggles the shapebar from the View menu", async () => {
    const user = userEvent.setup();
    const onToggleShapebar = vi.fn();
    render(<MenuBar {...props} isShapebarVisible onToggleShapebar={onToggleShapebar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(screen.getByRole("menuitemcheckbox", { name: "Show Shapebar" }));
    expect(onToggleShapebar).toHaveBeenCalled();
  });

  it("offers Dock Shapebar only while the shapebar floats", async () => {
    const user = userEvent.setup();
    render(<MenuBar {...props} isShapebarFloating={false} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    expect(screen.getByRole("menuitem", { name: "Dock Shapebar" })).toHaveAttribute(
      "data-disabled",
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/ui/toolbar/ToolRails.test.tsx src/ui/menubar/MenuBar.test.tsx`
Expected: FAIL — the shapebar renders nothing (App-side state absent from the wrapper's defaults is fine, but "Show Shapebar" does not exist).

- [ ] **Step 3: Add the MenuBar entries**

In `src/ui/menubar/MenuBar.tsx`, add to the props interface beside the toolbar's four (lines 28-34), keeping the existing comment style:

```ts
  /** Whether the shapebar is shown (View ▸ Show Shapebar checkbox state). */
  isShapebarVisible?: boolean;
  /** Toggle the shapebar's visibility. */
  onToggleShapebar?: () => void;
  /** Whether the shapebar is torn off (enables View ▸ Dock Shapebar). */
  isShapebarFloating?: boolean;
  /** Re-dock the floating shapebar. */
  onDockShapebar?: () => void;
```

Insert a checkbox item directly after `Show Toolbar` (line 245):

```tsx
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isShapebarVisible ?? true}
              onCheckedChange={() => props.onToggleShapebar?.()}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">
                ✓
              </Menubar.ItemIndicator>
              Show Shapebar
            </Menubar.CheckboxItem>
```

and an item directly after `Dock Toolbar` (line 273):

```tsx
            <Menubar.Item
              className="flow-menu__item"
              disabled={!props.isShapebarFloating}
              onSelect={() => props.onDockShapebar?.()}
            >
              Dock Shapebar
            </Menubar.Item>
```

- [ ] **Step 4: Wire App**

`src/App.tsx` — imports (line 16-18 area, and drop the Task 3/5 scaffolds):

```ts
  getShapebarState, setShapebarState,
```

```ts
import { DEFAULT_TOOLBAR_STATE, DEFAULT_SHAPEBAR_STATE, type ToolbarState } from "./ui/toolbar/toolbar-state";
import { ToolRails } from "./ui/toolbar/ToolRails";
import { railGutter } from "./ui/toolbar/rail-layout";
```

State, after the toolbar's block (line 117):

```tsx
  // Shapebar layout/config. Same ownership pattern as the tool rail: App owns it
  // so the View menu can read visibility. Persisted to flow.shapebar.
  const [shapebar, setShapebar] = useState<ToolbarState>(() => getShapebarState());
  useEffect(() => {
    setShapebarState(shapebar);
  }, [shapebar]);
```

Reset Layout (line 137):

```tsx
    setShapebar({ ...DEFAULT_SHAPEBAR_STATE, hiddenTools: [...DEFAULT_SHAPEBAR_STATE.hiddenTools] });
```

MenuBar props, after `onDockToolbar` (line 404):

```tsx
        isShapebarVisible={shapebar.visible}
        onToggleShapebar={() => setShapebar((s) => ({ ...s, visible: !s.visible }))}
        isShapebarFloating={shapebar.floating}
        onDockShapebar={() => setShapebar((s) => ({ ...s, floating: false }))}
```

The rails (line 450) — replacing the Task 5 scaffold and deleting `NO_SHAPEBAR`:

```tsx
      <ToolRails
        api={excalidrawApi}
        toolbar={toolbar}
        onToolbarChange={setToolbar}
        shapebar={shapebar}
        onShapebarChange={setShapebar}
      />
```

Bottom bar (line 465):

```tsx
        toolbarReserved={railGutter(toolbar, shapebar)}
```

- [ ] **Step 5: Remove the Task 2 scaffold**

`src/ui/toolbar/ToolRail.tsx` and `ToolbarConfigMenu.tsx` no longer import from
`./tools` at all except for the `ToolDef` type — verify with:

Run: `grep -n "ALL_TOOLS" src/ --include=*.tsx --include=*.ts -r`
Expected: hits only in `src/ui/toolbar/tools.ts`, `src/ui/quickbar/actions.ts`, `src/ui/toolbar/tools.test.ts`, `src/ui/quickbar/actions.test.ts`, and `ToolRail.test.tsx`'s helper. Any hit in `ToolRail.tsx`, `ToolbarConfigMenu.tsx` or `App.tsx` is leftover scaffolding — delete it.

- [ ] **Step 6: Run the unit suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Look at it**

Run: `npm run dev`. Confirm: two docked rails, shapebar flush against the
toolbar's right edge; the canvas starts at 124px; View ▸ Show Toolbar off slides
the shapebar to the edge; each rail's hamburger says "toolbar" or "shapebar"
respectively; View ▸ Reset Layout restores both. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/ui/menubar/MenuBar.tsx src/ui/menubar/MenuBar.test.tsx src/ui/toolbar/ToolRails.test.tsx src/ui/toolbar/ToolRail.tsx src/ui/toolbar/ToolbarConfigMenu.tsx
git commit -m "feat(toolbar): the shapebar, docked beside the toolbar"
```

---

### Task 8: e2e coverage and the memory ledger

Everything jsdom cannot see: real dock geometry, drag, and the layout invariance
that motivated the work.

**Files:**
- Create: `e2e/shapebar.spec.ts`
- Modify: `e2e/toolbar.spec.ts`, `e2e/color-panel.spec.ts:487,505,512,519,527,533,583`
- Modify: `.claude/memory/vertical-toolbar.md`, `.claude/memory/MEMORY.md`

**Interfaces:**
- Consumes: `pickTool`/`railButton` from `e2e/helpers/rails.ts`.
- Produces: nothing.

- [ ] **Step 1: Move the arrow tests to the shapes rail**

In `e2e/toolbar.spec.ts`, the two arrow tests (lines 21-56) reach shape tools
through the `"Tools"` rail. Repoint their rail locator:

```ts
    const rail = page.getByRole("toolbar", { name: "Shapes" });
```

The `"selecting a tool marks it active"` test (lines 14-19) uses Rectangle;
switch it to a tool the toolbar still owns:

```ts
  test("selecting a tool marks it active", async ({ page }) => {
    await page.goto("/");
    const line = page.getByRole("toolbar", { name: "Tools" }).getByRole("button", {
      name: "Line",
      exact: true,
    });
    await line.click();
    await expect(line).toHaveAttribute("aria-pressed", "true");
  });
```

The `"hamburger hides a tool"` test (line 70) already uses `Frame`, a toolbar
tool — leave it alone.

- [ ] **Step 2: Scope every bare `.flow-toolbar*` selector to one rail**

Two rails mean two elements match `.flow-toolbar` and `.flow-toolbar__grip`, and
Playwright's strict mode fails a single-element action on a multi-match locator.
This is the trap that will otherwise fail specs far from the ones you edited.

In `e2e/toolbar.spec.ts` lines 88 and 104, scope the grip to the rail under test:

```ts
    const grip = rail.locator(".flow-toolbar__grip");
```

In `e2e/color-panel.spec.ts`, five sites need the same treatment. Add a helper at
the top of the file and use it everywhere a bare rail selector appears:

```ts
/** The toolbar, specifically. The shapebar shares `.flow-toolbar`, so a bare
 *  class selector now matches two elements and trips Playwright's strict mode. */
const toolRail = (page: Page) => page.getByRole("toolbar", { name: "Tools" });
```

- Line 487 (`"the rail's outer edge meets the canvas"`) — the toolbar's right edge is 44px, but the reserved gutter is now the sum of *both* rails, so the test must measure the outermost docked rail. Repoint it at the shapebar and keep the intent (border-box: outer edge exactly meets the canvas):

```ts
  const rail = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
```

- Line 505 (`grip`) → `const grip = toolRail(page).locator(".flow-toolbar__grip");`
- Lines 512 and 519 (`.flow-toolbar--floating` / `--docked`) — after the toolbar floats, the docked shapebar still matches `--docked`. Assert on the class of the rail under test instead:

```ts
  await expect(toolRail(page)).toHaveClass(/flow-toolbar--floating/);
```
```ts
  await expect(toolRail(page)).toHaveClass(/flow-toolbar--docked/);
```

- Line 527 (`expect(await reserved()).toBe("88px")`) → `"124px"`, both rails docked.
- Line 533 (`expect(page.locator(".flow-toolbar")).toHaveCount(0)`) — hiding the toolbar leaves the shapebar, so the gutter drops to the shapebar's width, not zero:

```ts
  await expect(toolRail(page)).toHaveCount(0);
  expect(await reserved()).toBe("80px");
```

  Rename that test to `"hiding the toolbar reclaims its share of the canvas gutter"`.

- Line 583 → `await expect(toolRail(page).getByRole("radio")).toHaveCount(3);` and line 586's `document.querySelector(".flow-toolbar")` → `document.querySelector('[aria-label="Tools"]')`.

Run: `pkill -f "vite" || true; npx playwright test e2e/color-panel.spec.ts`
Expected: PASS.

- [ ] **Step 3: Add the width and layout-invariance tests**

Append to the `vertical tool bar` describe in `e2e/toolbar.spec.ts`:

```ts
  test("is 44px wide", async ({ page }) => {
    await page.goto("/");
    const box = await page.getByRole("toolbar", { name: "Tools" }).boundingBox();
    expect(Math.round(box!.width)).toBe(44);
  });

  test("lays its tools out identically docked and floating", async ({ page }) => {
    // The regression this refactor exists to prevent: the docked shell is
    // viewport-tall, and the tool grid used to absorb that height while the
    // color footer rode it to the bottom of the screen.
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const grid = rail.locator(".flow-toolbar__tools");
    const color = rail.locator(".flow-toolbar__color");

    const dockedRail = (await rail.boundingBox())!;
    const dockedGrid = (await grid.boundingBox())!;
    const dockedColor = (await color.boundingBox())!;

    // Tear off by the grip (the topbar's centre sits over the hamburger), scoped
    // to this rail — the shapebar has a grip of its own.
    await rail.locator(".flow-toolbar__grip").hover();
    await page.mouse.down();
    await page.mouse.move(400, 300, { steps: 10 });
    await page.mouse.up();
    await expect(rail).toHaveCSS("position", "fixed");

    const floatRail = (await rail.boundingBox())!;
    const floatGrid = (await grid.boundingBox())!;
    const floatColor = (await color.boundingBox())!;

    // Same size, and the same offset from the rail's own top-left.
    expect(Math.round(floatGrid.width)).toBe(Math.round(dockedGrid.width));
    expect(Math.round(floatGrid.height)).toBe(Math.round(dockedGrid.height));
    expect(Math.round(floatGrid.y - floatRail.y)).toBe(Math.round(dockedGrid.y - dockedRail.y));
    expect(Math.round(floatColor.y - floatRail.y)).toBe(Math.round(dockedColor.y - dockedRail.y));
  });
```

- [ ] **Step 4: Run the toolbar spec**

Run: `pkill -f "vite" || true; npx playwright test e2e/toolbar.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the shapebar spec**

Create `e2e/shapebar.spec.ts`:

```ts
import { test, expect } from "@playwright/test";
import { railButton } from "./helpers/rails";

test.describe("shapebar", () => {
  test("docks to the right of the toolbar, below the menu bar", async ({ page }) => {
    await page.goto("/");
    const tools = page.getByRole("toolbar", { name: "Tools" });
    const shapes = page.getByRole("toolbar", { name: "Shapes" });
    await expect(shapes).toBeVisible();

    const t = (await tools.boundingBox())!;
    const s = (await shapes.boundingBox())!;
    expect(Math.round(s.x)).toBe(Math.round(t.x + t.width)); // flush, no gap
    expect(Math.round(s.width)).toBe(80);
    expect(s.y).toBeGreaterThanOrEqual(30);
  });

  test("insets the canvas by both rail widths", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();
    const reserved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved"),
    );
    expect(reserved.trim()).toBe("124px");
  });

  test("holds the shape tools and selects them", async ({ page }) => {
    await page.goto("/");
    const rect = railButton(page, "Rectangle");
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
    // The toolbar must not also carry it.
    await expect(
      page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Rectangle", exact: true }),
    ).toHaveCount(0);
  });

  test("slides to the screen edge when the toolbar is hidden", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    expect(s.x).toBeLessThan(5);
  });

  test("tears off and re-docks into its own slot", async ({ page }) => {
    await page.goto("/");
    const shapes = page.getByRole("toolbar", { name: "Shapes" });
    const grip = shapes.locator(".flow-toolbar__grip");

    await grip.hover();
    await page.mouse.down();
    await page.mouse.move(500, 320, { steps: 10 });
    await page.mouse.up();
    let box = (await shapes.boundingBox())!;
    expect(box.x).toBeGreaterThan(200);

    // Dropping near its slot (x≈44, to the right of the docked toolbar) re-docks
    // it — the reason shouldRedock takes the slot rather than testing x < 10.
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move(46, 60, { steps: 10 });
    await page.mouse.up();
    box = (await shapes.boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(box.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides from its own hamburger and persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("menuitem", { name: "Hide shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    // The toolbar is untouched by the shapebar's own key.
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  });

  test("View ▸ Show Shapebar brings it back and Reset Layout re-docks it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();

    // Float it, then let Reset Layout put it back in its slot.
    const grip = page.getByRole("toolbar", { name: "Shapes" }).locator(".flow-toolbar__grip");
    await grip.hover();
    await page.mouse.down();
    await page.mouse.move(600, 400, { steps: 10 });
    await page.mouse.up();

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Reset Layout" }).click();
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(s.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides one shape from its hamburger without touching the toolbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("checkbox", { name: "Diamond" }).uncheck();
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await page.reload();
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await expect(railButton(page, "Rectangle")).toBeVisible();
  });
});
```

- [ ] **Step 6: Run the whole e2e suite**

Run: `pkill -f "vite" || true; npx playwright test`
Expected: PASS, except the two known pre-existing `text-panel.spec.ts` failures. If any *other* spec fails, it is reaching a shape tool through the `"Tools"` rail — repoint it through `railButton` from Task 1's helper.

- [ ] **Step 7: Update the memory ledger**

Rewrite the "Shipped" bullets in `.claude/memory/vertical-toolbar.md` that this
plan invalidates, and add a section recording:

- One `ToolRail` component, two instances, mounted by `ToolRails` — which is also the single writer of `--flow-toolbar-reserved` (two instances would race over it) and the home of `useSelectionStyle` (App cannot call it: the `<Excalidraw>` onChange loop).
- `TOOLS` (9) / `SHAPES` (6) / `ALL_TOOLS` (15); the quickbar reads `ALL_TOOLS`, and **that is load-bearing** — reading `TOOLS` silently drops the six shapes from the quickbar's item registry.
- Widths 44 / 80 and the gutter sum 124; slots collapse when a rail hides or floats.
- `shouldRedock(dropX, slotX)` — the slot argument is what makes a floating shapebar re-dockable at all.
- The docked/floating layout fix: `.flow-toolbar__content` is `flex: 0 1 auto`, the grid uses fixed 36px tracks not `1fr`, and `.flow-toolbar__color` lost `margin-top: auto`. Restoring any one of those three brings the shift back.
- `e2e/helpers/rails.ts` scopes to `.flow-toolbar` so one locator spans both rails — the reason the split touched ten specs once instead of every future shape touching them again.
- `flow.shapebar`, no migration; stale ids in either `hiddenTools` are inert.

Add the one-line pointer to `.claude/memory/MEMORY.md` if the shapebar warrants
its own entry, or extend the existing `[Vertical toolbar]` line's hook to
mention the split.

- [ ] **Step 8: Final verification**

Run: `npx vitest run && npm run typecheck && pkill -f "vite" || true; npx playwright test`
Expected: unit green, typecheck clean, e2e green but for the two known `text-panel.spec.ts` failures. Record the actual counts in the commit body.

- [ ] **Step 9: Commit**

```bash
git add e2e/shapebar.spec.ts e2e/toolbar.spec.ts .claude/memory/
git commit -m "test(e2e): shapebar docking, and the docked-equals-floating invariant"
```

## Post-implementation amendments

Recorded during the final whole-branch review fix wave, so a future reader
diffing this plan against the shipped code trusts the code, not the plan text
below.

1. **Task 3's `shouldRedock(53, 44) === false` was arithmetically impossible.**
   With the default `REDOCK_MARGIN = 10`, `shouldRedock(dropX, slotX)` is
   `dropX - slotX < margin`. `53 - 44 = 9`, and `9 < 10` is `true` — the exact
   opposite of what the plan's test asserted. The shipped test
   (`src/ui/toolbar/toolbar-state.test.ts`) uses `shouldRedock(54, 44)`
   instead: `54 - 44 = 10`, which is not `< 10`, so `false` is the correct,
   reachable boundary case. Any future edit to this block should use `54`, not
   copy `53` back out of this plan.

2. **Task 5 was framed as a pure refactor ("every existing test must pass with
   only its import path and props changed") but it wasn't one.** It shipped
   with the floating-rail `FLOAT_BOTTOM_GAP` max-height clamp — new behavior,
   not present on the pre-split single rail — and that clamp shipped without a
   lower bound, which the final review's MINOR 7 fixed by wrapping it in
   `max(MIN_FLOAT_H, …)` (`src/ui/toolbar/ToolRail.tsx`). Read Task 5 as
   "mostly a refactor, plus one piece of genuinely new layout behavior," not
   as behavior-preserving in full.

3. **The spec's single `label` prop was split into two.** `ToolRailProps` in
   the design spec has one `label: string` documented as "aria-label + the
   noun in the hamburger's 'Hide …' item." The implementation instead has
   `label` (the `aria-label` on the `role="toolbar"` element, e.g. "Tools" /
   "Shapes") and a separate `noun` (the lowercase word used in menu strings,
   e.g. "toolbar" / "shapebar" — "Detach toolbar", "Hide shapebar"). This is
   the better call: "Tools" cannot substitute for "toolbar" in "Hide Tools"
   without reading wrong, and the two needed to vary independently. Go by
   `ToolRailProps` in `src/ui/toolbar/ToolRail.tsx`, not the spec's interface
   block.

4. **The floating clamp shipped as an inline style, not the spec's CSS
   variable.** The spec describes floating rails getting
   `max-height: calc(100vh - var(--flow-rail-top) - 8px)` in the stylesheet,
   with a `--flow-rail-top` custom property supplying the rail's own top
   offset. No such variable exists anywhere in the shipped code. Instead,
   `ToolRail.tsx` computes the whole `max-height` value inline from
   `state.y` (the rail's own tracked floating position) each render:
   `` `max(${MIN_FLOAT_H}px, calc(100vh - ${state.y}px - ${FLOAT_BOTTOM_GAP}px))` ``
   (the `max(...)` floor is the MINOR 7 addition from item 2 above). This
   avoids a CSS custom property that would need its own write-site and
   avoids a re-render-vs-repaint sync question the spec's version didn't
   address; there is nothing named `--flow-rail-top` to search for in the
   stylesheet.
