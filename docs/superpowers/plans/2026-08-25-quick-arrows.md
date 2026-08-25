# Quick Arrows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four fat, light-blue arrow affordances around a hovered shape; press one and drag to draw an elbow arrow bound to that shape, without picking up the arrow tool.

**Architecture:** A flow-owned DOM overlay (modelled on `src/ui/shapes/ShapeHandles.tsx`) renders four `<button>` triangles positioned over the canvas. Pressing one arms the elbow arrow tool and, one animation frame later, dispatches a synthesized `pointerdown` on `canvas.interactive` at the grabbed edge's midpoint. Vendor's `handleCanvasPointerDown` registers its move/up listeners on `window`, so the rest of the gesture — binding, elbow routing, snapping, escape-to-cancel, single-entry undo — is vendor's, driven by the user's real pointer. One fork edit relocates the rotation handle to the upper-right corner so the arrows can hug the bounds.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + Testing Library (jsdom) for unit tests, Playwright for e2e, Excalidraw as a git submodule at `vendor/excalidraw` built by `scripts/build-excalidraw.mjs`.

**Spec:** `docs/superpowers/specs/2026-08-25-quick-arrows-design.md`

## Global Constraints

- **Repo-local memory.** At the end of the work, add a memory file to `.claude/memory/` plus a one-line pointer in `.claude/memory/MEMORY.md`. Never write to the global Claude account.
- **Exactly one new fork edit** — the rotation-handle relocation in `vendor/excalidraw/packages/element/src/transformHandles.ts`. Any additional vendor change means stopping and re-checking the design.
- **Every vendor source change requires `npm run build:excalidraw`** before flow sees it. Editing the submodule alone changes nothing at runtime.
- **Fork edits are commented `// flow: …`** and guarded in `scripts/build-excalidraw.mjs`, which currently has 8 stages.
- **`QuickArrows` mounts as a sibling of `<Excalidraw>`, never inside `App`.** A component that bumps state from `api.onChange` while being re-rendered by `<Excalidraw>`'s own render makes `componentDidUpdate` re-fire `onChange`, looping forever. See the docstring on `useShapeSelection`.
- **Geometry constants, verbatim:** `ARROW_GAP = 14`, `ARROW_WIDTH = 18`, `ARROW_DEPTH = 12`, `HALO = 26`, `MIN_SIDE_PX = 20`, `HOVER_GRACE_MS = 120`, `ROTATION_HANDLE_CORNER_GAP = 12`. All in viewport pixels except the last, which is divided by `zoom.value` at its use site.
- **Arrow type is always `"elbow"`.** No preference, no modifier override.
- **flow forces tool lock permanently on** (`useToolOverride`), so a gesture that arms the arrow tool *must* restore the previous tool or the arrow tool sticks.

---

## File Structure

| File | Responsibility |
|---|---|
| `vendor/excalidraw/packages/element/src/transformHandles.ts` | **Modify.** Rotation handle → diagonally outside the NE corner. |
| `scripts/build-excalidraw.mjs` | **Modify.** Stage 9: guard that fork edit against a rebase. |
| `e2e/rotate-cursor.spec.ts` | **Modify.** Its hardcoded handle coordinate moves. |
| `src/ui/quick-arrows/quick-arrow-geometry.ts` | **Create.** Pure geometry: edge midpoints, glyph placement, visible sides, halo hit region. No React, no Excalidraw imports. |
| `src/ui/quick-arrows/bindable.ts` | **Create.** flow's own "can an arrow bind to this?" predicate (vendor's `isBindableElement` is not publicly exported). |
| `src/ui/quick-arrows/useHoverTarget.ts` | **Create.** Which element, if any, should show quick arrows right now. |
| `src/ui/toolbar/tool-restore.ts` | **Create.** The shared tool-restore body plus the module state (`suspendedTool`, `gestureActive`) that `useToolOverride` and `useQuickArrowDrag` both need. |
| `src/ui/toolbar/useToolOverride.ts` | **Modify.** Use the shared module instead of its private ref; early-return while a gesture is in flight. |
| `src/ui/quick-arrows/useQuickArrowDrag.ts` | **Create.** Arm → dispatch → restore. |
| `src/ui/quick-arrows/QuickArrows.tsx` | **Create.** The overlay component. |
| `src/ui/quick-arrows/quick-arrows.css` | **Create.** Overlay and triangle styling. |
| `src/App.tsx` | **Modify.** Mount `<QuickArrows>` beside `<ShapeHandles>`. |
| `e2e/quick-arrows.spec.ts` | **Create.** End-to-end behaviour. |

`quick-arrow-geometry.ts` is deliberately dependency-free so the bulk of the logic is testable without jsdom, React, or a mocked Excalidraw — the same split `src/ui/shapes/` uses between `geometry/` and the components.

---

### Task 1: Relocate the rotation handle to the upper-right corner

The one fork edit. Do it first: it changes coordinates that Task 7's e2e tests depend on, and it is the only step that can be invalidated by a submodule rebase.

**Files:**
- Modify: `vendor/excalidraw/packages/element/src/transformHandles.ts:58` and `:200-214`
- Modify: `scripts/build-excalidraw.mjs` (append stage 9 before the final `console.log`)
- Modify: `e2e/rotate-cursor.spec.ts:36` and the test bodies

**Interfaces:**
- Consumes: nothing.
- Produces: the rotation handle for a box with bounds `(x1,y1)-(x2,y2)` at zoom 1 now occupies the 8×8 rect `[x2 + 8, y1 - 12, 8, 8]`. For the e2e box `(500,300)-(800,460)` that is x 808–816, y 284–292, centre **(812, 288)**. No flow module imports it.

- [ ] **Step 1: Write the failing e2e test**

Replace the `ROTATE_HANDLE` constant and the first test in `e2e/rotate-cursor.spec.ts`. Everything else in that file stays as-is.

```ts
// flow moved the rotation handle off the top edge and out past the NE corner,
// so quick-arrow affordances can hug the bounds without fighting it for the
// same pixels (see docs/superpowers/specs/2026-08-25-quick-arrows-design.md).
// For a box of (500,300)-(800,460) at zoom 1 the handle rect is
// [808, 284, 8, 8], so its centre is (812, 288).
const ROTATE_HANDLE = { x: 812, y: 288 };

// Where the handle USED to be. Kept as a negative assertion: if a submodule
// rebase silently restores the vendor placement, this is what catches it.
// Deliberately off-centre horizontally so it can never land on the top quick
// arrow (an 18px-wide glyph centred at x=650).
const OLD_ROTATE_SPOT = { x: 600, y: 284 };
```

```ts
test("the rotation handle sits outside the NE corner, not above the top edge", async ({
  page,
}) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawBox(page);

  await page.mouse.move(ROTATE_HANDLE.x, ROTATE_HANDLE.y);
  await expect.poll(() => canvasCursor(page)).toContain("data:image/svg+xml");

  await page.mouse.move(OLD_ROTATE_SPOT.x, OLD_ROTATE_SPOT.y);
  await expect.poll(() => canvasCursor(page)).not.toContain("data:image/svg+xml");
});
```

Then update the existing `"the rotation handle shows a circular-arrow cursor, and keeps it while rotating"` test: it already uses `ROTATE_HANDLE`, so the constant change carries it — but its drag target `page.mouse.move(700, 260)` now starts from the corner instead of the top edge. Change that line to `await page.mouse.move(860, 320, { steps: 6 });` so the drag is a real rotation away from the new handle position rather than a move back across the shape.

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx playwright test e2e/rotate-cursor.spec.ts --project=chromium --reporter=list
```

Expected: FAIL. At (812, 288) the cursor is the default arrow, not the SVG — the handle is still at top-center.

- [ ] **Step 3: Make the fork edit**

In `vendor/excalidraw/packages/element/src/transformHandles.ts`, replace line 58:

```ts
const ROTATION_RESIZE_HANDLE_GAP = 16;
```

with:

```ts
// flow: the rotation handle sits diagonally outside the NE corner rather than
// above the top edge, so flow's quick-arrow affordances can own the edge
// midpoints without competing with it for the same pixels. This gap is the
// diagonal offset from the corner. `resizeTest` and flow's rotate-cursor edit
// both read `getTransformHandlesFromCoords`, so hit-testing and the cursor
// follow from this one site with no second edit. Guarded by stage 9 of
// scripts/build-excalidraw.mjs. See docs/superpowers/specs/
// 2026-08-25-quick-arrows-design.md.
const ROTATION_HANDLE_CORNER_GAP = 12;
```

Then in `getTransformHandlesFromCoords`, replace the `rotation:` entry (lines ~200-214) with:

```ts
    rotation: omitSides.rotation
      ? undefined
      : generateTransformHandle(
          x2 +
            dashedLineMargin -
            centeringOffset +
            ROTATION_HANDLE_CORNER_GAP / zoom.value,
          y1 -
            dashedLineMargin -
            handleMarginY +
            centeringOffset -
            ROTATION_HANDLE_CORNER_GAP / zoom.value,
          handleWidth,
          handleHeight,
          cx,
          cy,
          angle,
        ),
```

The `x` expression mirrors the `ne` handle's x exactly, plus the gap; the `y` expression mirrors the `ne` handle's y, minus the gap. That is why the result lands on the corner's diagonal. `ROTATION_RESIZE_HANDLE_GAP` had exactly two references (its declaration and this one), so nothing else needs touching.

- [ ] **Step 4: Rebuild the vendor bundle**

```bash
npm run build:excalidraw
```

Expected: completes, printing the "8 fork edits" summary line. Editing the submodule source alone changes nothing at runtime — flow consumes `vendor/excalidraw/packages/excalidraw/dist`.

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx playwright test e2e/rotate-cursor.spec.ts --project=chromium --reporter=list
```

Expected: all four tests PASS.

- [ ] **Step 6: Add the rebase guard**

In `scripts/build-excalidraw.mjs`, insert before the final `console.log(...)`:

```js
// ── 9. Rotation-handle corner placement survival ────────────────────────────
// flow moved the rotation handle from above the top edge to diagonally outside
// the NE corner so the quick-arrow affordances can own the edge midpoints. A
// rebase that drops the edit is silent at build time and only shows up as
// quick arrows overlapping the rotation handle, so assert the source directly.
const CORNER_GAP_SYMBOL = "ROTATION_HANDLE_CORNER_GAP";
const transformHandlesSource = join(
  vendor,
  "packages/element/src/transformHandles.ts",
);

if (
  !existsSync(transformHandlesSource) ||
  !readFileSync(transformHandlesSource, "utf8").includes(CORNER_GAP_SYMBOL)
) {
  die(
    `the rotation-handle corner placement is missing — \`${CORNER_GAP_SYMBOL}\` ` +
      `is not in packages/element/src/transformHandles.ts. A rebase probably ` +
      `restored the vendor top-center placement, which puts the rotation ` +
      `handle underneath flow's top quick arrow.`,
  );
}
```

Also extend the final `console.log` string, appending `+ ", and the rotation handle is on the corner."` to its last fragment.

- [ ] **Step 7: Verify the guard actually fires**

```bash
sed -i 's/ROTATION_HANDLE_CORNER_GAP/ROTATION_RESIZE_HANDLE_GAP/g' vendor/excalidraw/packages/element/src/transformHandles.ts
npm run build:excalidraw
```

Expected: FAILS with the stage 9 message. A guard that has never been seen to fail is not a guard. Now put it back:

```bash
sed -i 's/ROTATION_RESIZE_HANDLE_GAP/ROTATION_HANDLE_CORNER_GAP/g' vendor/excalidraw/packages/element/src/transformHandles.ts
npm run build:excalidraw
```

Expected: succeeds.

- [ ] **Step 8: Commit**

The submodule is a separate git repo. Commit there first, then record the new gitlink in the parent.

```bash
git -C vendor/excalidraw add packages/element/src/transformHandles.ts
git -C vendor/excalidraw commit -m "flow: move the rotation handle outside the NE corner"
git add vendor/excalidraw scripts/build-excalidraw.mjs e2e/rotate-cursor.spec.ts dist
git commit -m "feat(canvas): move the rotation handle to the upper-right corner"
```

---

### Task 2: Quick-arrow geometry

Pure functions, no React and no Excalidraw imports — this is where the bulk of the logic lives and where it is cheapest to test.

**Files:**
- Create: `src/ui/quick-arrows/quick-arrow-geometry.ts`
- Test: `src/ui/quick-arrows/quick-arrow-geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type QuickArrowSide = "n" | "e" | "s" | "w"`
  - `const QUICK_ARROW_SIDES: readonly QuickArrowSide[]`
  - `const ARROW_GAP: 14`, `ARROW_WIDTH: 18`, `ARROW_DEPTH: 12`, `HALO: 26`, `MIN_SIDE_PX: 20`
  - `interface Box { x: number; y: number; width: number; height: number; angle: number }`
  - `interface Viewport { zoom: number; scrollX: number; scrollY: number; offsetLeft: number; offsetTop: number }`
  - `toViewport(sceneX: number, sceneY: number, v: Viewport): { x: number; y: number }`
  - `edgeMidpoint(box: Box, side: QuickArrowSide): { x: number; y: number }` — **scene** coords
  - `arrowPlacement(box: Box, side: QuickArrowSide, v: Viewport): { x: number; y: number; rotation: number }` — **viewport** coords plus glyph rotation in degrees
  - `visibleSides(box: Box, v: Viewport): QuickArrowSide[]`
  - `isInHaloRegion(box: Box, v: Viewport, clientX: number, clientY: number): boolean`

- [ ] **Step 1: Write the failing tests**

Create `src/ui/quick-arrows/quick-arrow-geometry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ARROW_DEPTH,
  ARROW_GAP,
  HALO,
  QUICK_ARROW_SIDES,
  arrowPlacement,
  edgeMidpoint,
  isInHaloRegion,
  toViewport,
  visibleSides,
  type Box,
  type Viewport,
} from "./quick-arrow-geometry";

/** Identity viewport: scene coords and viewport coords are the same numbers. */
const V: Viewport = { zoom: 1, scrollX: 0, scrollY: 0, offsetLeft: 0, offsetTop: 0 };

/** 100x50 box at the origin, unrotated. Centre (50, 25). */
const box = (over: Partial<Box> = {}): Box => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  ...over,
});

describe("toViewport", () => {
  it("applies scroll, then zoom, then the canvas offset", () => {
    const v: Viewport = { zoom: 2, scrollX: 10, scrollY: 5, offsetLeft: 100, offsetTop: 40 };
    expect(toViewport(0, 0, v)).toEqual({ x: 120, y: 50 });
  });
});

describe("edgeMidpoint", () => {
  it("returns the midpoint of each edge of an unrotated box", () => {
    expect(edgeMidpoint(box(), "n")).toEqual({ x: 50, y: 0 });
    expect(edgeMidpoint(box(), "e")).toEqual({ x: 100, y: 25 });
    expect(edgeMidpoint(box(), "s")).toEqual({ x: 50, y: 50 });
    expect(edgeMidpoint(box(), "w")).toEqual({ x: 0, y: 25 });
  });

  it("rotates the midpoint about the box centre", () => {
    // Quarter turn clockwise: the north edge's midpoint swings to the east.
    const m = edgeMidpoint(box({ angle: Math.PI / 2 }), "n");
    expect(m.x).toBeCloseTo(75);
    expect(m.y).toBeCloseTo(25);
  });
});

describe("arrowPlacement", () => {
  it("puts the glyph centre one gap plus half a depth outside the edge", () => {
    const p = arrowPlacement(box(), "n", V);
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(0 - ARROW_GAP - ARROW_DEPTH / 2);
    expect(p.rotation).toBeCloseTo(0);
  });

  it("points each side's glyph outward", () => {
    expect(arrowPlacement(box(), "e", V).rotation).toBeCloseTo(90);
    expect(arrowPlacement(box(), "s", V).rotation).toBeCloseTo(180);
    expect(arrowPlacement(box(), "w", V).rotation).toBeCloseTo(270);
  });

  it("offsets in VIEWPORT pixels, so zoom does not scale the gap", () => {
    const zoomed: Viewport = { ...V, zoom: 4 };
    const p = arrowPlacement(box(), "n", zoomed);
    // The edge midpoint is at viewport y = 0; the glyph is the same physical
    // distance out as at zoom 1. If the offset were applied in scene space it
    // would be 4x further away here.
    expect(p.y).toBeCloseTo(0 - ARROW_GAP - ARROW_DEPTH / 2);
  });

  it("rotates the glyph with the element", () => {
    const p = arrowPlacement(box({ angle: Math.PI / 2 }), "n", V);
    expect(p.rotation).toBeCloseTo(90);
  });
});

describe("visibleSides", () => {
  it("shows all four sides on a comfortably sized box", () => {
    expect(visibleSides(box(), V)).toEqual([...QUICK_ARROW_SIDES]);
  });

  it("hides the n/s glyphs on a box too narrow to hold them", () => {
    expect(visibleSides(box({ width: 10 }), V)).toEqual(["e", "w"]);
  });

  it("hides the e/w glyphs on a box too short to hold them", () => {
    expect(visibleSides(box({ height: 10 }), V)).toEqual(["n", "s"]);
  });

  it("measures the box in VIEWPORT pixels, so zooming in re-reveals them", () => {
    const zoomed: Viewport = { ...V, zoom: 10 };
    expect(visibleSides(box({ width: 10 }), zoomed)).toEqual([...QUICK_ARROW_SIDES]);
  });
});

describe("isInHaloRegion", () => {
  it("accepts a point inside the box", () => {
    expect(isInHaloRegion(box(), V, 50, 25)).toBe(true);
  });

  it("accepts a point out in the halo, where the glyphs live", () => {
    expect(isInHaloRegion(box(), V, 50, -(ARROW_GAP + ARROW_DEPTH / 2))).toBe(true);
  });

  it("rejects a point past the halo", () => {
    expect(isInHaloRegion(box(), V, 50, -(HALO + 1))).toBe(false);
  });

  it("follows the element's rotation", () => {
    const rotated = box({ angle: Math.PI / 2 });
    // Centre is (50, 25); after a quarter turn the box is 50 wide and 100 tall,
    // so a point 40px above the centre is inside, and one 40px to the left is not.
    expect(isInHaloRegion(rotated, V, 50, -15)).toBe(true);
    expect(isInHaloRegion(rotated, V, -20, 25)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run src/ui/quick-arrows/quick-arrow-geometry.test.ts
```

Expected: FAIL — `Failed to resolve import "./quick-arrow-geometry"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/quick-arrows/quick-arrow-geometry.ts`:

```ts
/**
 * Pure geometry for the quick-arrow overlay: where the four triangles sit,
 * which of them to show, where a gesture starting from one should originate,
 * and whether the pointer is close enough to keep them on screen.
 *
 * Deliberately free of React and of `@excalidraw/excalidraw` imports — the
 * vendor package runs module-level UI code that throws under jsdom, so keeping
 * this file dependency-free is what lets the bulk of the logic be unit-tested
 * without mocking anything.
 */

export type QuickArrowSide = "n" | "e" | "s" | "w";

export const QUICK_ARROW_SIDES: readonly QuickArrowSide[] = ["n", "e", "s", "w"];

/** Viewport px from the element's bounds to the triangle's base. */
export const ARROW_GAP = 14;
/** Viewport px across the triangle's base. */
export const ARROW_WIDTH = 18;
/** Viewport px from the triangle's base to its tip. */
export const ARROW_DEPTH = 12;
/**
 * How far past the bounds the hover region reaches. It has to cover the
 * glyphs themselves: they live OUTSIDE the element, so a region that stopped
 * at the bounds would dismiss an arrow just as the pointer travelled toward
 * it, making the whole affordance unusable.
 */
export const HALO = ARROW_GAP + ARROW_DEPTH;
/**
 * Below this many viewport px, a box is too small to carry a glyph across
 * that dimension without the shape disappearing inside its own chrome.
 */
export const MIN_SIDE_PX = 20;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, the convention Excalidraw stores on every element. */
  angle: number;
}

export interface Viewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

/** The outward-pointing unit normal of each side on an unrotated box. */
const OUTWARD: Record<QuickArrowSide, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

/** Glyph rotation for each side, given a triangle drawn pointing up at 0deg. */
const BASE_DEGREES: Record<QuickArrowSide, number> = { n: 0, e: 90, s: 180, w: 270 };

function rotate(dx: number, dy: number, angle: number): readonly [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/**
 * Scene -> viewport, the same formula as vendor's `sceneCoordsToViewportCoords`
 * (`packages/common/src/utils.ts`). Reimplemented rather than imported for the
 * dependency reason in this module's docstring; `ShapeHandles.test.tsx` already
 * duplicates it for the same reason.
 */
export function toViewport(
  sceneX: number,
  sceneY: number,
  v: Viewport,
): { x: number; y: number } {
  return {
    x: (sceneX + v.scrollX) * v.zoom + v.offsetLeft,
    y: (sceneY + v.scrollY) * v.zoom + v.offsetTop,
  };
}

/**
 * The scene-space midpoint of `side`'s edge, rotated with the element.
 *
 * This is the gesture's origin, and it is load-bearing twice over.
 * `maxBindingDistance_simple` is only ~15px at zoom 1, so a gesture
 * originating under the user's finger — out on the triangle — would silently
 * fail to bind to the source shape. And an elbow arrow routes from its start
 * heading, so originating here is what makes the top arrow leave upward.
 */
export function edgeMidpoint(box: Box, side: QuickArrowSide): { x: number; y: number } {
  const cx = box.width / 2;
  const cy = box.height / 2;
  const [ox, oy] = OUTWARD[side];
  const [dx, dy] = rotate(ox * cx, oy * cy, box.angle);
  return { x: box.x + cx + dx, y: box.y + cy + dy };
}

/**
 * Viewport-space centre of `side`'s triangle, and the CSS rotation in degrees
 * that makes it point away from the shape.
 *
 * The offset from the edge is applied in VIEWPORT space, not scene space, so
 * the affordance stays the same physical size and the same physical distance
 * out at every zoom — the same reasoning as `ShapeHandles`' fixed 10px dot.
 */
export function arrowPlacement(
  box: Box,
  side: QuickArrowSide,
  v: Viewport,
): { x: number; y: number; rotation: number } {
  const mid = edgeMidpoint(box, side);
  const m = toViewport(mid.x, mid.y, v);
  const [ox, oy] = OUTWARD[side];
  const [nx, ny] = rotate(ox, oy, box.angle);
  const dist = ARROW_GAP + ARROW_DEPTH / 2;
  return {
    x: m.x + nx * dist,
    y: m.y + ny * dist,
    rotation: BASE_DEGREES[side] + (box.angle * 180) / Math.PI,
  };
}

/**
 * Which sides are worth drawing. A glyph spans `ARROW_WIDTH` across the edge
 * it sits on, so the n/s pair is gated on the box's width and the e/w pair on
 * its height — measured on screen, so zooming in re-reveals them.
 */
export function visibleSides(box: Box, v: Viewport): QuickArrowSide[] {
  const w = Math.abs(box.width) * v.zoom;
  const h = Math.abs(box.height) * v.zoom;
  return QUICK_ARROW_SIDES.filter((side) =>
    side === "n" || side === "s" ? w >= MIN_SIDE_PX : h >= MIN_SIDE_PX,
  );
}

/**
 * Is the viewport point within the element's rotated bounds expanded by
 * `HALO`? One region covering the shape AND its glyphs — see `HALO`.
 */
export function isInHaloRegion(
  box: Box,
  v: Viewport,
  clientX: number,
  clientY: number,
): boolean {
  const centre = toViewport(box.x + box.width / 2, box.y + box.height / 2, v);
  // Un-rotate the pointer about the box centre, so the test below is a plain
  // axis-aligned rectangle check in the element's own frame.
  const [lx, ly] = rotate(clientX - centre.x, clientY - centre.y, -box.angle);
  const halfW = (Math.abs(box.width) * v.zoom) / 2 + HALO;
  const halfH = (Math.abs(box.height) * v.zoom) / 2 + HALO;
  return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run src/ui/quick-arrows/quick-arrow-geometry.test.ts
npm run typecheck
```

Expected: all tests PASS, typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/quick-arrows/quick-arrow-geometry.ts src/ui/quick-arrows/quick-arrow-geometry.test.ts
git commit -m "feat(quick-arrows): add the geometry module"
```

---

### Task 3: The hover target

**Files:**
- Create: `src/ui/quick-arrows/bindable.ts`
- Create: `src/ui/quick-arrows/useHoverTarget.ts`
- Test: `src/ui/quick-arrows/bindable.test.ts`
- Test: `src/ui/quick-arrows/useHoverTarget.test.tsx`

**Interfaces:**
- Consumes: `isInHaloRegion`, `type Box`, `type Viewport` from Task 2.
- Produces:
  - `isBindableForQuickArrows(element: SceneElement): boolean` from `bindable.ts`
  - `useHoverTarget(api: ExcalidrawAPI | null): SceneElement | null` from `useHoverTarget.ts`
  - `type SceneElement` is re-used from `src/ui/shapes/useShapeSelection.ts`, which already defines it as `ReturnType<ExcalidrawAPI["getSceneElements"]>[number]`.

- [ ] **Step 1: Write the failing predicate test**

Create `src/ui/quick-arrows/bindable.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isBindableForQuickArrows } from "./bindable";

type El = Record<string, unknown> & { id: string; type: string };
const el = (over: Partial<El>): El =>
  ({ id: "a", type: "rectangle", locked: false, ...over }) as El;

describe("isBindableForQuickArrows", () => {
  it("accepts the shapes an arrow can bind to", () => {
    for (const type of [
      "rectangle",
      "diamond",
      "ellipse",
      "image",
      "iframe",
      "embeddable",
      "frame",
      "magicframe",
    ]) {
      expect(isBindableForQuickArrows(el({ type }) as never), type).toBe(true);
    }
  });

  it("accepts free text but not text bound into a container", () => {
    expect(isBindableForQuickArrows(el({ type: "text" }) as never)).toBe(true);
    expect(
      isBindableForQuickArrows(el({ type: "text", containerId: "c" }) as never),
    ).toBe(false);
  });

  it("rejects the types an arrow cannot bind to", () => {
    for (const type of ["arrow", "line", "freedraw", "selection"]) {
      expect(isBindableForQuickArrows(el({ type }) as never), type).toBe(false);
    }
  });

  it("rejects locked elements", () => {
    expect(isBindableForQuickArrows(el({ locked: true }) as never)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/quick-arrows/bindable.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the predicate**

Create `src/ui/quick-arrows/bindable.ts`:

```ts
import type { SceneElement } from "../shapes/useShapeSelection";

/**
 * Can an arrow bind to this element?
 *
 * Mirrors vendor's `isBindableElement`
 * (`vendor/excalidraw/packages/element/src/typeChecks.ts`) with
 * `includeLocked: false`. Reimplemented rather than imported because that
 * predicate is not re-exported from the public `@excalidraw/excalidraw`
 * entry point, and exporting it would be a fork edit this feature does not
 * otherwise need.
 *
 * If a vendor upgrade adds a bindable type, this list goes stale silently —
 * the new type simply gets no quick arrows. That is the acceptable failure
 * direction (missing affordance, not a broken one).
 */
export function isBindableForQuickArrows(element: SceneElement): boolean {
  if (element.locked) return false;
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "image":
    case "iframe":
    case "embeddable":
    case "frame":
    case "magicframe":
      return true;
    case "text":
      return !element.containerId;
    default:
      return false;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/quick-arrows/bindable.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the failing hook test**

Create `src/ui/quick-arrows/useHoverTarget.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHoverTarget } from "./useHoverTarget";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

interface ApiOverrides {
  activeTool?: { type: string };
  selectedElementIds?: Record<string, boolean>;
  selectedLinearElement?: { isEditing: boolean } | null;
}

function makeApi(elements: El[], over: ApiOverrides = {}) {
  const listeners: Array<() => void> = [];
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: "selection" },
    selectedElementIds: {},
    selectedLinearElement: null,
    ...over,
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: (cb: () => void) => {
      listeners.push(cb);
      return () => {};
    },
  } as unknown as ExcalidrawAPI;
  return { api, appState, fire: () => listeners.forEach((cb) => cb()) };
}

const rect = (over: Partial<El> = {}): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
  ...over,
});

/** Dispatch a window pointermove, the only input this hook has. */
function movePointer(x: number, y: number, buttons = 0) {
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, buttons }));
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useHoverTarget", () => {
  it("returns the element under the pointer", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current?.id).toBe("r");
  });

  it("keeps the element while the pointer is out in the halo", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, -20);
    expect(result.current?.id).toBe("r");
  });

  it("drops the element only after the grace period", () => {
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    movePointer(500, 500);
    expect(result.current?.id, "still held during the grace window").toBe("r");
    act(() => void vi.advanceTimersByTime(150));
    expect(result.current).toBeNull();
  });

  it("returns the topmost element when two overlap", () => {
    const { api } = makeApi([rect({ id: "under" }), rect({ id: "over" })]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current?.id).toBe("over");
  });

  it("returns nothing while a drawing tool is armed", () => {
    const { api } = makeApi([rect()], { activeTool: { type: "rectangle" } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("re-evaluates on an appState change, without the pointer moving", () => {
    // This is the Cmd/Ctrl override case: holding the modifier switches the
    // active tool to selection while the pointer is perfectly still, and the
    // arrows must appear anyway.
    const { api, appState, fire } = makeApi([rect()], { activeTool: { type: "rectangle" } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
    act(() => {
      appState.activeTool = { type: "selection" };
      fire();
    });
    expect(result.current?.id).toBe("r");
  });

  it("returns nothing for a non-bindable element", () => {
    const { api } = makeApi([rect({ type: "freedraw" })]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while more than one element is selected", () => {
    const { api } = makeApi([rect()], { selectedElementIds: { a: true, b: true } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while a linear element is being edited", () => {
    const { api } = makeApi([rect()], { selectedLinearElement: { isEditing: true } });
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25);
    expect(result.current).toBeNull();
  });

  it("returns nothing while a mouse button is held", () => {
    // Dragging the shape itself keeps the selection tool active and the
    // pointer over the element; the arrows should get out of the way.
    const { api } = makeApi([rect()]);
    const { result } = renderHook(() => useHoverTarget(api));
    movePointer(50, 25, 1);
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

```bash
npx vitest run src/ui/quick-arrows/useHoverTarget.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 7: Write the hook**

Create `src/ui/quick-arrows/useHoverTarget.ts`:

```ts
import { useEffect, useRef, useState } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import { isBindableForQuickArrows } from "./bindable";
import { isInHaloRegion, type Viewport } from "./quick-arrow-geometry";

/** How long the arrows survive the pointer leaving their region. Without it,
 *  the boundary flickers as the pointer wobbles across it. */
const HOVER_GRACE_MS = 120;

interface HoverAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
  activeTool: { type: string };
  selectedElementIds: Record<string, boolean>;
  selectedLinearElement?: { isEditing?: boolean } | null;
}

function viewportOf(s: HoverAppState): Viewport {
  return {
    zoom: s.zoom.value,
    scrollX: s.scrollX,
    scrollY: s.scrollY,
    offsetLeft: s.offsetLeft,
    offsetTop: s.offsetTop,
  };
}

/**
 * The element whose quick arrows should be on screen right now, or null.
 *
 * Hover-driven, not selection-driven: point at any bindable shape and its
 * arrows appear whether or not it is selected.
 *
 * Two inputs, not one. Pointer position is the obvious one. The second is
 * `api.onChange`, and it is not optional: holding Cmd/Ctrl engages flow's
 * temporary-selection override by calling `setActiveTool({type: "selection"})`
 * (`useToolOverride.ts`), which must reveal the arrows **with the pointer
 * perfectly still**. A hook driven by pointer events alone would leave the
 * user jiggling the mouse to make them show up.
 *
 * Subscribes to `onChange` directly, so — like `useShapeSelection` — its
 * caller must be a sibling of `<Excalidraw>`, never inside `App`. A state bump
 * from `onChange` that re-renders `<Excalidraw>` makes `componentDidUpdate`
 * re-fire `onChange`, looping forever.
 */
export function useHoverTarget(api: ExcalidrawAPI | null): SceneElement | null {
  const [target, setTarget] = useState<SceneElement | null>(null);
  // Last known pointer position, so an appState change can re-evaluate hover
  // without waiting for the pointer to move. `buttons` rides along: any held
  // button means some other gesture owns the canvas.
  const pointer = useRef<{ x: number; y: number; buttons: number } | null>(null);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!api) return;

    const clearGrace = () => {
      if (graceTimer.current !== null) {
        clearTimeout(graceTimer.current);
        graceTimer.current = null;
      }
    };

    const evaluate = () => {
      const p = pointer.current;
      if (!p) return;
      const next = p.buttons !== 0 ? null : resolve(api, p.x, p.y);
      if (next) {
        clearGrace();
        setTarget(next);
        return;
      }
      // Losing the target is delayed; gaining one is immediate.
      if (graceTimer.current === null) {
        graceTimer.current = setTimeout(() => {
          graceTimer.current = null;
          setTarget(null);
        }, HOVER_GRACE_MS);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY, buttons: e.buttons };
      evaluate();
    };

    window.addEventListener("pointermove", onPointerMove);
    const unsubscribe = api.onChange(evaluate);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      unsubscribe();
      clearGrace();
    };
  }, [api]);

  return target;
}

/** The topmost bindable element whose halo region contains the pointer. */
function resolve(api: ExcalidrawAPI, x: number, y: number): SceneElement | null {
  const state = api.getAppState() as unknown as HoverAppState;
  if (state.activeTool.type !== "selection") return null;
  if (state.selectedLinearElement?.isEditing) return null;
  if (Object.keys(state.selectedElementIds ?? {}).length > 1) return null;

  const v = viewportOf(state);
  const elements = api.getSceneElements();
  // Last in the array paints on top, so walk backwards to find the topmost.
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (!isBindableForQuickArrows(el)) continue;
    if (isInHaloRegion(el, v, x, y)) return el;
  }
  return null;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npx vitest run src/ui/quick-arrows/
npm run typecheck
```

Expected: all PASS, typecheck clean.

- [ ] **Step 9: Commit**

```bash
git add src/ui/quick-arrows/bindable.ts src/ui/quick-arrows/bindable.test.ts \
        src/ui/quick-arrows/useHoverTarget.ts src/ui/quick-arrows/useHoverTarget.test.tsx
git commit -m "feat(quick-arrows): resolve the hovered bindable element"
```

---

### Task 4: The overlay component

Renders the triangles. No drag yet — the buttons are inert until Task 6.

**Files:**
- Create: `src/ui/quick-arrows/QuickArrows.tsx`
- Create: `src/ui/quick-arrows/quick-arrows.css`
- Modify: `src/App.tsx:537`
- Test: `src/ui/quick-arrows/QuickArrows.test.tsx`

**Interfaces:**
- Consumes: `useHoverTarget` (Task 3); `arrowPlacement`, `visibleSides`, `ARROW_WIDTH`, `ARROW_DEPTH`, `QUICK_ARROW_SIDES` (Task 2).
- Produces: `<QuickArrows api={ExcalidrawAPI | null} />`. Each button carries `aria-label` of exactly `"Quick arrow up" | "Quick arrow right" | "Quick arrow down" | "Quick arrow left"` — Task 7's e2e tests address them by that name.

- [ ] **Step 1: Write the failing test**

Create `src/ui/quick-arrows/QuickArrows.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { QuickArrows } from "./QuickArrows";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

function makeApi(elements: El[]) {
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: "selection" },
    selectedElementIds: {},
    selectedLinearElement: null,
  };
  return {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: () => () => {},
  } as unknown as ExcalidrawAPI;
}

const rect = (over: Partial<El> = {}): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
  ...over,
});

function movePointer(x: number, y: number) {
  act(() => {
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y, buttons: 0 }));
  });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("QuickArrows", () => {
  it("renders nothing until something is hovered", () => {
    render(<QuickArrows api={makeApi([rect()])} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });

  it("renders all four arrows for a hovered shape", () => {
    render(<QuickArrows api={makeApi([rect()])} />);
    movePointer(50, 25);
    for (const name of [
      "Quick arrow up",
      "Quick arrow right",
      "Quick arrow down",
      "Quick arrow left",
    ]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  it("positions each arrow outside its edge and points it outward", () => {
    render(<QuickArrows api={makeApi([rect()])} />);
    movePointer(50, 25);
    const up = screen.getByRole("button", { name: "Quick arrow up" });
    // Edge midpoint (50, 0), out by ARROW_GAP + ARROW_DEPTH / 2 = 20.
    expect(up.style.transform).toContain("translate(50px, -20px)");
    expect(up.style.transform).toContain("rotate(0deg)");

    const right = screen.getByRole("button", { name: "Quick arrow right" });
    expect(right.style.transform).toContain("rotate(90deg)");
  });

  it("omits the arrows a box is too small to carry", () => {
    render(<QuickArrows api={makeApi([rect({ width: 10 })])} />);
    movePointer(5, 25);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Quick arrow right" })).toBeTruthy();
  });

  it("renders nothing when there is no api yet", () => {
    render(<QuickArrows api={null} />);
    expect(screen.queryByRole("button", { name: "Quick arrow up" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/quick-arrows/QuickArrows.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the stylesheet**

Create `src/ui/quick-arrows/quick-arrows.css`:

```css
/* src/ui/quick-arrows/quick-arrows.css
 * Quick-arrow overlay: four fat translucent triangles around the hovered
 * shape, each the grab handle for drawing an elbow arrow from that side
 * (geometry in quick-arrow-geometry.ts, drag in useQuickArrowDrag.ts). */

.flow-quick-arrows {
  position: fixed;
  inset: 0;
  /* The overlay must never steal canvas events — only the triangles
     themselves (pointer-events: auto below) intercept anything. */
  pointer-events: none;
  /* Same tier as the shape-handle overlay (shape-handles.css): above the
     canvas, below both rail tiers and the quickbar/bottombar. */
  z-index: 80;
}

.flow-quick-arrow {
  position: absolute;
  top: 0;
  left: 0;
  /* Keep these in sync with ARROW_WIDTH / ARROW_DEPTH in
     quick-arrow-geometry.ts — the module computes positions from those two
     numbers, and a mismatch here shifts the glyph off its anchor. */
  width: 18px;
  height: 12px;
  margin: 0;
  padding: 0;
  border: 0;
  background: rgba(115, 190, 245, 0.5);
  /* A triangle pointing up at rotation 0, which is the convention
     `arrowPlacement` returns its `rotation` in. */
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  cursor: crosshair;
  pointer-events: auto;
  /* Positioned via `transform: translate(...)` so panning and zooming move a
     compositor-friendly property instead of triggering layout. */
  will-change: transform;
}

.flow-quick-arrow:hover,
.flow-quick-arrow:focus-visible {
  background: rgba(59, 165, 240, 0.85);
  outline: none;
}
```

- [ ] **Step 4: Write the component**

Create `src/ui/quick-arrows/QuickArrows.tsx`:

```tsx
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useHoverTarget } from "./useHoverTarget";
import {
  arrowPlacement,
  visibleSides,
  type QuickArrowSide,
  type Viewport,
} from "./quick-arrow-geometry";
import "./quick-arrows.css";

interface QuickArrowsProps {
  api: ExcalidrawAPI | null;
}

const LABELS: Record<QuickArrowSide, string> = {
  n: "Quick arrow up",
  e: "Quick arrow right",
  s: "Quick arrow down",
  w: "Quick arrow left",
};

interface ViewportAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

/**
 * The quick-arrow overlay: four translucent triangles around the hovered
 * bindable shape. Press one and drag to draw an elbow arrow from that side of
 * the shape, without picking up the arrow tool.
 *
 * Mounted as a sibling of `<Excalidraw>` (see `useHoverTarget`'s docstring for
 * why it can never live inside `App`), and modelled closely on
 * `src/ui/shapes/ShapeHandles.tsx` — real `<button>`s in a `pointer-events:
 * none` overlay, positioned by `transform` so pan and zoom stay
 * compositor-friendly.
 */
export function QuickArrows({ api }: QuickArrowsProps) {
  const element = useHoverTarget(api);

  if (!api || !element) return null;

  const state = api.getAppState() as unknown as ViewportAppState;
  const v: Viewport = {
    zoom: state.zoom.value,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    offsetLeft: state.offsetLeft,
    offsetTop: state.offsetTop,
  };

  return (
    <div className="flow-quick-arrows">
      {visibleSides(element, v).map((side) => {
        const p = arrowPlacement(element, side, v);
        return (
          <button
            key={side}
            type="button"
            className="flow-quick-arrow"
            aria-label={LABELS[side]}
            style={{
              // The second translate centres the glyph on its anchor rather
              // than anchoring its top-left corner there; the rotation is
              // applied last so it spins about that centre.
              transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${p.rotation}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run src/ui/quick-arrows/
npm run typecheck
```

Expected: all PASS, typecheck clean.

- [ ] **Step 6: Mount it in App**

In `src/App.tsx`, add the import beside the `ShapeHandles` one (line 59):

```ts
import { QuickArrows } from "./ui/quick-arrows/QuickArrows";
```

and add the element immediately after `<ShapeHandles api={excalidrawApi} />` (line 537):

```tsx
      <QuickArrows api={excalidrawApi} />
```

Both are outside the `<div>` wrapping `<Excalidraw>`, which is exactly where they must be.

- [ ] **Step 7: Verify it renders in the real app**

```bash
npm run dev
```

Draw a rectangle, click the Selection tool, then hover the rectangle. Expect four translucent light-blue triangles at the edge midpoints, which follow pan, zoom, move, resize and rotate, and vanish ~120ms after the pointer leaves. They do nothing when clicked — that is Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/ui/quick-arrows/QuickArrows.tsx src/ui/quick-arrows/QuickArrows.test.tsx \
        src/ui/quick-arrows/quick-arrows.css src/App.tsx
git commit -m "feat(quick-arrows): render the hover overlay"
```

---

### Task 5: Shared tool restore

Extract the restore body from `useToolOverride` so the quick-arrow gesture can reuse it rather than re-deriving it, and give both a single place to coordinate through. Purely a refactor plus new module state — no user-visible change, and the existing `useToolOverride` tests are the safety net.

**Files:**
- Create: `src/ui/toolbar/tool-restore.ts`
- Modify: `src/ui/toolbar/useToolOverride.ts:40-88` (the `suspended` ref and `restore`)
- Test: `src/ui/toolbar/tool-restore.test.ts`

**Interfaces:**
- Consumes: `StyleMemoryHandle` from `src/ui/useStyleMemory.ts`, `categoryOfTool` from `src/lib/style-memory.ts`.
- Produces, all from `tool-restore.ts`:
  - `getSuspendedTool(): string | null`
  - `setSuspendedTool(type: string | null): void`
  - `beginToolGesture(): void`
  - `endToolGesture(): void`
  - `isToolGestureActive(): boolean`
  - `resetToolRestoreState(): void` — tests only
  - `restoreTool(api: ExcalidrawAPI, type: string, styleMemory?: StyleMemoryHandle | null): void`

- [ ] **Step 1: Write the failing test**

Create `src/ui/toolbar/tool-restore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  beginToolGesture,
  endToolGesture,
  getSuspendedTool,
  isToolGestureActive,
  resetToolRestoreState,
  restoreTool,
  setSuspendedTool,
} from "./tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

beforeEach(() => resetToolRestoreState());

describe("module state", () => {
  it("remembers the suspended tool", () => {
    expect(getSuspendedTool()).toBeNull();
    setSuspendedTool("rectangle");
    expect(getSuspendedTool()).toBe("rectangle");
    setSuspendedTool(null);
    expect(getSuspendedTool()).toBeNull();
  });

  it("tracks whether a canvas gesture owns the tool", () => {
    expect(isToolGestureActive()).toBe(false);
    beginToolGesture();
    expect(isToolGestureActive()).toBe(true);
    endToolGesture();
    expect(isToolGestureActive()).toBe(false);
  });
});

describe("restoreTool", () => {
  function makeApi() {
    const appState = {
      selectedElementIds: { a: true },
      selectedGroupIds: {},
      editingGroupId: null,
      currentItemArrowType: "elbow",
    };
    return {
      api: {
        getAppState: () => appState,
        setActiveTool: vi.fn(),
        updateScene: vi.fn(),
      } as unknown as ExcalidrawAPI,
      appState,
    };
  }

  it("re-arms the tool locked, and puts the selection back", () => {
    const { api } = makeApi();
    restoreTool(api, "rectangle");
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: true });
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { selectedElementIds: { a: true }, selectedGroupIds: {}, editingGroupId: null },
    });
  });

  it("reloads the restored tool's style-memory category through the handle", () => {
    const { api } = makeApi();
    const styleMemory = { reloadCategory: vi.fn() };
    restoreTool(api, "rectangle", styleMemory as never);
    expect(styleMemory.reloadCategory).toHaveBeenCalledWith("shape", "rectangle", "elbow");
  });

  it("skips the style-memory reload when no handle is supplied", () => {
    const { api } = makeApi();
    expect(() => restoreTool(api, "rectangle")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/toolbar/tool-restore.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the module**

Create `src/ui/toolbar/tool-restore.ts`. The body of `restoreTool` is moved verbatim from `useToolOverride`'s `restore` — including all of its comments, which document three separate bugs and must not be lost in the move.

```ts
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { StyleMemoryHandle } from "../useStyleMemory";
import { categoryOfTool } from "../../lib/style-memory";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Shared state between the two things that can take the active tool away and
 * have to give it back: the Cmd/Ctrl temporary-selection override
 * (`useToolOverride`) and a quick-arrow drag (`useQuickArrowDrag`).
 *
 * Module state rather than React state because both consumers are hooks that
 * mount exactly once, neither renders off these values, and a keyup handler
 * must read what a pointerdown handler wrote without waiting for a re-render.
 * `resetToolRestoreState` exists for tests, which would otherwise leak state
 * between cases.
 */
let suspendedTool: string | null = null;
let gestureActive = false;

/** The tool the Cmd/Ctrl override is currently suspending, or null when idle. */
export function getSuspendedTool(): string | null {
  return suspendedTool;
}

export function setSuspendedTool(type: string | null): void {
  suspendedTool = type;
}

/**
 * Claim the tool for a canvas gesture in flight.
 *
 * While this is set, `useToolOverride` must NOT restore on keyup: handing the
 * tool back mid-gesture would yank it out from under vendor's live drag. The
 * gesture captured what to restore at its start and owns the restore instead.
 */
export function beginToolGesture(): void {
  gestureActive = true;
}

export function endToolGesture(): void {
  gestureActive = false;
}

export function isToolGestureActive(): boolean {
  return gestureActive;
}

/** Tests only. */
export function resetToolRestoreState(): void {
  suspendedTool = null;
  gestureActive = false;
}

/**
 * Give `type` back as the active tool, preserving the selection and repairing
 * style memory.
 *
 * Three steps, each of which fixed a real bug and none of which is optional:
 *
 * 1. Re-arm the tool **locked** — flow is a modal-tool app and `locked` has
 *    exactly one correct value.
 * 2. Put the selection back. Vendor resets `selectedElementIds` for every
 *    non-selection tool (App.tsx:4758), so step 1 clears it on the way past.
 *    Read the selection FRESH rather than from a snapshot taken at gesture
 *    start: a snapshot would clobber anything that changed in between — most
 *    sharply a Cmd+Z, whose undo restores its own selection. Omitting
 *    `elements` leaves the scene alone (vendor guards the replace on
 *    `if (sceneData.elements)`, App.tsx:3972).
 * 3. Reload the restored tool's style-memory category **through the handle**,
 *    not with a hand-rolled `updateScene`. Step 2 creates a state style
 *    memory's design never had to account for — a drawing tool active with
 *    elements selected — and its adopt-on-select cannot tell that from a
 *    genuine new selection, so it re-fires and leaves `currentItem*` holding
 *    the reselected element's own style from a possibly different category. A
 *    hand-rolled write (the first attempt at this) bypasses the bookkeeping
 *    that keeps the drift watcher from re-reading the write as an unexplained
 *    edit and folding it into the wrong bucket, corrupting THAT bucket
 *    instead. See [[style-memory]] and [[tool-override]].
 */
export function restoreTool(
  api: ExcalidrawAPI,
  type: string,
  styleMemory?: StyleMemoryHandle | null,
): void {
  const { selectedElementIds, selectedGroupIds, editingGroupId } = api.getAppState();
  api.setActiveTool({ type, locked: true } as SetToolArg);
  api.updateScene({
    appState: { selectedElementIds, selectedGroupIds, editingGroupId },
  });
  const category = categoryOfTool(type);
  if (category && styleMemory) {
    const { currentItemArrowType } = api.getAppState() as unknown as {
      currentItemArrowType?: string;
    };
    styleMemory.reloadCategory(category, type, currentItemArrowType ?? "sharp");
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/toolbar/tool-restore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rewire `useToolOverride` onto the module**

In `src/ui/toolbar/useToolOverride.ts`:

Add to the imports:

```ts
import {
  getSuspendedTool,
  isToolGestureActive,
  restoreTool,
  setSuspendedTool,
} from "./tool-restore";
```

Delete the `suspended` ref declaration and its comment (lines ~40-43) — the module now owns that state, so there is one source of truth rather than a ref and a module flag drifting apart.

Replace the whole `restore` function body with:

```ts
    const restore = () => {
      const type = getSuspendedTool();
      if (!type) return;
      setSuspendedTool(null);
      // A canvas gesture (a quick-arrow drag) is mid-flight and now owns the
      // restore: it captured this same tool at its start and hands it back on
      // pointer-up. Restoring here would switch the tool out from under
      // vendor's live drag.
      if (isToolGestureActive()) return;
      restoreTool(api, type, styleMemory);
    };
```

Replace the two remaining `suspended.current` sites in `onKeyDown`:

```ts
      if (getSuspendedTool()) return;
```

and

```ts
      setSuspendedTool(state.activeTool.type);
```

Remove the now-unused `SetToolArg` type alias and `categoryOfTool` import **only if** nothing else in the file still uses them — the second effect (`enforce`) still calls `api.setActiveTool({ type, locked: true } as SetToolArg)`, so `SetToolArg` stays; `categoryOfTool` goes.

- [ ] **Step 6: Run the existing tests to prove the refactor is behaviour-preserving**

```bash
npx vitest run src/ui/toolbar/ src/ui/style-memory-tool-override.test.tsx
```

Expected: all PASS. If any test asserted on the internal ref it will need to call `resetToolRestoreState()` in a `beforeEach` — add that, and nothing else.

```bash
npx playwright test e2e/tool-override.spec.ts e2e/style-memory.spec.ts --project=chromium --reporter=list
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar/tool-restore.ts src/ui/toolbar/tool-restore.test.ts \
        src/ui/toolbar/useToolOverride.ts
git commit -m "refactor(toolbar): extract the shared tool-restore path"
```

---

### Task 6: The quick-arrow drag

**Files:**
- Create: `src/ui/quick-arrows/useQuickArrowDrag.ts`
- Modify: `src/ui/quick-arrows/QuickArrows.tsx` (wire `onPointerDown`)
- Modify: `src/App.tsx` (pass `styleMemory` to `<QuickArrows>`)
- Test: `src/ui/quick-arrows/useQuickArrowDrag.test.tsx`

**Interfaces:**
- Consumes: `edgeMidpoint`, `toViewport`, `type QuickArrowSide`, `type Viewport` (Task 2); `beginToolGesture`, `endToolGesture`, `getSuspendedTool`, `restoreTool` (Task 5); `StyleMemoryHandle` from `src/ui/useStyleMemory.ts`.
- Produces: `useQuickArrowDrag(args: { api: ExcalidrawAPI | null; element: SceneElement; side: QuickArrowSide; styleMemory?: StyleMemoryHandle | null }): (e: React.PointerEvent) => void`. `<QuickArrows>` gains an optional `styleMemory` prop.

**Note on structure:** the hook is called once per rendered triangle, so — exactly as `ShapeHandles` does with `ShapeHandleDot` — each triangle must be its own component instance. Calling the hook inside a `.map()` in the parent would call it a varying number of times per render, which breaks the rules of hooks.

- [ ] **Step 1: Write the failing test**

Create `src/ui/quick-arrows/useQuickArrowDrag.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
import { resetToolRestoreState, setSuspendedTool } from "../toolbar/tool-restore";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

const rect = (): El => ({
  id: "r",
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  angle: 0,
  locked: false,
});

function makeApi(activeTool = "selection") {
  const appState = {
    zoom: { value: 1 },
    scrollX: 0,
    scrollY: 0,
    offsetLeft: 0,
    offsetTop: 0,
    activeTool: { type: activeTool },
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    currentItemArrowType: "sharp",
  };
  return {
    getAppState: () => appState,
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

/**
 * Stand in for the vendor canvas the hook dispatches onto — including the one
 * behaviour that constrains the hook's design: vendor registers its own window
 * pointerup listener from INSIDE its pointerdown handler. `order` records who
 * ran first on pointerup.
 */
function installCanvas() {
  const canvas = document.createElement("canvas");
  canvas.className = "interactive";
  const seen: PointerEvent[] = [];
  const order: string[] = [];
  canvas.addEventListener("pointerdown", (e) => {
    seen.push(e as PointerEvent);
    window.addEventListener("pointerup", () => order.push("vendor"), { once: true });
  });
  document.body.appendChild(canvas);
  return { canvas, seen, order };
}

/** A minimal stand-in for React's synthetic pointer event. */
function pointerDownEvent() {
  return {
    pointerId: 7,
    pointerType: "mouse",
    clientX: 130,
    clientY: 25,
    button: 0,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
  } as unknown as React.PointerEvent;
}

/** Run the queued animation frame callbacks. */
function flushFrame() {
  act(() => void vi.advanceTimersByTime(20));
}

beforeEach(() => {
  vi.useFakeTimers();
  resetToolRestoreState();
  // jsdom has no rAF timing; drive it off the fake timer clock instead.
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16) as unknown as number,
  );
  vi.stubGlobal("cancelAnimationFrame", (id: number) =>
    clearTimeout(id as unknown as NodeJS.Timeout),
  );
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useQuickArrowDrag", () => {
  it("arms the elbow arrow tool on pointer down", () => {
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "elbow" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });

  it("dispatches the pointerdown on the canvas one frame later, at the edge midpoint", () => {
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    expect(seen, "not dispatched in the same tick").toHaveLength(0);

    flushFrame();
    expect(seen).toHaveLength(1);
    // East edge midpoint of a 100x50 box at the origin, identity viewport.
    expect(seen[0].clientX).toBe(100);
    expect(seen[0].clientY).toBe(25);
    expect(seen[0].pointerId).toBe(7);
    expect(seen[0].bubbles).toBe(true);
  });

  it("cancels the dispatch if the pointer is released before the frame", () => {
    const api = makeApi();
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    flushFrame();
    expect(seen, "a click must not leave vendor mid-drag").toHaveLength(0);
  });

  it("restores the previous tool on pointer up", () => {
    const api = makeApi("rectangle");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("restores the tool the Cmd/Ctrl override was suspending, not selection", () => {
    // The override is engaged: the active tool reads "selection", but the tool
    // the user actually wants back is the one it suspended.
    setSuspendedTool("ellipse");
    const api = makeApi("selection");
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "ellipse", locked: true });
  });

  it("restores the tool AFTER vendor finalizes, not before", () => {
    // Window pointerup listeners fire in registration order. If the hook
    // registered its restore at pointerdown it would run a frame ahead of
    // vendor's, switching the tool out from under the in-flight drag.
    const api = makeApi("rectangle");
    const { order } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    (api.setActiveTool as ReturnType<typeof vi.fn>).mockImplementation(
      (t: { type: string }) => {
        if (t.type === "rectangle") order.push("restore");
      },
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(order).toEqual(["vendor", "restore"]);
  });

  it("puts the previous arrow type back so the gesture leaves no preference behind", () => {
    const api = makeApi();
    installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    act(() => void window.dispatchEvent(new PointerEvent("pointerup")));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "sharp" },
    });
  });

  it("does nothing when there is no api", () => {
    const { seen } = installCanvas();
    const { result } = renderHook(() =>
      useQuickArrowDrag({ api: null, element: rect() as never, side: "e" }),
    );
    act(() => result.current(pointerDownEvent()));
    flushFrame();
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run src/ui/quick-arrows/useQuickArrowDrag.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the hook**

Create `src/ui/quick-arrows/useQuickArrowDrag.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import type { StyleMemoryHandle } from "../useStyleMemory";
import {
  beginToolGesture,
  endToolGesture,
  getSuspendedTool,
  restoreTool,
} from "../toolbar/tool-restore";
import { edgeMidpoint, toViewport, type QuickArrowSide, type Viewport } from "./quick-arrow-geometry";

interface UseQuickArrowDragArgs {
  api: ExcalidrawAPI | null;
  element: SceneElement;
  side: QuickArrowSide;
  styleMemory?: StyleMemoryHandle | null;
}

interface DragAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
  activeTool: { type: string };
  currentItemArrowType: string;
}

/** `setActiveTool` takes a discriminated union keyed on `type`. */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Turn a press on one quick-arrow triangle into a real Excalidraw
 * arrow-draw gesture.
 *
 * flow does **not** draw the arrow. It arms the elbow arrow tool and hands
 * vendor a single synthesized `pointerdown` on `canvas.interactive`; from
 * there vendor owns the gesture, because `handleCanvasPointerDown` registers
 * its move/up listeners on `window` rather than on the pointerdown target
 * (vendor App.tsx). Binding, elbow routing, the binding highlight, snapping,
 * escape-to-cancel and single-entry undo therefore all come for free, and
 * none of them is reimplemented here.
 *
 * Two details are load-bearing and neither is obvious:
 *
 * **The origin is the grabbed edge's midpoint, not the pointer.**
 * `maxBindingDistance_simple` is only ~15px at zoom 1, so a gesture
 * originating out on the triangle would silently fail to bind to the source
 * shape — the most important half of the feature, lost with no error. It also
 * gives the elbow route its outgoing heading, so the top arrow produces an
 * arrow that leaves upward.
 *
 * **The dispatch waits one animation frame.** React has not committed the
 * tool change by the time this handler returns, so a same-tick dispatch
 * reaches vendor with `activeTool` still `"selection"` and draws a selection
 * marquee instead of an arrow (measured, not assumed). The pointer-up handler
 * cancels a still-pending frame, which is both what keeps a very fast click
 * from leaving vendor stuck mid-drag and what makes "a click does nothing"
 * true.
 */
export function useQuickArrowDrag({
  api,
  element,
  side,
  styleMemory,
}: UseQuickArrowDragArgs): (e: React.PointerEvent) => void {
  const frame = useRef<number | null>(null);
  const cleanup = useRef<(() => void) | null>(null);

  // A gesture still in flight when this triangle unmounts would leave the
  // gesture flag set forever, permanently disabling the Cmd/Ctrl override's
  // restore. Mirrors ShapeHandles' unmount-only release of the
  // deferred-commit bit, and for the same reason: there is no synthetic
  // "gesture ended" signal to key an effect off.
  useEffect(() => () => cleanup.current?.(), []);

  return useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!api) return;

      const canvas = document.querySelector("canvas.interactive");
      if (!canvas) return;

      const state = api.getAppState() as unknown as DragAppState;
      const v: Viewport = {
        zoom: state.zoom.value,
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        offsetLeft: state.offsetLeft,
        offsetTop: state.offsetTop,
      };
      const mid = edgeMidpoint(element, side);
      const origin = toViewport(mid.x, mid.y, v);

      // What to hand back afterwards. While the Cmd/Ctrl override is engaged
      // the active tool reads "selection", but the tool the user actually
      // wants back is the one the override suspended.
      const previousTool = getSuspendedTool() ?? state.activeTool.type;

      const { pointerId, pointerType } = e;
      const previousArrowType = state.currentItemArrowType;

      const setAppState = (appState: Record<string, unknown>) =>
        api.updateScene({ appState } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);

      /** Hand the tool, and the arrow-type preference, back. */
      const restore = () => {
        endToolGesture();
        // Before restoreTool, not after: its style-memory reload reads
        // `currentItemArrowType` and would otherwise fold this gesture's
        // temporary "elbow" into the linear bucket as if the user had chosen
        // it. The already-drawn arrow keeps its own elbowed geometry — this
        // only puts the *next* arrow's default back.
        setAppState({ currentItemArrowType: previousArrowType });
        restoreTool(api, previousTool, styleMemory);
      };

      // Released before the dispatch: a click, not a drag. Cancelling matters
      // — vendor would otherwise receive a pointerdown with no matching
      // pointerup and hang in drag state — and it is also what makes "a click
      // does nothing" true.
      const onEarlyUp = () => {
        window.removeEventListener("pointerup", onEarlyUp);
        cleanup.current = null;
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        restore();
      };

      const onGestureUp = () => {
        window.removeEventListener("pointerup", onGestureUp);
        cleanup.current = null;
        restore();
      };

      beginToolGesture();
      cleanup.current = () => {
        window.removeEventListener("pointerup", onEarlyUp);
        window.removeEventListener("pointerup", onGestureUp);
        if (frame.current !== null) cancelAnimationFrame(frame.current);
        frame.current = null;
        endToolGesture();
      };
      window.addEventListener("pointerup", onEarlyUp);

      setAppState({ currentItemArrowType: "elbow" });
      api.setActiveTool({ type: "arrow", locked: true } as SetToolArg);

      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        window.removeEventListener("pointerup", onEarlyUp);
        canvas.dispatchEvent(
          new PointerEvent("pointerdown", {
            // React delegates at the root container, so the event has to
            // bubble for vendor's onPointerDown to see it at all.
            bubbles: true,
            cancelable: true,
            composed: true,
            pointerId,
            pointerType,
            isPrimary: true,
            button: 0,
            buttons: 1,
            clientX: origin.x,
            clientY: origin.y,
          }),
        );
        // Registered AFTER the dispatch, and this ordering is load-bearing.
        // Window pointerup listeners fire in registration order, and vendor
        // registers its own inside the dispatch above. Registering ours at
        // pointerdown — one frame earlier — would put it FIRST, so the tool
        // would be switched back out from under vendor before it finalized
        // the arrow.
        window.addEventListener("pointerup", onGestureUp);
      });
    },
    [api, element, side, styleMemory],
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

```bash
npx vitest run src/ui/quick-arrows/useQuickArrowDrag.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Wire the hook into the overlay**

In `src/ui/quick-arrows/QuickArrows.tsx`, add the imports:

```tsx
import type { SceneElement } from "../shapes/useShapeSelection";
import type { StyleMemoryHandle } from "../useStyleMemory";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
```

Extend the props, and destructure the new one:

```tsx
interface QuickArrowsProps {
  api: ExcalidrawAPI | null;
  styleMemory?: StyleMemoryHandle | null;
}
```

```tsx
export function QuickArrows({ api, styleMemory }: QuickArrowsProps) {
```

Add the per-triangle component above `QuickArrows`:

```tsx
interface QuickArrowProps {
  api: ExcalidrawAPI;
  element: SceneElement;
  side: QuickArrowSide;
  placement: { x: number; y: number; rotation: number };
  styleMemory?: StyleMemoryHandle | null;
}

/**
 * One triangle. Split out so `useQuickArrowDrag` has a single, unconditional
 * call site per glyph — calling a hook inside `visibleSides(...).map(...)`
 * would call it a varying number of times per render, which breaks the rules
 * of hooks. Same split, for the same reason, as `ShapeHandleDot`.
 */
function QuickArrow({ api, element, side, placement, styleMemory }: QuickArrowProps) {
  const onPointerDown = useQuickArrowDrag({ api, element, side, styleMemory });
  return (
    <button
      type="button"
      className="flow-quick-arrow"
      aria-label={LABELS[side]}
      onPointerDown={onPointerDown}
      style={{
        transform: `translate(${placement.x}px, ${placement.y}px) translate(-50%, -50%) rotate(${placement.rotation}deg)`,
      }}
    />
  );
}
```

and replace the entire body of the `.map(...)` — the `const p = arrowPlacement(...)` line goes away too, since the placement is now computed inline as a prop:

```tsx
      {visibleSides(element, v).map((side) => (
        <QuickArrow
          key={side}
          api={api}
          element={element}
          side={side}
          placement={arrowPlacement(element, side, v)}
          styleMemory={styleMemory}
        />
      ))}
```

In `src/App.tsx`, pass the handle that already exists on line ~92:

```tsx
      <QuickArrows api={excalidrawApi} styleMemory={styleMemory} />
```

- [ ] **Step 6: Run the full unit suite**

```bash
npx vitest run
npm run typecheck
```

Expected: all PASS, typecheck clean. `QuickArrows.test.tsx` from Task 4 still passes unchanged — the buttons render identically, they just now have a handler.

- [ ] **Step 7: Verify by hand in the real app**

```bash
npm run dev
```

Draw two rectangles, switch to Selection, hover the first, then press its right-hand arrow and drag onto the second. Expect an elbow arrow bound at both ends, one Ctrl+Z to remove it, and the Selection tool still active afterwards. Then draw a rectangle (leaving the Rectangle tool armed), hover a shape — no arrows — and hold Cmd/Ctrl without moving the mouse: the arrows appear.

- [ ] **Step 8: Commit**

```bash
git add src/ui/quick-arrows/useQuickArrowDrag.ts src/ui/quick-arrows/useQuickArrowDrag.test.tsx \
        src/ui/quick-arrows/QuickArrows.tsx src/App.tsx
git commit -m "feat(quick-arrows): draw a bound elbow arrow by dragging a handle"
```

---

### Task 7: End-to-end coverage

The unit tests all run against a stand-in canvas. Only these prove the synthesized pointerdown actually drives vendor.

**Files:**
- Create: `e2e/quick-arrows.spec.ts`

**Interfaces:**
- Consumes: `gotoApp` from `e2e/helpers/app.ts`, `pickTool` from `e2e/helpers/rails.ts`, and the `aria-label`s from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the spec**

Create `e2e/quick-arrows.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./helpers/app";
import { pickTool } from "./helpers/rails";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Quick arrows: press a triangle beside a hovered shape and drag to draw an
 * elbow arrow bound to it, without picking up the arrow tool.
 *
 * flow contributes only the overlay and one synthesized `pointerdown`; the
 * gesture itself is vendor's. These tests are therefore the only ones that
 * prove the handoff works — every unit test in `src/ui/quick-arrows/` runs
 * against a stand-in canvas element.
 */

/** Draw a rectangle and leave the Selection tool armed. flow's permanent tool
 *  lock keeps Rectangle armed after a draw, so the switch back is required. */
async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
  await pickTool(page, "Selection");
  await page.keyboard.press("Escape");
}

const scene = (page: Page) =>
  page.evaluate(() =>
    (window as any).h.app.scene.getNonDeletedElements().map((el: any) => ({
      id: el.id,
      type: el.type,
      elbowed: el.elbowed,
      start: el.startBinding?.elementId ?? null,
      end: el.endBinding?.elementId ?? null,
    })),
  );

const upArrow = (page: Page) => page.getByRole("button", { name: "Quick arrow up" });
const rightArrow = (page: Page) => page.getByRole("button", { name: "Quick arrow right" });

test("hovering a shape reveals four arrows, and leaving hides them", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 400, 300, 600, 400);

  await expect(upArrow(page)).toHaveCount(0);

  await page.mouse.move(500, 350);
  for (const name of [
    "Quick arrow up",
    "Quick arrow right",
    "Quick arrow down",
    "Quick arrow left",
  ]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }

  await page.mouse.move(900, 700);
  await expect(upArrow(page)).toHaveCount(0);
});

test("the arrows survive the journey from the shape out to the glyph", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 400, 300, 600, 400);
  await page.mouse.move(500, 350);
  await expect(upArrow(page)).toBeVisible();
  // 20px above the top edge — outside the element, inside the halo. If the
  // hover region were the element's own hit area this would dismiss them.
  await page.mouse.move(500, 280);
  await expect(upArrow(page)).toBeVisible();
});

test("dragging onto a second shape binds both ends, and one undo removes it", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 300, 300, 450, 400);
  await drawRect(page, 750, 300, 900, 400);

  await page.mouse.move(375, 350);
  await rightArrow(page).hover();
  await page.mouse.down();
  await page.mouse.move(650, 350, { steps: 12 });
  await page.mouse.move(820, 350, { steps: 12 });
  await page.mouse.up();

  const els = await scene(page);
  const arrow = els.find((e: any) => e.type === "arrow");
  expect(arrow, "an arrow was drawn").toBeTruthy();
  expect(arrow.elbowed).toBe(true);
  expect(arrow.start).toBe(els[0].id);
  expect(arrow.end).toBe(els[1].id);

  await page.keyboard.press("Control+z");
  expect((await scene(page)).map((e: any) => e.type)).toEqual(["rectangle", "rectangle"]);
});

test("dropping on empty canvas leaves the end unbound", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 300, 300, 450, 400);

  await page.mouse.move(375, 350);
  await rightArrow(page).hover();
  await page.mouse.down();
  await page.mouse.move(700, 550, { steps: 12 });
  await page.mouse.up();

  const arrow = (await scene(page)).find((e: any) => e.type === "arrow");
  expect(arrow.start).not.toBeNull();
  expect(arrow.end).toBeNull();
});

test("a click with no movement creates nothing and mints no undo entry", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 300, 300, 450, 400);

  await page.mouse.move(375, 350);
  await rightArrow(page).hover();
  await page.mouse.down();
  await page.mouse.up();

  expect((await scene(page)).map((e: any) => e.type)).toEqual(["rectangle"]);
  // If the click had minted an undo entry, this undo would consume it and
  // leave the rectangle standing.
  await page.keyboard.press("Control+z");
  expect(await scene(page)).toHaveLength(0);
});

test("the previous tool is restored after a gesture", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 300, 300, 450, 400);

  await page.mouse.move(375, 350);
  await rightArrow(page).hover();
  await page.mouse.down();
  await page.mouse.move(700, 550, { steps: 12 });
  await page.mouse.up();

  await expect
    .poll(() => page.evaluate(() => (window as any).h.app.state.activeTool.type))
    .toBe("selection");
});

test("no arrows while a drawing tool is armed; holding Cmd/Ctrl reveals them", async ({
  page,
}) => {
  await gotoApp(page);
  await drawRect(page, 400, 300, 600, 400);
  await pickTool(page, "Ellipse");

  await page.mouse.move(500, 350);
  await expect(upArrow(page)).toHaveCount(0);

  // The pointer does NOT move here. The override switches the active tool to
  // selection, and that alone has to reveal the arrows.
  await page.keyboard.down("Control");
  await expect(upArrow(page)).toBeVisible();
  await page.keyboard.up("Control");
  await expect(upArrow(page)).toHaveCount(0);
});

test("no arrows for a freedraw stroke, which an arrow cannot bind to", async ({ page }) => {
  await gotoApp(page);
  await pickTool(page, "Draw");
  await page.mouse.move(400, 300);
  await page.mouse.down();
  await page.mouse.move(600, 400, { steps: 10 });
  await page.mouse.up();
  await pickTool(page, "Selection");
  await page.keyboard.press("Escape");

  await page.mouse.move(500, 350);
  await expect(upArrow(page)).toHaveCount(0);
});

test("releasing Cmd/Ctrl mid-drag does not break the in-flight gesture", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 300, 300, 450, 400);
  await drawRect(page, 750, 300, 900, 400);
  await pickTool(page, "Ellipse");

  await page.mouse.move(375, 350);
  await page.keyboard.down("Control");
  await rightArrow(page).hover();
  await page.mouse.down();
  await page.mouse.move(650, 350, { steps: 8 });
  // The override's keyup restore would hand the tool back to Ellipse right
  // here, mid-drag, if the gesture did not own the restore.
  await page.keyboard.up("Control");
  await page.mouse.move(820, 350, { steps: 8 });
  await page.mouse.up();

  const arrow = (await scene(page)).find((e: any) => e.type === "arrow");
  expect(arrow, "the arrow survived the modifier release").toBeTruthy();
  expect(arrow.start).not.toBeNull();
  expect(arrow.end).not.toBeNull();
  // And the tool the override was suspending comes back, not selection.
  await expect
    .poll(() => page.evaluate(() => (window as any).h.app.state.activeTool.type))
    .toBe("ellipse");
});

test("the arrows follow the shape when it is panned", async ({ page }) => {
  await gotoApp(page);
  await drawRect(page, 400, 300, 600, 400);
  await page.mouse.move(500, 350);
  const before = await upArrow(page).boundingBox();

  await page.mouse.move(500, 600);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(400, 600, { steps: 8 });
  await page.mouse.up({ button: "middle" });

  await page.mouse.move(400, 350);
  const after = await upArrow(page).boundingBox();
  expect(after!.x).toBeLessThan(before!.x - 50);

  // Zooming moves the anchor but must NOT scale the glyph: it is sized in
  // viewport pixels so it stays equally grabbable at any zoom.
  await page.keyboard.press("Control+=");
  await page.mouse.move(400, 351);
  await page.mouse.move(400, 350);
  const zoomed = await upArrow(page).boundingBox();
  expect(zoomed!.width).toBeCloseTo(after!.width, 0);
});
```

- [ ] **Step 2: Run the spec**

```bash
npx playwright test e2e/quick-arrows.spec.ts --project=chromium --reporter=list
```

Expected: all PASS.

Rail labels used here are verbatim from `src/ui/toolbar/tools.ts` — `"Selection"`, `"Rectangle"`, `"Ellipse"`, `"Draw"` (freedraw's label is "Draw", not "Freedraw") — and `pickTool` matches exactly, so a typo shows up as a locator timeout rather than a behaviour failure.

`page.keyboard.down("Control")` is the right modifier here: `overrideKeyFor(navigator.platform)` picks Meta only on Apple hardware, and this config runs Desktop Chrome on Linux.

The most likely genuine calibration is arrow-glyph hit points. `rightArrow(page).hover()` resolves the button's own box, so it survives a tuning change to `ARROW_GAP`/`ARROW_WIDTH`/`ARROW_DEPTH` — but the bare `page.mouse.move(500, 280)` in the halo test does not. If that test fails after a tuning change, recompute it as `top edge - (HALO - 6)`.

- [ ] **Step 3: Run the whole suite for regressions**

```bash
npx vitest run
npx playwright test --project=chromium --reporter=list
npm run typecheck
```

Expected: green. The known baseline is 185/185 e2e. If `rotate-cursor.spec.ts` fails, it is Task 1's coordinates — not this task.

- [ ] **Step 4: Commit**

```bash
git add e2e/quick-arrows.spec.ts
git commit -m "test(quick-arrows): cover the gesture end to end"
```

---

### Task 8: Record the work in repo-local memory

**Files:**
- Create: `.claude/memory/quick-arrows.md`
- Modify: `.claude/memory/MEMORY.md`

- [ ] **Step 1: Write the memory file**

Create `.claude/memory/quick-arrows.md`:

```markdown
# Quick arrows

Shipped 2026-08-25. Hover a bindable shape with the selection tool in hand and
four translucent triangles appear at its edge midpoints; press one and drag to
draw an elbow arrow bound to that shape. Spec:
`docs/superpowers/specs/2026-08-25-quick-arrows-design.md`.

## flow does not draw the arrow

The overlay arms the elbow arrow tool and dispatches **one synthesized
`pointerdown`** on `canvas.interactive`. Everything after that is vendor's,
because `handleCanvasPointerDown` registers its move/up listeners on
**`window`**, not on the pointerdown target — so binding, elbow routing, the
binding highlight, snapping, escape-to-cancel and single-entry undo all come
for free. This was measured by spike before the design was written, not
assumed. See [[flow-fork-strategy]] for why reaching for vendor's own machinery
beats reimplementing it.

## Four things that are silent if you get them wrong

1. **The origin must be the grabbed edge's midpoint, not the pointer.**
   `maxBindingDistance_simple` (vendor `element/src/binding.ts`) is only ~15px
   at zoom 1, and the triangle sits further out than that — so a gesture
   starting under the user's finger **silently fails to bind to the source**,
   with no error and a plausible-looking arrow. It also gives the elbow route
   its outgoing heading.
2. **The dispatch must wait an animation frame.** React has not committed the
   `setActiveTool` from the same handler, so a same-tick dispatch reaches
   vendor with `activeTool` still `"selection"` and draws a selection marquee
   instead of an arrow. Measured.
3. **The restore listener must be registered AFTER the dispatch, not at
   pointerdown.** Window pointerup listeners fire in registration order and
   vendor registers its own inside the dispatch; registering ours a frame
   earlier puts it first, switching the tool out from under the in-flight
   drag.
4. **The gesture owns the tool restore while it is in flight.** Releasing
   Cmd/Ctrl mid-drag would otherwise fire `useToolOverride`'s keyup restore.
   `src/ui/toolbar/tool-restore.ts` now holds the shared restore body plus the
   `suspendedTool` / `gestureActive` module state, and the override's `restore`
   early-returns while a gesture is active. The gesture restores the tool the
   override was *suspending*, not the `"selection"` the override installed.
   See [[tool-override]] and [[style-memory]] — the three-step restore
   (re-arm locked → put the selection back → reload the category through
   `styleMemory.reloadCategory`) each fixed a separate bug and none of it is
   optional.

## Fork edit

One: the rotation handle moved from above the top edge to diagonally outside
the NE corner (`ROTATION_HANDLE_CORNER_GAP` in
`packages/element/src/transformHandles.ts`), so the quick arrows can own the
edge midpoints. Cheap because `resizeTest` and the [[rotate-cursor]] edit both
read `getTransformHandlesFromCoords` — one site, not three. Guarded by
**build stage 9**, and `e2e/rotate-cursor.spec.ts` carries both the new
coordinate and a negative assertion at the old one.

## Deliberate divergence

Hover uses the element's **rotated bounding box expanded by the halo**, not
Excalidraw's own hit test (`getElementAtPosition` is an App private). A
transparent-filled rectangle's empty middle counts as a hover for us and does
not for Excalidraw. That is the right call for a "connect from here"
affordance, and the halo has to cover the glyphs themselves or the arrows
dismiss just as the pointer travels toward them.

## Not built, on purpose

Click-to-duplicate-a-shape (a click is currently a no-op, so it can be added
without breaking anything), a shape picker on drop-to-empty, a quick-arrow-type
preference, and quick arrows on multi-selection.
```

- [ ] **Step 2: Add the index pointer**

Append one line to `.claude/memory/MEMORY.md`:

```markdown
- [Quick arrows](quick-arrows.md) — hover-driven quick-connect arrows; flow synthesizes ONE pointerdown on `canvas.interactive` and vendor owns the rest of the gesture (its move/up listeners are on `window`); origin must be the edge midpoint (binding distance is ~15px) and the dispatch must wait a frame (React hasn't committed the tool change — same-tick draws a selection marquee); rotation handle moved to the NE corner, build stage 9
```

- [ ] **Step 3: Commit**

```bash
git add .claude/memory/quick-arrows.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record the quick-arrows work"
```

---

## Notes for the executor

**If the e2e binding assertions fail after Task 6**, the synthesized-pointerdown handoff has broken — most likely a vendor rebase changed `handleCanvasPointerDown`. The fallback is in the spec under "Alternatives rejected": an additive `ExcalidrawImperativeAPI` method taking the real pointer event plus an origin override. Stop and re-read the spec rather than patching around it; the overlay work in Tasks 2-4 is unaffected either way.

**Do not add a second fork edit** without stopping. The design budgets exactly one, and the fork's whole strategy is a lean, additive diff.

**The `ARROW_WIDTH` / `ARROW_DEPTH` / `ARROW_GAP` values are tunable** against `working/quick arrow option 2.png` — the spec says so explicitly. If you change them, change both `quick-arrow-geometry.ts` and `quick-arrows.css`; the CSS carries a comment saying so, because a mismatch shifts every glyph off its anchor.
