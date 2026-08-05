# Drawing defaults + tight selection box — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New shapes draw with square corners, the stroke-width slider spans 0–10px with a safe zero, and selection chrome hugs element bounds.

**Architecture:** Two flow-level changes (an `initialData.appState` seed and slider bounds) plus two additive `vendor/excalidraw` fork edits (zero-width stroke safety in the rough-options builder, and a new `SELECTION_SPACING` constant replacing the transform-handle padding at the five selection-chrome sites). No schema or file-format change; no edits inside `components/App.tsx`.

**Tech Stack:** React 19 + TypeScript + Vite, Vitest + React Testing Library for units, Playwright for e2e, `@excalidraw/excalidraw` consumed as a `file:` dependency from the `vendor/excalidraw` git submodule.

**Source spec:** `docs/superpowers/specs/2026-08-04-drawing-defaults-and-tight-selection-design.md`

## Global Constraints

- **The 2px stroke default already ships.** Verified live on 2026-08-04: a freshly drawn rectangle *and* a freshly drawn arrow both report `2` in the Stroke panel, because `DEFAULT_ELEMENT_PROPS.strokeWidth` is `2` (`vendor/excalidraw/packages/excalidraw/constants.ts:394`) and `appState.ts:46` seeds `currentItemStrokeWidth` from it. **No task changes this default** — Task 3 only corrects a stale `?? 1` display fallback.
- **Vendor builds require node 20–22.** The repo's default node 25 fails on `marked@16`. `.nvmrc` pins 22: `source ~/.nvm/nvm.sh && nvm use`.
- **Never `rm -rf` the vendor `dist/` without regenerating types.** `buildPackage.js` alone emits no `.d.ts`, and flow's `tsc` then can't resolve the package.
- **Do not change `DEFAULT_TRANSFORM_HANDLE_SPACING`** (`constants.ts:185`). `SIDE_RESIZING_THRESHOLD` (`:187`) and `DEFAULT_COLLISION_THRESHOLD` derive from it and govern edge-resize tolerance and hit-testing.
- **Fork edits must be additive and stay out of `components/App.tsx`** — the fork rides upstream and is rebased, per `.claude/memory/flow-fork-strategy.md`.
- **Submodule changes need two commits:** one inside `vendor/excalidraw` on branch `flow`, then a parent-repo commit recording the new gitlink. The vendor `dist/` is gitignored, so an uncommitted submodule edit is not durable.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/App.tsx` | Modify (~line 426) | Seed `currentItemRoundness: "sharp"` in `initialData.appState` |
| `src/ui/panels/StrokePanel.tsx` | Modify (lines 7–9, 135) | Stroke slider bounds 0–10px; correct the display fallback |
| `src/ui/panels/StrokePanel.test.tsx` | Create | Unit-cover the slider bounds and fallback |
| `e2e/drawing-defaults.spec.ts` | Create | Fresh-element defaults + the zero-stroke safety case |
| `e2e/stroke-panel.spec.ts` | Modify | Extend for the new 0–10 range |
| `vendor/.../excalidraw/scene/Shape.ts` | Modify (lines 57–86) | Zero-width stroke safety in `generateRoughOptions` |
| `vendor/.../excalidraw/constants.ts` | Modify (after line 187) | New `SELECTION_SPACING` constant |
| `vendor/.../excalidraw/element/transformHandles.ts` | Modify (lines 11–21, 133, 305–318) | Tight handle placement for every element type |
| `vendor/.../excalidraw/renderer/interactiveScene.ts` | Modify (lines 34, 377, 1076) | Tight selection borders |
| `.claude/memory/drawing-defaults.md` | Create | Repo-local memory + `MEMORY.md` pointer |

---

## Task 1: Square corners on new shapes

Excalidraw ships `currentItemRoundness: "sharp"`'s opposite — `"round"` (`appState.ts:43`) — and the adaptive algorithm applies a fixed 32px radius. Verified live: a fresh rectangle reports a corner radius of **32**.

**Files:**
- Modify: `src/App.tsx:426`
- Test: `e2e/drawing-defaults.spec.ts` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the `draw(page, tool, x2, y2)` Playwright helper, reused by Task 3's spec additions in the same file.

- [ ] **Step 1: Write the failing test**

Create `e2e/drawing-defaults.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

/** Draw a shape with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: tool, exact: true })
    .click();
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test("a fresh rectangle has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  // Excalidraw ships currentItemRoundness "round" → an adaptive 32px radius.
  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("a fresh diamond has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Diamond", 760, 480);

  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("the Transform panel still rounds a shape on demand", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("16");
  await radius.blur();
  await expect(radius).toHaveValue("16");
});
```

Note the label is `"Corner radius"`, not `"Corner radius value"` — the Transform panel's radius row uses `NumberInput` (`TransformPanel.tsx:162`), which labels the field directly, unlike `SliderInput`, which suffixes `" value"` onto its numeric field.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:e2e -- e2e/drawing-defaults.spec.ts
```

Expected: the first two tests FAIL with the radius reading `"32"` instead of `"0"`. The third test PASSES already — it guards against over-correcting into "rounding is broken".

- [ ] **Step 3: Write the minimal implementation**

In `src/App.tsx`, inside the `initialData.appState` object, immediately after the `objectsSnapModeEnabled: true,` entry (line 426):

```tsx
              // flow draws new shapes with square corners. Excalidraw ships
              // "round", whose adaptive algorithm applies a fixed 32px radius
              // that reads as enormous on small boxes. Per-object rounding
              // still lives in the Transform panel. Native field; no cast.
              currentItemRoundness: "sharp",
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm run test:e2e -- e2e/drawing-defaults.spec.ts
```

Expected: all three PASS.

- [ ] **Step 5: Run the full unit suite for regressions**

```bash
npm test -- --run && npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx e2e/drawing-defaults.spec.ts
git commit -m "feat(defaults): draw new shapes with square corners

Excalidraw ships currentItemRoundness \"round\", whose adaptive algorithm
applies a fixed 32px radius. Seed \"sharp\" instead; the Transform panel
still rounds per-object."
```

---

## Task 2: Fork — zero-width stroke safety

Prepares the vendor for Task 3's slider floor of 0. Landing this **before** the slider change means no commit ever exposes a reachable hang.

Two independent hazards, both in `generateRoughOptions`:

1. **Fill degeneration.** `fillWeight: strokeWidth / 2` and `hachureGap: strokeWidth * 4` collapse to 0. roughjs then clamps the gap to 0.1px (`node_modules/roughjs/bin/fillers/scan-line-hachure.js:9`), generating tens of thousands of fill lines. flow's own UI exposes no fill-style control and `DEFAULT_ELEMENT_PROPS.fillStyle` is `"solid"`, so this is only reachable through an **opened `.excalidraw` document** carrying hachure or cross-hatch elements — still reachable, and cheap to close off.
2. **Stroke render.** `node_modules/roughjs/bin/canvas.js:18` assigns `ctx.lineWidth = o.strokeWidth` directly, and canvas ignores a non-positive `lineWidth`, retaining the previous draw's value. A 0-width shape would paint a stray hairline at an arbitrary width.

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/scene/Shape.ts:57-86`

**Interfaces:**
- Consumes: nothing.
- Produces: the guarantee that `strokeWidth === 0` renders no outline and never degenerates a fill — Task 3 depends on it.

- [ ] **Step 1: Read the current options block**

```bash
sed -n '57,90p' vendor/excalidraw/packages/excalidraw/scene/Shape.ts
```

Confirm it still matches the "before" below. If upstream has moved, adapt rather than force the patch.

- [ ] **Step 2: Apply the edit**

Before:

```ts
export const generateRoughOptions = (
  element: ExcalidrawElement,
  continuousPath = false,
): Options => {
  const options: Options = {
    seed: element.seed,
```

After:

```ts
export const generateRoughOptions = (
  element: ExcalidrawElement,
  continuousPath = false,
): Options => {
  // flow: floor the fill maths at 1px. flow's stroke slider reaches 0, and a
  // 0 hachureGap makes roughjs clamp to a 0.1px gap (fillers/scan-line-
  // hachure.ts), generating tens of thousands of fill lines and hanging the
  // canvas on hachure/cross-hatch elements from an opened document.
  const fillBase = Math.max(element.strokeWidth, 1);

  const options: Options = {
    seed: element.seed,
```

Then, in the same object literal, before:

```ts
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    roughness: adjustRoughness(element),
    stroke: element.strokeColor,
```

After:

```ts
    fillWeight: fillBase / 2,
    hachureGap: fillBase * 4,
    roughness: adjustRoughness(element),
    // flow: a 0 stroke width means "no outline". Required because roughjs
    // assigns ctx.lineWidth directly and canvas ignores a non-positive
    // lineWidth, keeping the previous draw's value — so a 0-width shape would
    // otherwise paint a stray hairline. roughjs maps "none" to transparent.
    stroke: element.strokeWidth === 0 ? "none" : element.strokeColor,
```

Leave the `strokeWidth:` entry above untouched — the non-solid `+ 0.5` bump is upstream behavior and still correct.

- [ ] **Step 3: Typecheck and lint the fork**

```bash
source ~/.nvm/nvm.sh && nvm use
cd vendor/excalidraw && yarn test:typecheck && yarn eslint --max-warnings=0 packages/excalidraw/scene/Shape.ts
```

Expected: no errors attributable to this edit. `test:typecheck` prints pre-existing upstream `cornerRadius`/`Point` noise — ignore those; they predate this change.

- [ ] **Step 4: Rebuild the vendor package**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build:excalidraw
```

Expected: completes and refreshes `vendor/excalidraw/packages/excalidraw/dist`. If iterating, the fast path is `cd vendor/excalidraw/packages/excalidraw && node ../../scripts/buildPackage.js` — it must be run **from that directory** (entry points are relative) and it emits **no** `.d.ts`, so never pair it with deleting `dist/`.

- [ ] **Step 5: Verify flow still builds against the rebuilt package**

```bash
npm run typecheck && npm test -- --run
```

Expected: PASS.

- [ ] **Step 6: Commit the submodule, then the pointer**

```bash
git -C vendor/excalidraw add packages/excalidraw/scene/Shape.ts
git -C vendor/excalidraw commit -m "feat(fork): make a 0 stroke width safe and mean no outline

Floor the fill maths at 1px so a 0 hachureGap can't degenerate into
roughjs's 0.1px clamp, and map a 0 width to stroke \"none\" since canvas
ignores a non-positive lineWidth."
git add vendor/excalidraw
git commit -m "chore: bump vendor/excalidraw pointer for zero-stroke safety"
```

---

## Task 3: Stroke slider 0–10px

Verified live: the slider currently renders `min="1"` / `max="32"`. The `1` is `MIN_STROKE_PX = 0.5` rounded for display — `displayValue` rounds px to 0 decimals (`units.ts:54`).

Also corrects `StrokePanel.tsx:135`, whose `?? 1` fallback contradicts the real 2px default. It only surfaces in the brief window before the Excalidraw API is ready, but a wrong magic number is worth removing while we're here.

**Files:**
- Modify: `src/ui/panels/StrokePanel.tsx:7-9,135`
- Test: `src/ui/panels/StrokePanel.test.tsx` (create)
- Test: `e2e/drawing-defaults.spec.ts` (extend — created in Task 1)

**Interfaces:**
- Consumes: `draw()` from `e2e/drawing-defaults.spec.ts` (Task 1); the zero-stroke guarantee from Task 2.
- Produces: `MIN_STROKE_PX = 0`, `MAX_STROKE_PX = 10`, `DEFAULT_STROKE_PX = 2` — module-private to `StrokePanel.tsx`.

- [ ] **Step 1: Write the failing unit test**

Create `src/ui/panels/StrokePanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import { StrokePanel } from "./StrokePanel";
import type { SelectionStyle } from "./useSelectionStyle";

function mockSel(over: Record<string, unknown> = {}): SelectionStyle {
  return {
    elements: [],
    appState: null,
    selectedIds: {},
    textTargetIds: {},
    hasSelection: false,
    selectedCount: 0,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

describe("StrokePanel", () => {
  it("offers a 0-10px stroke width range", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    const slider = screen.getByLabelText("Stroke width");
    expect(slider).toHaveAttribute("min", "0");
    expect(slider).toHaveAttribute("max", "10");
  });

  it("falls back to the 2px app default before appState is available", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(2);
  });

  it("shows the selected element's width over the fallback", () => {
    const sel = mockSel({
      elements: [{ id: "a", type: "rectangle", strokeWidth: 7 }],
      selectedIds: { a: true },
      hasSelection: true,
    });
    render(<StrokePanel sel={sel} units="px" />);
    expect(screen.getByLabelText("Stroke width value")).toHaveValue(7);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npm test -- --run src/ui/panels/StrokePanel.test.tsx
```

Expected: FAIL — `min` is `"1"`, `max` is `"32"`, and the fallback renders `1`.

- [ ] **Step 3: Write the implementation**

In `src/ui/panels/StrokePanel.tsx`, replace lines 7–9:

```ts
/** Stroke width bounds, in canvas pixels. */
const MIN_STROKE_PX = 0.5;
const MAX_STROKE_PX = 32;
```

with:

```ts
/** Stroke width bounds, in canvas pixels. 0 means "no outline" — the fork's
 *  generateRoughOptions maps a 0 width to a transparent stroke and floors the
 *  fill maths at 1px so hachure fills can't degenerate. */
const MIN_STROKE_PX = 0;
const MAX_STROKE_PX = 10;
/** Matches DEFAULT_ELEMENT_PROPS.strokeWidth, the value appState seeds into
 *  currentItemStrokeWidth. Only shown before the Excalidraw API is ready. */
const DEFAULT_STROKE_PX = 2;
```

Then at line 135, replace the fallback:

```ts
    a?.currentItemStrokeWidth ?? 1,
```

with:

```ts
    a?.currentItemStrokeWidth ?? DEFAULT_STROKE_PX,
```

- [ ] **Step 4: Run the unit test to verify it passes**

```bash
npm test -- --run src/ui/panels/StrokePanel.test.tsx
```

Expected: all three PASS.

- [ ] **Step 5: Extend the e2e coverage**

Append to `e2e/drawing-defaults.spec.ts` (the `draw` helper is already defined at the top from Task 1):

```ts
test("the stroke slider spans 0 to 10px", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const slider = page.getByRole("slider", { name: "Stroke width" });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "10");
});

test("a zero stroke width applies without hanging the canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const width = page.getByLabel("Stroke width value");
  await width.fill("0");
  await width.blur();
  await expect(width).toHaveValue("0");

  // The canvas must still be responsive: a degenerate fill would peg the main
  // thread and starve this second interaction.
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("8");
  await radius.blur();
  await expect(radius).toHaveValue("8", { timeout: 5000 });
});
```

- [ ] **Step 6: Update the existing stroke-panel spec**

`e2e/stroke-panel.spec.ts:36` fills the width field with `"8"`, which is still inside the new range — it needs no change. Confirm by running:

```bash
npm run test:e2e -- e2e/stroke-panel.spec.ts e2e/drawing-defaults.spec.ts
```

Expected: PASS. If the `"8"` case fails, the bounds were applied wrong — fix the bounds, not the test.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panels/StrokePanel.tsx src/ui/panels/StrokePanel.test.tsx e2e/drawing-defaults.spec.ts
git commit -m "feat(stroke): span the width slider 0-10px

0 now means no outline, backed by the fork's zero-width stroke handling.
Also drops a stale 1px display fallback; the real default is 2px."
```

---

## Task 4: Fork — tight selection chrome

`DEFAULT_TRANSFORM_HANDLE_SPACING` cannot be zeroed in place: `SIDE_RESIZING_THRESHOLD` and `DEFAULT_COLLISION_THRESHOLD` derive from it. Add a sibling constant and swap only the chrome sites.

This generalizes a path images already use — `interactiveScene.ts:992` passes `padding: 0` for images, and `transformHandles.ts:307/317` pass margin and spacing `0`. Render and hit-test stay in lockstep because `getTransformHandles` feeds both `interactiveScene.ts:1037` and `resizeTest.ts:57`, and the shared default parameters feed both `interactiveScene.ts:1096` and `resizeTest.ts:161`.

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/constants.ts` (after line 187)
- Modify: `vendor/excalidraw/packages/excalidraw/element/transformHandles.ts:11-21,133,305-318`
- Modify: `vendor/excalidraw/packages/excalidraw/renderer/interactiveScene.ts:34,377,1076`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SELECTION_SPACING: 0`, exported from `packages/excalidraw/constants.ts`. Not imported by flow.

- [ ] **Step 1: Add the constant**

In `vendor/excalidraw/packages/excalidraw/constants.ts`, directly after the `SIDE_RESIZING_THRESHOLD` line (187):

```ts
// flow: selection chrome (borders + transform handles) hugs element bounds.
// Deliberately separate from DEFAULT_TRANSFORM_HANDLE_SPACING, which still
// feeds SIDE_RESIZING_THRESHOLD and DEFAULT_COLLISION_THRESHOLD above.
export const SELECTION_SPACING = 0;
```

- [ ] **Step 2: Tighten the transform handles**

In `transformHandles.ts`, update the import block at lines 11–21. `isImageElement` and `DEFAULT_TRANSFORM_HANDLE_SPACING` both become unused after this task and **must** be removed, or `yarn test:code` fails under `--max-warnings=0`:

```ts
import {
  isElbowArrow,
  isFrameLikeElement,
  isLinearElement,
} from "./typeChecks";
import { SELECTION_SPACING, isAndroid, isIOS } from "../constants";
```

`isLinearElement` stays — it is still used at line 283.

Change the default parameters at lines 132–133:

```ts
  margin = SELECTION_SPACING,
  spacing = SELECTION_SPACING,
```

Then replace lines 305–318 — before:

```ts
  const margin = isLinearElement(element)
    ? DEFAULT_TRANSFORM_HANDLE_SPACING + 8
    : isImageElement(element)
    ? 0
    : DEFAULT_TRANSFORM_HANDLE_SPACING;
  return getTransformHandlesFromCoords(
    getElementAbsoluteCoords(element, elementsMap, true),
    element.angle,
    zoom,
    pointerType,
    omitSides,
    margin,
    isImageElement(element) ? 0 : undefined,
  );
```

After:

```ts
  // flow: every element type gets the same tight chrome — handles sit on the
  // element bounds. Upstream gave linears +8 and images 0; we take the image
  // treatment everywhere.
  return getTransformHandlesFromCoords(
    getElementAbsoluteCoords(element, elementsMap, true),
    element.angle,
    zoom,
    pointerType,
    omitSides,
    SELECTION_SPACING,
    SELECTION_SPACING,
  );
```

- [ ] **Step 3: Tighten the selection borders**

In `interactiveScene.ts`, add `SELECTION_SPACING` to the constants import at line 34. **Keep** `DEFAULT_TRANSFORM_HANDLE_SPACING` — line 746 still uses it for `renderTextBox`, which draws the text-*editing* outline for fixed-width text, not a selection box, and is deliberately out of scope.

At lines 376–377, before:

```ts
  const padding =
    elementProperties.padding ?? DEFAULT_TRANSFORM_HANDLE_SPACING * 2;
```

After:

```ts
  const padding = elementProperties.padding ?? SELECTION_SPACING;
```

At lines 1075–1076, before:

```ts
      const dashedLinePadding =
        (DEFAULT_TRANSFORM_HANDLE_SPACING * 2) / appState.zoom.value;
```

After:

```ts
      const dashedLinePadding = SELECTION_SPACING / appState.zoom.value;
```

- [ ] **Step 4: Typecheck and lint the fork**

```bash
source ~/.nvm/nvm.sh && nvm use
cd vendor/excalidraw && yarn test:typecheck && yarn eslint --max-warnings=0 \
  packages/excalidraw/constants.ts \
  packages/excalidraw/element/transformHandles.ts \
  packages/excalidraw/renderer/interactiveScene.ts
```

Expected: no unused-import errors. If eslint flags `isImageElement` or `DEFAULT_TRANSFORM_HANDLE_SPACING`, Step 2's import cleanup was missed.

- [ ] **Step 5: Run the vendor's own resize regression suite**

```bash
cd vendor/excalidraw && yarn test:app --watch=false packages/excalidraw/tests/resize.test.tsx packages/excalidraw/tests/binding.test.tsx
```

Expected: PASS. These compute click points through the same `getTransformHandles` we just changed (`tests/helpers/ui.ts:333`), so they follow the handles automatically — a failure here means the resize *maths* broke, not merely that handles moved. Do **not** blanket `--update` snapshots; read any diff first.

- [ ] **Step 6: Rebuild and verify flow**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build:excalidraw
npm run typecheck && npm test -- --run
```

Expected: PASS.

- [ ] **Step 7: Verify the selection box visually**

```bash
npm run dev
```

Draw a rectangle, an arrow, and a text element; select each, then marquee-select all three. Confirm handles sit on the bounds with no visible gap, resize still works from corners *and* edges, and rotation stays reachable above the shape. Capture a screenshot for the commit discussion.

Note the expected consequences: at a 2px stroke, 1px of stroke sits outside the border line (the border tracks geometric bounds), and arrow handles now sit closer to the line and its point-editing handles.

- [ ] **Step 8: Commit the submodule, then the pointer**

```bash
git -C vendor/excalidraw add packages/excalidraw/constants.ts \
  packages/excalidraw/element/transformHandles.ts \
  packages/excalidraw/renderer/interactiveScene.ts
git -C vendor/excalidraw commit -m "feat(fork): selection chrome hugs element bounds

Add SELECTION_SPACING (0) and use it for selection borders and transform
handles, generalizing the treatment images already got. Leaves
DEFAULT_TRANSFORM_HANDLE_SPACING intact for the resize/collision
thresholds and the text-editing outline."
git add vendor/excalidraw
git commit -m "chore: bump vendor/excalidraw pointer for tight selection chrome"
```

---

## Task 5: Full verification, bundle rebuild, and memory

**Files:**
- Modify: `dist/` (rebuilt bundle)
- Create: `.claude/memory/drawing-defaults.md`
- Modify: `.claude/memory/MEMORY.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: nothing consumed downstream.

- [ ] **Step 1: Run every suite**

```bash
npm run typecheck && npm test -- --run && npm run test:e2e
```

Expected: all PASS. Pay particular attention to `e2e/transform-panel.spec.ts` and `e2e/selection-mode.spec.ts` — both drive marquee selection and resize, the behavior Task 4 touched.

- [ ] **Step 2: Rebuild the flow bundle**

```bash
npm run build
```

- [ ] **Step 3: Commit the bundle**

```bash
git add dist
git commit -m "build: rebuild flow bundle"
```

- [ ] **Step 4: Write the memory file**

Create `.claude/memory/drawing-defaults.md`:

```markdown
---
name: drawing-defaults
description: "flow's drawing defaults — square corners, 0-10px stroke slider, and selection chrome that hugs element bounds"
metadata:
  type: project
---

Shipped 2026-08-04. Four asks, one of which turned out to be a no-op.

- **Square corners** — `src/App.tsx` seeds `currentItemRoundness: "sharp"` in
  `initialData.appState`. Excalidraw ships `"round"`, whose ADAPTIVE_RADIUS
  algorithm applies a fixed 32px radius (verified: fresh rects reported 32).
  Zero fork.
- **2px stroke — ALREADY UPSTREAM, no change made.** `DEFAULT_ELEMENT_PROPS.strokeWidth`
  is 2 (`constants.ts:394`) and `appState.ts:46` seeds `currentItemStrokeWidth`
  from it. Verified live before planning. Only a stale `?? 1` display fallback
  in `StrokePanel.tsx` was corrected.
- **Stroke slider 0-10px** — `MIN_STROKE_PX`/`MAX_STROKE_PX` in
  `src/ui/panels/StrokePanel.tsx`. The old 0.5 floor displayed as "1" because
  `displayValue` rounds px to 0 decimals.
- **Tight selection chrome** — fork edit. New `SELECTION_SPACING = 0` in
  `constants.ts`, used at the two `interactiveScene.ts` border sites and the
  `transformHandles.ts` margin/spacing defaults.

## Fork gotchas worth remembering
- **Do NOT zero `DEFAULT_TRANSFORM_HANDLE_SPACING` itself.** `SIDE_RESIZING_THRESHOLD`
  and `DEFAULT_COLLISION_THRESHOLD` derive from it; zeroing breaks edge resizing
  and hit-testing. That is why `SELECTION_SPACING` exists as a sibling.
- `renderTextBox` (`interactiveScene.ts:739`) keeps the old spacing — it is the
  text-editing outline, not a selection box.
- Removing the old margin expression orphans the `isImageElement` and
  `DEFAULT_TRANSFORM_HANDLE_SPACING` imports in `transformHandles.ts`; the fork's
  eslint runs `--max-warnings=0`, so they must be deleted.
- **A 0 stroke width needs two guards** (`scene/Shape.ts`): floor `fillWeight`/
  `hachureGap` at 1px, or roughjs clamps the hachure gap to 0.1px and hangs on
  hachure/cross-hatch elements from opened docs; and map a 0 width to
  `stroke: "none"`, because canvas ignores a non-positive `lineWidth` and keeps
  the previous draw's value.

Render and hit-test can't drift: `getTransformHandles` feeds both the renderer
and `resizeTest.ts`, and the shared default params feed both multi-select paths.

See [[flow-fork-strategy]], [[transform-panel]], [[arrowhead-size]].
```

- [ ] **Step 5: Add the MEMORY.md pointer**

Append one line to `.claude/memory/MEMORY.md`:

```markdown
- [Drawing defaults](drawing-defaults.md) — square corners, 0–10px stroke slider, tight selection chrome (`SELECTION_SPACING` fork edit); 2px stroke was already upstream; shipped 2026-08-04
```

- [ ] **Step 6: Commit**

```bash
git add .claude/memory
git commit -m "docs(memory): record the drawing-defaults work"
```

---

## Verification Summary

| Requirement | Covered by |
|---|---|
| Corner radius 0 by default | Task 1, `e2e/drawing-defaults.spec.ts` (rect + diamond) |
| Rounding still available per-object | Task 1, third e2e case |
| 2px default stroke | Already upstream — verified live, no code change |
| Slider spans 0–10 | Task 3, unit + e2e attribute assertions |
| A 0 width is safe and means "no outline" | Task 2 fork edit, Task 3's non-hang e2e case |
| Selection box tight against the object | Task 4, vendor resize/binding suites + Step 7 visual check |
| Resize and hit-testing unregressed | Task 4 Step 5, Task 5 Step 1 |
