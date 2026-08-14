# Parametric Shapes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten new shapes to flow's shapebar — triangle, star, cylinder, cube, parallelogram, fat arrow, cloud, trapezoid, tape, summing junction — seven of them reshapeable by dragging orange dots.

**Architecture:** Each shape is an ordinary `rectangle` element carrying `customData.flowShape = { kind, p }`, where `p` holds parameters normalized to the element box. Flow owns the geometry as pure `(w, h, p) => { points, path? }` functions, registered at startup into a small vendor-side registry. Four fork sites read that registry: rendering, hit-testing, element creation, and one new `appState` field. Because the carrier is a bindable rectangle, arrow binding, bound text, resize, snapping, rotation, undo and save all work natively with no further work.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest + Testing Library, Playwright. Vendored Excalidraw fork at `vendor/excalidraw` (rebuilt with `npm run build:excalidraw`). No new dependencies.

Spec: `docs/superpowers/specs/2026-08-13-parametric-shapes-design.md`

## Global Constraints

- **Geometry never leaves the element box.** Every point a geometry function returns satisfies `0 <= x <= w` and `0 <= y <= h`. Bounds, selection chrome, snapping, alignment and export are inherited from rectangle and stay correct only while this holds. Handle drags clamp to the box for the same reason.
- **Parameters are fractions**, each clamped to `0..1`, stored in `customData.flowShape.p`. Never store absolute pixels.
- **One carrier type**: `rectangle`. Not diamond, not ellipse, not line.
- **`points` is mandatory in every geometry result**; `path` is optional. `points` is the hit-test outline and the fallback render; `path` is used for rendering when the shape has curves, and may contain multiple subpaths (`M … Z M … Z`) so inner detail like the cylinder's cap arc or the summing junction's cross is drawn without being hit-tested.
- **Fork edits are limited to these five files**: `packages/common/src/flowShapes.ts` (new), `packages/element/src/shape.ts`, `packages/utils/src/shape.ts`, `packages/excalidraw/components/App.tsx`, `packages/excalidraw/{types.ts,appState.ts}`. Anything else needs to come back to the plan author.
- **After any `vendor/` change, run `npm run build:excalidraw`** before the flow tests will see it. This is a known gotcha in this repo — a stale build silently shows old behaviour.
- Shape ids, labels and `shortcut: ""` are fixed by the spec's table. No shortcuts are assigned.
- Conventional commits. Unit tests (`npx vitest run`) and `npm run typecheck` green at the end of every task; Playwright (`npx playwright test --workers=1`) green but for the 2 known pre-existing `e2e/text-panel.spec.ts` failures.
- `pkill -f "vite"` kills its own invoking shell in this sandbox — use `pkill -f "[v]ite" || true`.

---

### Task 1: The geometry contract, the triangle, and an invariant harness

Pure flow-side code. Nothing is wired to the canvas yet, so this task ends with functions and tests only.

**Files:**
- Create: `src/ui/shapes/types.ts`, `src/ui/shapes/geometry/triangle.ts`, `src/ui/shapes/registry.ts`
- Test: `src/ui/shapes/geometry/invariants.ts` (shared test helper), `src/ui/shapes/geometry/triangle.test.ts`, `src/ui/shapes/registry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `FlowShapeKind`, `FlowShape`, `FlowGeometry`, `GeometryFn`, `HandleDef`, `ShapeDef` from `src/ui/shapes/types.ts`
  - `SHAPES_REGISTRY: Record<FlowShapeKind, ShapeDef>`, `defaultsFor(kind)`, `geometryFor(kind, w, h, p)` from `src/ui/shapes/registry.ts`
  - `expectInsideBox(geom, w, h)` and `expectClosed(geom)` from `src/ui/shapes/geometry/invariants.ts`

- [ ] **Step 1: Write the contract**

Create `src/ui/shapes/types.ts`:

```ts
/** The ten shapes flow draws on top of a rectangle carrier. */
export type FlowShapeKind =
  | "triangle"
  | "star"
  | "cylinder"
  | "cube"
  | "parallelogram"
  | "fatArrow"
  | "cloud"
  | "trapezoid"
  | "tape"
  | "sumJunction";

/** Parameters as fractions of the element box, each clamped to 0..1. */
export type ShapeParams = Record<string, number>;

/** What lives in `element.customData.flowShape`. */
export interface FlowShape {
  kind: FlowShapeKind;
  p: ShapeParams;
}

export type LocalPt = readonly [number, number];

export interface FlowGeometry {
  /**
   * The closed outline in local coordinates (0..w, 0..h).
   *
   * Always present. It is the hit-test polygon, and the rendered shape when
   * `path` is absent — which is why a curved shape must still supply a
   * reasonable polygonal approximation here.
   */
  points: readonly LocalPt[];
  /**
   * Optional SVG path in local coordinates, used for rendering when the shape
   * has curves. May contain several subpaths (`M … Z M … Z`) so inner detail
   * (the cylinder's cap arc, the summing junction's cross) is drawn without
   * becoming part of the hit area.
   */
  path?: string;
}

export type GeometryFn = (w: number, h: number, p: ShapeParams) => FlowGeometry;

/** One draggable orange dot. `at` and `from` must be inverses. */
export interface HandleDef {
  id: string;
  /** Where the dot sits, in local coordinates. Must land on the outline the
   *  geometry function actually draws, or the dot visibly drifts off its edge. */
  at: (w: number, h: number, p: ShapeParams) => LocalPt;
  /**
   * Turn a dragged local position back into the parameters it implies.
   *
   * Returns **only the parameters this handle owns** — callers merge the result
   * over the existing set (`{ ...p, ...from(...) }`) rather than replacing it,
   * so a shape with two handles does not lose the other one's value on drag.
   */
  from: (x: number, y: number, w: number, h: number, p: ShapeParams) => ShapeParams;
}

export interface ShapeDef {
  kind: FlowShapeKind;
  /** Accessible name; also the shapebar tool's label. */
  label: string;
  geometry: GeometryFn;
  /** Starting parameters for a newly drawn shape. */
  defaults: ShapeParams;
  /** Empty for the three shapes with no dots. */
  handles: readonly HandleDef[];
}
```

- [ ] **Step 2: Write the invariant harness**

Create `src/ui/shapes/geometry/invariants.ts`. These are the assertions every geometry test reuses — coordinate snapshots are deliberately avoided, since they would be brittle and would only prove the numbers had not changed:

```ts
import { expect } from "vitest";
import type { FlowGeometry } from "../types";

/** The load-bearing rule: nothing pokes outside the element box. Tolerance is
 *  for float noise only, not for genuine overhang. */
export function expectInsideBox(geom: FlowGeometry, w: number, h: number): void {
  for (const [x, y] of geom.points) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(x).toBeGreaterThanOrEqual(-0.001);
    expect(x).toBeLessThanOrEqual(w + 0.001);
    expect(y).toBeGreaterThanOrEqual(-0.001);
    expect(y).toBeLessThanOrEqual(h + 0.001);
  }
}

/** An outline must be a usable polygon: at least a triangle's worth of points,
 *  and not accidentally repeating its first point as its last (roughjs closes
 *  polygons itself, so a duplicated point draws a zero-length segment). */
export function expectClosed(geom: FlowGeometry): void {
  expect(geom.points.length).toBeGreaterThanOrEqual(3);
  const first = geom.points[0];
  const last = geom.points[geom.points.length - 1];
  expect(first[0] === last[0] && first[1] === last[1]).toBe(false);
}

/** Every subpath in a `path` string must be explicitly closed with Z. */
export function expectPathSubpathsClosed(geom: FlowGeometry): void {
  if (!geom.path) return;
  const subpaths = geom.path.split(/(?=M)/).filter((s) => s.trim().length > 0);
  expect(subpaths.length).toBeGreaterThan(0);
  for (const sub of subpaths) {
    expect(sub.trim().toUpperCase().endsWith("Z")).toBe(true);
  }
}
```

- [ ] **Step 3: Write the triangle**

Create `src/ui/shapes/geometry/triangle.ts`:

```ts
import type { GeometryFn } from "../types";

/** Isosceles triangle inscribed in the box: apex centred on the top edge,
 *  base spanning the bottom edge. No parameters. */
export const triangle: GeometryFn = (w, h) => ({
  points: [
    [w / 2, 0],
    [w, h],
    [0, h],
  ],
});
```

- [ ] **Step 4: Write the registry**

Create `src/ui/shapes/registry.ts`. It starts with one entry; later tasks add the other nine:

```ts
import type { FlowGeometry, FlowShapeKind, ShapeDef, ShapeParams } from "./types";
import { triangle } from "./geometry/triangle";

/**
 * Every flow shape, keyed by kind. This is the single source of truth for
 * geometry, starting parameters and handles: the shapebar builds its tools from
 * it, the vendor registry is populated from it, and the handle overlay reads
 * its `handles`.
 */
export const SHAPES_REGISTRY: Record<FlowShapeKind, ShapeDef> = {
  triangle: { kind: "triangle", label: "Triangle", geometry: triangle, defaults: {}, handles: [] },
} as Record<FlowShapeKind, ShapeDef>;

/** A fresh copy of a kind's starting parameters — callers mutate what they get. */
export function defaultsFor(kind: FlowShapeKind): ShapeParams {
  return { ...SHAPES_REGISTRY[kind]?.defaults };
}

/** Geometry for a kind, or null when the kind is unknown. */
export function geometryFor(
  kind: FlowShapeKind,
  w: number,
  h: number,
  p: ShapeParams,
): FlowGeometry | null {
  return SHAPES_REGISTRY[kind]?.geometry(w, h, p) ?? null;
}
```

The `as Record<...>` cast is deliberate and temporary: the registry is incomplete until Task 8 fills in all ten kinds. Task 8's final step removes the cast, at which point TypeScript enforces exhaustiveness — leave it in place until then.

- [ ] **Step 5: Write the tests**

Create `src/ui/shapes/geometry/triangle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { triangle } from "./triangle";
import { expectInsideBox, expectClosed } from "./invariants";

describe("triangle geometry", () => {
  it("is a three-point outline inside the box", () => {
    const geom = triangle(200, 100, {});
    expect(geom.points).toHaveLength(3);
    expectClosed(geom);
    expectInsideBox(geom, 200, 100);
  });

  it("puts the apex on the top edge's centre and the base on the bottom edge", () => {
    const geom = triangle(200, 100, {});
    expect(geom.points).toEqual([
      [100, 0],
      [200, 100],
      [0, 100],
    ]);
  });

  it("scales with the box rather than assuming a square", () => {
    const geom = triangle(40, 400, {});
    expectInsideBox(geom, 40, 400);
    expect(geom.points[0]).toEqual([20, 0]);
  });

  it("degrades safely at zero size", () => {
    const geom = triangle(0, 0, {});
    expectInsideBox(geom, 0, 0);
  });
});
```

Create `src/ui/shapes/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY, defaultsFor, geometryFor } from "./registry";

describe("the shape registry", () => {
  it("gives each entry a kind matching its key", () => {
    for (const [key, def] of Object.entries(SHAPES_REGISTRY)) {
      expect(def.kind).toBe(key);
    }
  });

  it("gives each entry a non-empty label", () => {
    for (const def of Object.values(SHAPES_REGISTRY)) {
      expect(def.label.length).toBeGreaterThan(0);
    }
  });

  it("hands out a fresh defaults copy each time", () => {
    const a = defaultsFor("triangle");
    a.injected = 1;
    expect(defaultsFor("triangle").injected).toBeUndefined();
  });

  it("returns geometry for a known kind", () => {
    expect(geometryFor("triangle", 10, 10, {})?.points).toHaveLength(3);
  });

  it("returns null for an unknown kind rather than throwing", () => {
    expect(geometryFor("nope" as never, 10, 10, {})).toBeNull();
  });
});
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run src/ui/shapes && npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/shapes
git commit -m "feat(shapes): geometry contract, registry, and the triangle"
```

---

### Task 2: The vendor registry and the render dispatch

The first fork edit. After this task, an element that already carries `customData.flowShape` renders as its shape — but nothing creates one yet, so you verify by stamping an element by hand.

**Files:**
- Create: `vendor/excalidraw/packages/common/src/flowShapes.ts`
- Modify: `vendor/excalidraw/packages/common/src/index.ts` (export the new module), `vendor/excalidraw/packages/element/src/shape.ts` (the `rectangle` case at ~798)
- Create: `src/ui/shapes/register.ts` (flow-side registration side-effect)
- Modify: `src/main.tsx` (import it for side effect)
- Test: `src/ui/shapes/register.test.ts`

**Interfaces:**
- Consumes: `SHAPES_REGISTRY` from Task 1.
- Produces: `registerFlowShape(kind, fn)` and `getFlowShapeGeometry(element)` from `@excalidraw/common`; `registerAllFlowShapes()` from `src/ui/shapes/register.ts`.

- [ ] **Step 1: Write the vendor registry**

Create `vendor/excalidraw/packages/common/src/flowShapes.ts`. It lives in `common` because both dispatch sites must import it and `packages/utils/src/shape.ts` already imports from `@excalidraw/common` — putting it in `element` would invert that dependency:

```ts
/**
 * flow addition. A registry of flow-owned shape geometry, populated at runtime
 * by the flow app.
 *
 * A `rectangle` element carrying `customData.flowShape = { kind, p }` is drawn
 * and hit-tested as that shape instead of as a box. The geometry functions
 * themselves live in flow's own source so they can be iterated on without
 * rebuilding this package; this module is only the seam.
 *
 * Types are deliberately structural rather than importing flow's types — the
 * dependency only ever points from flow into the vendor, never back.
 */

export interface FlowShapeGeometry {
  /** Closed outline in local coords. Hit area, and the render when `path` is absent. */
  points: readonly (readonly [number, number])[];
  /** Optional SVG path in local coords; may hold several subpaths. */
  path?: string;
}

type FlowGeometryFn = (
  width: number,
  height: number,
  params: Record<string, number>,
) => FlowShapeGeometry;

const registry = new Map<string, FlowGeometryFn>();

export const registerFlowShape = (kind: string, fn: FlowGeometryFn): void => {
  registry.set(kind, fn);
};

/** Test seam. */
export const clearFlowShapes = (): void => {
  registry.clear();
};

/**
 * Geometry for an element, or `null` when it is not a flow shape or its kind
 * was never registered. An unregistered kind falling back to `null` is what
 * makes a broken registration a plain box rather than a crash.
 */
export const getFlowShapeGeometry = (element: {
  width: number;
  height: number;
  customData?: Record<string, any> | null;
}): FlowShapeGeometry | null => {
  const flowShape = element.customData?.flowShape;
  if (!flowShape || typeof flowShape.kind !== "string") {
    return null;
  }
  const fn = registry.get(flowShape.kind);
  if (!fn) {
    return null;
  }
  const geom = fn(element.width, element.height, flowShape.p ?? {});
  return geom && geom.points.length >= 3 ? geom : null;
};
```

Export it from `vendor/excalidraw/packages/common/src/index.ts` alongside the other re-exports in that file (match the file's existing `export * from "./…"` style).

- [ ] **Step 2: Dispatch in the renderer**

In `vendor/excalidraw/packages/element/src/shape.ts`, import `getFlowShapeGeometry` from `@excalidraw/common` (add it to the existing import block from that package), then insert at the very top of the `case "rectangle": case "iframe": case "embeddable":` body, before `let shape`:

```ts
      // flow: a rectangle carrying customData.flowShape draws flow's own
      // geometry instead of a box. Guarded to rectangle so iframes and
      // embeddables are untouched; an unregistered kind returns null and falls
      // through to the normal box below.
      if (element.type === "rectangle") {
        const flowGeom = getFlowShapeGeometry(element);
        if (flowGeom) {
          return flowGeom.path
            ? generator.path(
                flowGeom.path,
                generateRoughOptions(element, true, isDarkMode),
              )
            : generator.polygon(
                flowGeom.points.map(([px, py]) => [px, py]),
                generateRoughOptions(element, false, isDarkMode),
              );
        }
      }
```

The `true` in `generateRoughOptions(element, true, …)` for the path branch matches how the rounded-rectangle and diamond paths already call it (it enables curve-fitting for path shapes); the polygon branch passes `false`, as the diamond's polygon branch does.

- [ ] **Step 3: Register from flow**

Create `src/ui/shapes/register.ts`:

```ts
import { registerFlowShape } from "@excalidraw/excalidraw";
import { SHAPES_REGISTRY } from "./registry";

/**
 * Push every flow shape's geometry into the vendor registry.
 *
 * Must run before the first render of `<Excalidraw>`: a scene restored from
 * localStorage can contain flow shapes, and an unregistered kind draws as a
 * plain box. `src/main.tsx` imports this module for its side effect, at module
 * scope, which is what guarantees the ordering.
 */
export function registerAllFlowShapes(): void {
  for (const def of Object.values(SHAPES_REGISTRY)) {
    registerFlowShape(def.kind, def.geometry);
  }
}

registerAllFlowShapes();
```

If `registerFlowShape` is not re-exported from the `@excalidraw/excalidraw` entry point, add the re-export line to `vendor/excalidraw/packages/excalidraw/index.tsx` beside the other flow re-exports (the eyedropper's two lines are the precedent) — that is an expected, additive fork edit for this task.

In `src/main.tsx`, add the side-effect import above the app render, with a comment naming the ordering requirement:

```ts
// Registers flow's shape geometry with the vendor renderer. Must be imported
// before <Excalidraw> first renders — a restored scene may contain flow shapes,
// and an unregistered kind draws as a plain box.
import "./ui/shapes/register";
```

- [ ] **Step 4: Rebuild the vendor package**

Run: `npm run build:excalidraw`
Expected: completes without errors. **Nothing below sees your fork edits until this runs.**

- [ ] **Step 5: Write the test**

Create `src/ui/shapes/register.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getFlowShapeGeometry } from "@excalidraw/excalidraw";
import "./register";

describe("flow shape registration", () => {
  it("registers the triangle with the vendor renderer", () => {
    const geom = getFlowShapeGeometry({
      width: 100,
      height: 50,
      customData: { flowShape: { kind: "triangle", p: {} } },
    });
    expect(geom?.points).toHaveLength(3);
  });

  it("returns null for a plain rectangle", () => {
    expect(getFlowShapeGeometry({ width: 10, height: 10 })).toBeNull();
  });

  it("returns null for an unregistered kind instead of throwing", () => {
    expect(
      getFlowShapeGeometry({
        width: 10,
        height: 10,
        customData: { flowShape: { kind: "not-a-shape", p: {} } },
      }),
    ).toBeNull();
  });
});
```

`getFlowShapeGeometry` needs re-exporting from the vendor entry point for this import to resolve — same additive re-export as Step 3.

- [ ] **Step 6: Verify a real element renders as a triangle**

Run `npm run dev`, open the app, and in the browser console stamp a drawn rectangle by hand:

```js
const api = window.h.app;                       // vendor's test hook
const el = api.scene.getNonDeletedElements()[0];
api.scene.mutateElement(el, { customData: { flowShape: { kind: "triangle", p: {} } } });
```

Expected: the box redraws as a triangle. Record what you actually saw in your report. If it stays a box, the likely causes in order are: the vendor was not rebuilt (Step 4), the registration import did not run, or `ShapeCache` held a stale entry because the mutation did not mint a new element object.

- [ ] **Step 7: Run the suites and commit**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

```bash
git add vendor/excalidraw src/ui/shapes src/main.tsx
git commit -m "feat(shapes): render a flow shape in place of its rectangle carrier"
```

Note the `vendor/excalidraw` submodule pointer moves with this commit — that is expected; commit the submodule change too.

---

### Task 3: Hit-testing the real outline

Without this, a transparent triangle hit-tests on its invisible bounding-box edges: clicking the visible shape misses, clicking empty space hits.

**Files:**
- Modify: `vendor/excalidraw/packages/utils/src/shape.ts` (`getPolygonShape`, ~line 116)
- Test: `e2e/shapes.spec.ts` (new)

**Interfaces:**
- Consumes: `getFlowShapeGeometry` from Task 2.
- Produces: nothing new.

- [ ] **Step 1: Add the branch**

`getPolygonShape` already special-cases `element.type === "diamond"`, so this follows the established shape of that function. Import `getFlowShapeGeometry` from `@excalidraw/common` and add the flow branch before the existing diamond check:

```ts
  let data: Polygon<Point>;

  // flow: a rectangle carrying customData.flowShape hit-tests on its real
  // outline. Without this a transparent triangle would be selectable only along
  // its bounding box's edges — i.e. exactly where it isn't drawn.
  const flowGeom =
    element.type === "rectangle" ? getFlowShapeGeometry(element) : null;

  if (flowGeom) {
    data = polygon(
      ...flowGeom.points.map(([px, py]) =>
        pointRotateRads(pointFrom<Point>(x + px, y + py), center, angle),
      ),
    );
  } else if (element.type === "diamond") {
```

Keep the rest of the function unchanged.

- [ ] **Step 2: Rebuild the vendor package**

Run: `npm run build:excalidraw`
Expected: completes without errors.

- [ ] **Step 3: Write the failing e2e test**

Create `e2e/shapes.spec.ts`. There is no shapebar tool yet (Task 5), so this test stamps the shape through the vendor test hook — which is also what makes it a pure hit-test test rather than a tool test:

```ts
import { test, expect } from "@playwright/test";
import { pickTool } from "./helpers/rails";

/** Draw a rectangle from (400,200) to (700,400) and turn it into a flow shape. */
async function drawFlowShape(page: import("@playwright/test").Page, kind: string) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 8 });
  await page.mouse.up();
  await page.evaluate((k) => {
    const app = (window as any).h.app;
    const el = app.scene.getNonDeletedElements().at(-1);
    app.scene.mutateElement(el, { customData: { flowShape: { kind: k, p: {} } } });
  }, kind);
  await pickTool(page, "Selection");
}

/** How many elements are currently selected. */
function selectedCount(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => Object.keys((window as any).h.state.selectedElementIds ?? {}).length,
  );
}

test.describe("flow shape hit-testing", () => {
  test("selects on the real outline, not the bounding box", async ({ page }) => {
    await page.goto("/");
    await drawFlowShape(page, "triangle");

    // The triangle's apex is at x=550; its top-left corner region (420,215) is
    // inside the bounding box but well outside the drawn shape.
    await page.mouse.click(420, 215);
    expect(await selectedCount(page)).toBe(0);

    // Dead centre of the lower half is inside the triangle.
    await page.mouse.click(550, 370);
    expect(await selectedCount(page)).toBe(1);
  });
});
```

- [ ] **Step 4: Run it**

Run: `pkill -f "[v]ite" || true; npx playwright test e2e/shapes.spec.ts`
Expected: PASS. If the first assertion fails (the corner click selects), the vendor was not rebuilt or the branch is not being reached.

- [ ] **Step 5: Commit**

```bash
git add vendor/excalidraw e2e/shapes.spec.ts
git commit -m "feat(shapes): hit-test flow shapes on their real outline"
```

---

### Task 4: The appState field and the creation stamp

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/types.ts`, `vendor/excalidraw/packages/excalidraw/appState.ts`, `vendor/excalidraw/packages/excalidraw/components/App.tsx` (`createGenericElementOnPointerDown`, ~10375)
- Modify: `src/lib/flow-app-state.ts`
- Test: `src/lib/flow-app-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `appState.currentItemFlowShape: { kind: string; p: Record<string, number> } | null`.

- [ ] **Step 1: Declare the field**

In `vendor/excalidraw/packages/excalidraw/types.ts`, beside the existing flow field `bindingMode` (~line 359):

```ts
  // flow: the shape a newly drawn rectangle is stamped with (shapebar tools arm
  // it; every other tool clears it). null = draw a plain rectangle.
  currentItemFlowShape?: { kind: string; p: Record<string, number> } | null;
```

In `vendor/excalidraw/packages/excalidraw/appState.ts`, add the default beside `bindingMode` (~line 90):

```ts
    currentItemFlowShape: null, // flow: no shape armed by default
```

and the persistence entry beside `bindingMode`'s (~line 230):

```ts
  // flow: transient tool arming, never persisted or exported.
  currentItemFlowShape: { browser: false, export: false, server: false },
```

- [ ] **Step 2: Stamp it at creation**

In `createGenericElementOnPointerDown`, add to `baseElementAttributes`, directly after the existing `padding:` line:

```ts
      // flow: a shapebar tool arms `currentItemFlowShape`; stamp it so the
      // renderer and hit-tester draw that shape. Guarded to rectangle because
      // this same method also creates the selection element and embeddables.
      customData:
        elementType === "rectangle" && this.state.currentItemFlowShape
          ? { flowShape: this.state.currentItemFlowShape }
          : undefined,
```

- [ ] **Step 3: Add it to flow's global-appState plumbing**

In `src/lib/flow-app-state.ts`, add `"currentItemFlowShape"` to `FLOW_GLOBAL_APP_STATE_KEYS`, and seed it in `flowSeedAppState`:

```ts
    // flow: no shape tool armed at startup. Seeded (not merely defaulted) for
    // the same reason as the fields above — File ▸ New replaces the whole
    // appState, and an unseeded field there means a stale shape could survive
    // into a brand new document.
    currentItemFlowShape: null,
```

Both edits are mandatory. The memory records what skipping the seed did last time: File ▸ New wiped it, and the resulting mismatch made the onChange normalizer clone elements mid-drag, so boxes drew 0×0.

- [ ] **Step 4: Write the tests**

Add to `src/lib/flow-app-state.test.ts`, matching the file's existing style:

```ts
  it("seeds no armed shape", () => {
    expect(flowSeedAppState({ ...PREFS })).toMatchObject({ currentItemFlowShape: null });
  });

  it("treats the armed shape as a flow global, so an opened document cannot arm one", () => {
    expect(FLOW_GLOBAL_APP_STATE_KEYS).toContain("currentItemFlowShape");
    const stripped = withoutFlowGlobals({
      currentItemFlowShape: { kind: "triangle", p: {} },
      viewBackgroundColor: "#fff",
    });
    expect("currentItemFlowShape" in stripped).toBe(false);
    expect(stripped.viewBackgroundColor).toBe("#fff");
  });
```

- [ ] **Step 5: Check style memory does not capture the field**

`src/ui/panels/useStyleMemory*` buckets `currentItem*` keys per tool category. If it captures `currentItemFlowShape`, switching tools would restore a stale armed shape and stamp the wrong geometry.

Run: `grep -rn "currentItem" src/ui/panels/useStyleMemory*.ts src/lib/style-memory*.ts 2>/dev/null`
Read the key list it prints. If the list is explicit and does not include `currentItemFlowShape`, no change is needed — record that in your report. If it captures `currentItem*` by prefix, exclude `currentItemFlowShape` explicitly and add a test that switching tool categories leaves it untouched.

- [ ] **Step 6: Rebuild, test, commit**

Run: `npm run build:excalidraw && npx vitest run && npm run typecheck`
Expected: PASS.

```bash
git add vendor/excalidraw src/lib/flow-app-state.ts src/lib/flow-app-state.test.ts
git commit -m "feat(shapes): currentItemFlowShape arms the shape a new rectangle is stamped with"
```

---

### Task 5: The triangle reaches the shapebar

The vertical slice closes here: pick a tool, drag, get a triangle.

**Files:**
- Modify: `src/ui/toolbar/tools.ts`, `src/ui/toolbar/useActiveTool.ts`, `src/ui/toolbar/ToolRail.tsx`, `src/ui/toolbar/icons.tsx`
- Test: `src/ui/toolbar/tools.test.ts`, `src/ui/toolbar/useActiveTool.test.tsx`, `src/ui/toolbar/ToolRail.test.tsx`, `e2e/shapes.spec.ts`

**Interfaces:**
- Consumes: `FlowShapeKind`, `defaultsFor` from Task 1; `currentItemFlowShape` from Task 4.
- Produces: `ToolDef.flowShape?: FlowShapeKind`; `useActiveTool` returns `flowShapeKind: string | null`; `setTool(type, arrowType?, flowShape?)`.

- [ ] **Step 1: Extend the tool definition**

In `src/ui/toolbar/tools.ts`: add `"triangle"` to the `ToolId` union, add the field to `ToolDef`, and append the entry to `SHAPES`:

```ts
  /** For flow's parametric shapes: the geometry this tool arms. All of them
   *  activate the shared `"rectangle"` tool and differ only by this kind. */
  flowShape?: FlowShapeKind;
```

```ts
  { id: "triangle", label: "Triangle", shortcut: "", toolType: "rectangle", flowShape: "triangle" },
```

Import `FlowShapeKind` as a type-only import from `../shapes/types`.

- [ ] **Step 2: Always write the armed shape**

In `src/ui/toolbar/useActiveTool.ts`, extend the return type with `flowShapeKind`, read it from appState, and rewrite `setTool`:

```ts
  const flowShapeKind =
    (state?.currentItemFlowShape as { kind?: string } | null)?.kind ?? null;

  const setTool = (type: ToolId, nextArrowType?: ArrowType, flowShape?: FlowShapeKind) => {
    // `currentItemFlowShape` is written on EVERY tool switch, never omitted.
    // Omitting it when the new tool is not a flow shape would leave the last
    // shape armed, and the next plain rectangle would silently be stamped as,
    // say, a triangle.
    const patch: Record<string, unknown> = {
      currentItemFlowShape: flowShape
        ? { kind: flowShape, p: defaultsFor(flowShape) }
        : null,
    };
    if (nextArrowType) {
      patch.currentItemArrowType = nextArrowType;
    }
    api?.updateScene({ appState: patch as UpdateAppState });
    api?.setActiveTool({ type } as SetToolArg);
  };
```

- [ ] **Step 3: Fix the highlight rule**

In `src/ui/toolbar/ToolRail.tsx`, all ten shapes share `toolType: "rectangle"`, so without this every shape button and the plain rectangle would light up together. Extend the existing composite rule:

```ts
            const active =
              activeType === toolType &&
              (t.arrowType === undefined || arrowType === t.arrowType) &&
              (t.flowShape ?? null) === flowShapeKind;
```

The `?? null` matters: the plain Rectangle tool has no `flowShape`, so it highlights only when nothing is armed.

- [ ] **Step 4: Add the icon**

Add a `triangle` entry to `TOOL_ICONS` in `src/ui/toolbar/icons.tsx`, matching the existing entries' size, stroke width and `currentColor` usage. A 20×20 viewBox with a stroked path `M10 3 L17 17 L3 17 Z` matches the weight of the rectangle/diamond glyphs.

- [ ] **Step 5: Write the tests**

In `src/ui/toolbar/tools.test.ts`, the existing "shape tools have non-empty shortcuts" assertion now fails — the tripwire firing exactly as the previous project predicted. Widen it deliberately:

```ts
  it("gives shape tools a shortcut unless they are arrow variants or flow shapes", () => {
    for (const t of SHAPES) {
      if (t.arrowType && t.id !== "arrow") continue; // curved/elbow cycle via A
      if (t.flowShape) continue; // flow's parametric shapes carry no shortcut
      expect(t.shortcut.length, `${t.id} should have a shortcut`).toBeGreaterThan(0);
    }
  });

  it("gives every flow-shape tool the rectangle carrier and a registry entry", () => {
    for (const t of SHAPES.filter((s) => s.flowShape)) {
      expect(t.toolType).toBe("rectangle");
      expect(t.shortcut).toBe("");
      expect(SHAPES_REGISTRY[t.flowShape!]).toBeTruthy();
    }
  });
```

In `src/ui/toolbar/useActiveTool.test.tsx`:

```ts
  it("arms the shape with its default params and activates the rectangle tool", async () => {
    const api = fakeApi();
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("rectangle", undefined, "triangle"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: { kind: "triangle", p: {} } },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle" });
  });

  it("clears the armed shape when a non-shape tool is picked", () => {
    const api = fakeApi();
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("line"));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemFlowShape: null },
    });
  });
```

Match the existing file's fake-api and render helpers rather than inventing new ones.

In `src/ui/toolbar/ToolRail.test.tsx`, add a highlight test: with `currentItemFlowShape` of kind `triangle` and the rectangle tool active, the Triangle button is `aria-pressed="true"` and the Rectangle button is `"false"`; with nothing armed, the reverse.

- [ ] **Step 6: Add the e2e**

Append to `e2e/shapes.spec.ts`:

```ts
  test("the shapebar's Triangle tool draws a stamped rectangle", async ({ page }) => {
    await page.goto("/");
    await pickTool(page, "Triangle");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();

    const stamped = await page.evaluate(() => {
      const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
      return { type: el.type, kind: el.customData?.flowShape?.kind };
    });
    expect(stamped).toEqual({ type: "rectangle", kind: "triangle" });
  });

  test("switching to another tool disarms the shape", async ({ page }) => {
    await page.goto("/");
    await pickTool(page, "Triangle");
    await pickTool(page, "Rectangle");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();

    const kind = await page.evaluate(
      () => (window as any).h.app.scene.getNonDeletedElements().at(-1).customData?.flowShape?.kind,
    );
    expect(kind).toBeUndefined();
  });
```

- [ ] **Step 7: Run everything and commit**

Run: `npx vitest run && npm run typecheck && pkill -f "[v]ite" || true; npx playwright test --workers=1`
Expected: unit and typecheck green; Playwright green but for the 2 known `e2e/text-panel.spec.ts` failures.

```bash
git add src/ui/toolbar e2e/shapes.spec.ts
git commit -m "feat(shapes): the Triangle tool in the shapebar"
```

---

### Task 6: Three more polygons — parallelogram, trapezoid, star

Pure geometry plus registry entries, icons and tools. The pattern from Tasks 1 and 5 repeats exactly; no new architecture.

**Files:**
- Create: `src/ui/shapes/geometry/{parallelogram,trapezoid,star}.ts` and their `.test.ts` siblings
- Modify: `src/ui/shapes/registry.ts`, `src/ui/toolbar/tools.ts`, `src/ui/toolbar/icons.tsx`

**Interfaces:**
- Consumes: `GeometryFn`, `expectInsideBox`, `expectClosed`.
- Produces: `parallelogram`, `trapezoid`, `star` geometry functions.

- [ ] **Step 1: Write the three geometries**

`parallelogram.ts` — `skew` is the top edge's horizontal offset as a fraction of width:

```ts
import type { GeometryFn } from "../types";

/** Top edge shifted right by `skew * w`; bottom edge shifted left by the same,
 *  so the shape always fills the box exactly. */
export const parallelogram: GeometryFn = (w, h, p) => {
  const s = Math.min(Math.max(p.skew ?? 0.25, 0), 1) * w;
  return {
    points: [
      [s, 0],
      [w, 0],
      [w - s, h],
      [0, h],
    ],
  };
};
```

`trapezoid.ts` — `inset` is how far each top corner moves inward:

```ts
import type { GeometryFn } from "../types";

/** Symmetric trapezoid: both top corners inset by `inset * w`, capped at half
 *  the width so the top edge never inverts. */
export const trapezoid: GeometryFn = (w, h, p) => {
  const i = Math.min(Math.max(p.inset ?? 0.2, 0), 0.5) * w;
  return {
    points: [
      [i, 0],
      [w - i, 0],
      [w, h],
      [0, h],
    ],
  };
};
```

`star.ts` — five points; `ir` is the inner radius as a fraction of the outer, `rot` a full turn:

```ts
import type { GeometryFn, LocalPt } from "../types";

const POINTS = 5;

/** Five-pointed star inscribed in the box. Radii are half the box in each axis,
 *  so a non-square box yields a stretched star that still fills it exactly. */
export const star: GeometryFn = (w, h, p) => {
  const ir = Math.min(Math.max(p.ir ?? 0.38, 0.05), 0.95);
  const rot = (p.rot ?? 0) * Math.PI * 2;
  const cx = w / 2;
  const cy = h / 2;
  const pts: LocalPt[] = [];
  for (let i = 0; i < POINTS * 2; i++) {
    // Start at -90° so a point faces up at rot = 0.
    const angle = -Math.PI / 2 + rot + (i * Math.PI) / POINTS;
    const r = i % 2 === 0 ? 1 : ir;
    pts.push([cx + Math.cos(angle) * cx * r, cy + Math.sin(angle) * cy * r]);
  }
  return { points: pts };
};
```

- [ ] **Step 2: Write their tests**

One file each, following `triangle.test.ts`'s shape. Every file asserts `expectInsideBox` and `expectClosed` across at least a wide box, a tall box and a zero box, plus its own specific claims:

- parallelogram: `skew: 0` yields the four box corners; increasing `skew` moves the first point right monotonically; `skew: 1` stays inside the box.
- trapezoid: `inset: 0` yields a rectangle; `inset: 0.5` collapses the top edge to a single x (a triangle) and does **not** invert; `inset: 0.9` is clamped to the same as `0.5`.
- star: exactly 10 points; alternating radii, so even-indexed points are farther from the centre than odd; `rot: 0` puts a point at the top edge's centre; `rot: 1` returns (within float tolerance) to the same outline as `rot: 0`.

- [ ] **Step 3: Register, add tools and icons**

Add the three registry entries with `defaults` — parallelogram `{ skew: 0.25 }`, trapezoid `{ inset: 0.2 }`, star `{ ir: 0.38, rot: 0 }` — leaving `handles: []` for now (Tasks 9-11 fill them in). Add the three `ToolId` members, `SHAPES` entries (`toolType: "rectangle"`, `shortcut: ""`, `flowShape` matching the kind) and `TOOL_ICONS` glyphs.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/shapes src/ui/toolbar && npm run typecheck`
Expected: PASS.

```bash
git add src/ui/shapes src/ui/toolbar
git commit -m "feat(shapes): parallelogram, trapezoid and star"
```

---

### Task 7: Three curved shapes — cylinder, cloud, tape

The first shapes to use `path`. Each returns both a `path` (drawn) and a polygonal `points` approximation (hit area).

**Files:**
- Create: `src/ui/shapes/geometry/{cylinder,cloud,tape}.ts` and their `.test.ts` siblings
- Modify: `src/ui/shapes/registry.ts`, `src/ui/toolbar/tools.ts`, `src/ui/toolbar/icons.tsx`
- Test: also extend `src/ui/shapes/geometry/invariants.ts` usage — `expectPathSubpathsClosed` gets its first real callers here

**Interfaces:**
- Consumes: `GeometryFn`, the invariant helpers.
- Produces: `cylinder`, `cloud`, `tape`.

- [ ] **Step 1: Cylinder**

`cap` is the cap ellipse's half-height as a fraction of the box height. The outline is the silhouette; the visible front arc of the top cap is a second subpath so it draws without joining the hit area:

```ts
import type { GeometryFn, LocalPt } from "../types";

const SEGMENTS = 16;

/** Half-ellipse sampled left-to-right, `dir` 1 = bulging down, -1 = bulging up. */
function arc(cx: number, rx: number, cy: number, ry: number, dir: 1 | -1): LocalPt[] {
  const pts: LocalPt[] = [];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = Math.PI * (i / SEGMENTS);
    pts.push([cx - Math.cos(t) * rx, cy + Math.sin(t) * ry * dir]);
  }
  return pts;
}

export const cylinder: GeometryFn = (w, h, p) => {
  const capH = Math.min(Math.max(p.cap ?? 0.18, 0.02), 0.45) * h;
  const rx = w / 2;
  const top = capH;
  const bottom = h - capH;

  // Silhouette: top cap's upper arc, down the right side, bottom cap's lower arc.
  const points: LocalPt[] = [
    ...arc(rx, rx, top, capH, -1),
    ...arc(rx, rx, bottom, capH, 1).reverse(),
  ];

  const d = (pts: LocalPt[]) =>
    pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");

  return {
    points,
    // Outline, then the front arc of the top cap as a separate closed subpath.
    path: `${d(points)} Z ${d(arc(rx, rx, top, capH, 1))} Z`,
  };
};
```

- [ ] **Step 2: Cloud**

No parameters. A ring of overlapping bumps around the box's inset ellipse:

```ts
import type { GeometryFn, LocalPt } from "../types";

const BUMPS = 9;

/** Scalloped closed loop: `BUMPS` arcs around an inset ellipse. The inset keeps
 *  every bump's crest inside the box. */
export const cloud: GeometryFn = (w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const bumpR = Math.min(rx, ry) * 0.32;
  const cx = rx;
  const cy = ry;
  const points: LocalPt[] = [];
  const SAMPLES = 6;

  for (let b = 0; b < BUMPS; b++) {
    const base = (b / BUMPS) * Math.PI * 2 - Math.PI / 2;
    const bx = cx + Math.cos(base) * (rx - bumpR);
    const by = cy + Math.sin(base) * (ry - bumpR);
    for (let s = 0; s <= SAMPLES; s++) {
      const a = base - Math.PI / 2 + (s / SAMPLES) * Math.PI;
      points.push([bx + Math.cos(a) * bumpR, by + Math.sin(a) * bumpR]);
    }
  }

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
```

- [ ] **Step 3: Tape**

`amp` is the wave amplitude as a fraction of height, `wave` the wavelength as a fraction of width. Top and bottom edges wave in parallel so the band keeps a constant thickness:

```ts
import type { GeometryFn, LocalPt } from "../types";

const SAMPLES = 24;

export const tape: GeometryFn = (w, h, p) => {
  const amp = Math.min(Math.max(p.amp ?? 0.12, 0), 0.4) * h;
  const cycles = 1 / Math.min(Math.max(p.wave ?? 0.5, 0.15), 1);

  const edge = (baseY: number): LocalPt[] =>
    Array.from({ length: SAMPLES + 1 }, (_, i) => {
      const t = i / SAMPLES;
      return [t * w, baseY + Math.sin(t * Math.PI * 2 * cycles) * amp] as LocalPt;
    });

  // Insets keep both waving edges inside the box at maximum amplitude.
  const points = [...edge(amp), ...edge(h - amp).reverse()];

  return {
    points,
    path: `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`,
  };
};
```

- [ ] **Step 4: Write their tests**

Each file asserts `expectInsideBox`, `expectClosed` and `expectPathSubpathsClosed` across a wide box, a tall box and a zero box, plus:

- cylinder: the path has exactly two subpaths; a larger `cap` lowers the silhouette's top-cap crest monotonically; `cap` clamps at 0.45 so the two caps never cross.
- cloud: point count is `BUMPS * (SAMPLES + 1)`; every point lies inside the box for a wide, tall and square box; the outline is not self-identical at its ends.
- tape: `amp: 0` yields two straight parallel edges; band thickness (the vertical gap between matching top and bottom samples) is constant within float tolerance for any `amp`; larger `wave` yields fewer sign changes along the top edge.

- [ ] **Step 5: Register, add tools and icons; run and commit**

Defaults: cylinder `{ cap: 0.18 }`, cloud `{}`, tape `{ amp: 0.12, wave: 0.5 }`. Add `ToolId` members, `SHAPES` entries and icons as in Task 6.

Run: `npx vitest run src/ui/shapes src/ui/toolbar && npm run typecheck`
Expected: PASS.

```bash
git add src/ui/shapes src/ui/toolbar
git commit -m "feat(shapes): cylinder, cloud and tape"
```

---

### Task 8: The last three — cube, fat arrow, summing junction — and registry exhaustiveness

**Files:**
- Create: `src/ui/shapes/geometry/{cube,fatArrow,sumJunction}.ts` and their `.test.ts` siblings
- Modify: `src/ui/shapes/registry.ts` (remove the temporary cast), `src/ui/toolbar/tools.ts`, `src/ui/toolbar/icons.tsx`
- Test: `e2e/shapes.spec.ts`

**Interfaces:**
- Consumes: `GeometryFn`, the invariant helpers.
- Produces: `cube`, `fatArrow`, `sumJunction`; a fully populated `SHAPES_REGISTRY` typed without a cast.

- [ ] **Step 1: Cube**

`dx`/`dy` are the extrusion vector as fractions of the box. The front face shrinks to make room, so the whole drawing stays inscribed:

```ts
import type { GeometryFn, LocalPt } from "../types";

/** Inscribed 3D box: a front face plus a top and right face drawn toward the
 *  extrusion tip. The tip is the box's top-right corner at dx=dy=1, so nothing
 *  ever leaves the box. */
export const cube: GeometryFn = (w, h, p) => {
  const dx = Math.min(Math.max(p.dx ?? 0.25, 0.02), 0.6) * w;
  const dy = Math.min(Math.max(p.dy ?? 0.2, 0.02), 0.6) * h;
  const fw = w - dx; // front face width
  const fh = h - dy; // front face height
  const top = dy;

  const front: LocalPt[] = [
    [0, top],
    [fw, top],
    [fw, h],
    [0, h],
  ];

  // Silhouette for hit-testing: front face plus the two visible side faces.
  const points: LocalPt[] = [
    [0, top],
    [dx, 0],
    [w, 0],
    [w, fh],
    [fw, h],
    [0, h],
  ];

  const d = (pts: LocalPt[]) =>
    `${pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;

  return {
    points,
    // Silhouette, then the front face's two interior edges as their own subpath.
    path: `${d(points)} ${d(front)}`,
  };
};
```

- [ ] **Step 2: Fat arrow**

`head` is the head's length as a fraction of width; `stem` the stem's thickness as a fraction of height. Points right:

```ts
import type { GeometryFn } from "../types";

export const fatArrow: GeometryFn = (w, h, p) => {
  const head = Math.min(Math.max(p.head ?? 0.4, 0.05), 0.95) * w;
  const stem = Math.min(Math.max(p.stem ?? 0.4, 0.05), 1) * h;
  const x = w - head;
  const top = (h - stem) / 2;
  const bottom = top + stem;
  return {
    points: [
      [0, top],
      [x, top],
      [x, 0],
      [w, h / 2],
      [x, h],
      [x, bottom],
      [0, bottom],
    ],
  };
};
```

- [ ] **Step 3: Summing junction**

No parameters: a circle with a full cross. The circle is the hit area; the cross is interior detail:

```ts
import type { GeometryFn, LocalPt } from "../types";

const SEGMENTS = 32;

export const sumJunction: GeometryFn = (w, h) => {
  const rx = w / 2;
  const ry = h / 2;
  const points: LocalPt[] = Array.from({ length: SEGMENTS }, (_, i) => {
    const a = (i / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
    return [rx + Math.cos(a) * rx, ry + Math.sin(a) * ry] as LocalPt;
  });

  const ring = `${points.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ")} Z`;
  // Cross drawn as two degenerate closed subpaths so the renderer strokes them
  // without them contributing to the fill.
  const cross = `M ${rx} 0 L ${rx} ${h} Z M 0 ${ry} L ${w} ${ry} Z`;

  return { points, path: `${ring} ${cross}` };
};
```

- [ ] **Step 4: Write their tests**

Standard invariants across wide/tall/zero boxes, plus:

- cube: the silhouette has 6 points; a larger `dx` shrinks the front face's width monotonically; at `dx: 0.6, dy: 0.6` every point is still inside the box; the path has two subpaths.
- fatArrow: 7 points; the tip is exactly `[w, h/2]`; `stem: 1` makes the stem span the full height without inverting `top`/`bottom`; a larger `head` moves the shoulder left monotonically.
- sumJunction: `SEGMENTS` points, all within float tolerance of the inscribed ellipse; the path has three subpaths; the cross's endpoints touch the box edges exactly.

- [ ] **Step 5: Complete the registry and let TypeScript enforce it**

Add the last three entries — cube `{ dx: 0.25, dy: 0.2 }`, fatArrow `{ head: 0.4, stem: 0.4 }`, sumJunction `{}` — then **delete the `as Record<FlowShapeKind, ShapeDef>` cast** added in Task 1. With the cast gone, a missing kind becomes a compile error, which is the check that keeps the registry and the `FlowShapeKind` union in step forever after.

Add a test that the registry is exhaustive at runtime too:

```ts
  it("has an entry for every kind, and every kind is a real entry", () => {
    const kinds: FlowShapeKind[] = [
      "triangle", "star", "cylinder", "cube", "parallelogram",
      "fatArrow", "cloud", "trapezoid", "tape", "sumJunction",
    ];
    expect(Object.keys(SHAPES_REGISTRY).sort()).toEqual([...kinds].sort());
  });
```

- [ ] **Step 6: e2e — draw all ten**

Append to `e2e/shapes.spec.ts` a data-driven test that picks each of the ten shapebar tools by label, drags a box, and asserts the resulting element is a `rectangle` whose `customData.flowShape.kind` matches. This is the test that catches a tool wired to the wrong kind.

- [ ] **Step 7: Run everything and commit**

Run: `npx vitest run && npm run typecheck && pkill -f "[v]ite" || true; npx playwright test --workers=1`
Expected: unit and typecheck green; Playwright green but for the 2 known failures.

```bash
git add src/ui/shapes src/ui/toolbar e2e/shapes.spec.ts
git commit -m "feat(shapes): cube, fat arrow and summing junction complete the set"
```

---

### Task 9: The handle overlay, read-only

Dots appear in the right places and track the canvas. Dragging comes next.

**Files:**
- Create: `src/ui/shapes/ShapeHandles.tsx`, `src/ui/shapes/shape-handles.css`, `src/ui/shapes/useShapeSelection.ts`
- Modify: `src/ui/shapes/registry.ts` (parallelogram's handle), `src/App.tsx` (mount it)
- Test: `src/ui/shapes/ShapeHandles.test.tsx`, `src/ui/shapes/useShapeSelection.test.tsx`

**Interfaces:**
- Consumes: `SHAPES_REGISTRY`, `HandleDef`, the public `sceneCoordsToViewportCoords`.
- Produces: `ShapeHandles({ api })`; `useShapeSelection(api)` returning `{ element, def } | null`.

- [ ] **Step 1: The selection bridge**

Create `src/ui/shapes/useShapeSelection.ts`. It subscribes to `onChange` and returns the single selected flow-shape element, or null. It must live in a sibling of `<Excalidraw>` — never in App — for the same non-terminating-`onChange` reason documented on `ToolRails` and `useActiveTool`.

Return null when: nothing is selected, more than one element is selected, the element is locked, the element carries no `flowShape`, its kind is unknown, or its `handles` array is empty.

- [ ] **Step 2: Parallelogram's handle**

Add to its registry entry — the dot is the top-left corner, which is exactly what `skew` positions:

```ts
    handles: [
      {
        id: "skew",
        at: (w, _h, p) => [Math.min(Math.max(p.skew ?? 0.25, 0), 1) * w, 0],
        from: (x, _y, w) => ({ skew: w === 0 ? 0 : Math.min(Math.max(x / w, 0), 1) }),
      },
    ],
```

- [ ] **Step 3: The component**

Create `src/ui/shapes/ShapeHandles.tsx`. It renders one absolutely-positioned dot per `HandleDef`:

- Local handle position from `def.handles[i].at(width, height, p)`.
- Rotate that point about the element's centre by `element.angle`, add `element.x/y`, then convert with the public `sceneCoordsToViewportCoords({ sceneX, sceneY }, appState)`.
- Position each dot with `transform: translate(...)` and `will-change: transform`, so panning and zooming move compositor-friendly properties rather than triggering layout.
- The container is `position: fixed; inset: 0; pointer-events: none` with the dots themselves `pointer-events: auto`, so the overlay never steals canvas events.
- z-index must sit above the canvas but below the rails and menus. The rails are 90 (101 for quickbar/bottombar) and an open rail menu is 91; use **80** and note why in a comment.
- Each dot is a `<button type="button">` with an `aria-label` naming the shape and handle, so it is reachable and testable by role.

Mount it in `src/App.tsx` as a sibling of `<Excalidraw>` — next to `<ToolRails>`, not inside the canvas inset div.

- [ ] **Step 4: Write the tests**

`useShapeSelection.test.tsx`: returns null for each of the six rejection cases above, and the element for a single unlocked flow shape.

`ShapeHandles.test.tsx`: renders one dot for parallelogram and none for triangle; the dot's computed position matches the expected viewport point for a known scroll/zoom; a rotated element's dot is rotated too (assert it differs from the unrotated position and matches the hand-computed rotation).

- [ ] **Step 5: Run and commit**

Run: `npx vitest run src/ui/shapes && npm run typecheck`
Expected: PASS.

```bash
git add src/ui/shapes src/App.tsx
git commit -m "feat(shapes): the orange handle overlay, read-only"
```

---

### Task 10: Dragging a handle

**Files:**
- Modify: `src/ui/shapes/ShapeHandles.tsx`
- Create: `src/ui/shapes/useHandleDrag.ts`
- Modify: `src/ui/shapes/registry.ts` (trapezoid's handle)
- Test: `src/ui/shapes/useHandleDrag.test.tsx`, `e2e/shapes.spec.ts`

**Interfaces:**
- Consumes: `viewportCoordsToSceneCoords`, `HandleDef.from`.
- Produces: `useHandleDrag({ api, element, handle })`.

- [ ] **Step 1: The drag hook**

Create `src/ui/shapes/useHandleDrag.ts`, reusing the panel dock's `useDrag` if its contract fits, otherwise mirroring it. On each move:

1. Convert the pointer's viewport position to scene coords with `viewportCoordsToSceneCoords`.
2. Subtract the element's origin and **un-rotate** by `-element.angle` about its centre, giving local coords.
3. Call `handle.from(localX, localY, width, height, p)` for the new parameters, clamped to `0..1`.
4. Write with `api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER })` while dragging.

On pointer-up, write once more with `CaptureUpdateAction.IMMEDIATELY` so the whole drag is a single undo entry — the same transient/commit split the scrub-numeric-inputs work established. Write the element through `newElementWith` (or an equivalent that mints a new object), never by mutating in place: this repo's rule is that flow-added properties written in place are missed by history, and a new object identity is also what invalidates `ShapeCache`.

- [ ] **Step 2: Trapezoid's handle**

```ts
    handles: [
      {
        id: "inset",
        at: (w, _h, p) => [Math.min(Math.max(p.inset ?? 0.2, 0), 0.5) * w, 0],
        from: (x, _y, w) => ({ inset: w === 0 ? 0 : Math.min(Math.max(x / w, 0), 0.5) }),
      },
    ],
```

- [ ] **Step 3: Write the tests**

`useHandleDrag.test.tsx`: a drag from the handle's current position to a known viewport point produces the expected parameter; parameters clamp at both ends; a drag on a rotated element maps correctly (drag along the rotated axis, assert the parameter moves as if unrotated); the drag emits transient updates during the move and exactly one committing update on pointer-up.

Add to `e2e/shapes.spec.ts`: draw a parallelogram, drag its dot, assert `customData.flowShape.p.skew` changed and the geometry regenerated; press Ctrl+Z once and assert the parameter returns to its default — proving the whole drag is one history entry.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run src/ui/shapes && npm run typecheck && pkill -f "[v]ite" || true; npx playwright test e2e/shapes.spec.ts`
Expected: PASS.

```bash
git add src/ui/shapes e2e/shapes.spec.ts
git commit -m "feat(shapes): drag an orange dot to reshape"
```

---

### Task 11: The remaining handles

Five shapes, six dots. No new machinery — each is a `HandleDef` pair plus tests.

**Files:**
- Modify: `src/ui/shapes/registry.ts`
- Test: `src/ui/shapes/handles.test.ts` (new)

**Interfaces:**
- Consumes: `HandleDef`.
- Produces: handles for star, cylinder, cube, tape and fatArrow.

- [ ] **Step 1: Write the five handle sets**

Every `at` must return a point that lies **on the outline the geometry actually draws**, and every `from` must invert its own `at`. Each is written against the exact formula its geometry function uses, so the two cannot drift.

**star** — the first inner vertex (geometry's `i = 1`), which carries both parameters at once:

```ts
    handles: [
      {
        id: "inner",
        at: (w, h, p) => {
          const ir = Math.min(Math.max(p.ir ?? 0.38, 0.05), 0.95);
          const a = -Math.PI / 2 + (p.rot ?? 0) * Math.PI * 2 + Math.PI / 5;
          return [w / 2 + Math.cos(a) * (w / 2) * ir, h / 2 + Math.sin(a) * (h / 2) * ir];
        },
        from: (x, y, w, h) => {
          // Normalize into a unit circle so a non-square box still maps cleanly.
          const ux = w === 0 ? 0 : (x - w / 2) / (w / 2);
          const uy = h === 0 ? 0 : (y - h / 2) / (h / 2);
          const turn = (v: number) => ((v % 1) + 1) % 1; // keep rot in 0..1
          return {
            ir: Math.min(Math.max(Math.hypot(ux, uy), 0.05), 0.95),
            rot: turn(
              (Math.atan2(uy, ux) + Math.PI / 2 - Math.PI / 5) / (Math.PI * 2),
            ),
          };
        },
      },
    ],
```

**cylinder** — the top of the cap ellipse; vertical only, so `from` ignores `x`:

```ts
    handles: [
      {
        id: "cap",
        at: (w, h, p) => [w / 2, Math.min(Math.max(p.cap ?? 0.18, 0.02), 0.45) * h],
        from: (_x, y, _w, h) => ({
          cap: h === 0 ? 0.02 : Math.min(Math.max(y / h, 0.02), 0.45),
        }),
      },
    ],
```

**cube** — the front face's top-right corner, where the front meets both side faces. Task 8 draws the front face from `[0, dy·h]` to `[w − dx·w, …]`, so that corner is `[w(1 − dx), h·dy]` and one drag carries both depth and direction:

```ts
    handles: [
      {
        id: "depth",
        at: (w, h, p) => [
          w * (1 - Math.min(Math.max(p.dx ?? 0.25, 0.02), 0.6)),
          h * Math.min(Math.max(p.dy ?? 0.2, 0.02), 0.6),
        ],
        from: (x, y, w, h) => ({
          dx: w === 0 ? 0.02 : Math.min(Math.max(1 - x / w, 0.02), 0.6),
          dy: h === 0 ? 0.02 : Math.min(Math.max(y / h, 0.02), 0.6),
        }),
      },
    ],
```

**tape** — the first crest of the top edge. Task 7's top edge is `y = amp·h + sin(t·2π·cycles)·amp·h` with `cycles = 1/wave`, whose first peak is at `t = wave/4`, giving `y = 2·amp·h`:

```ts
    handles: [
      {
        id: "wave",
        at: (w, h, p) => [
          (w * Math.min(Math.max(p.wave ?? 0.5, 0.15), 1)) / 4,
          2 * Math.min(Math.max(p.amp ?? 0.12, 0), 0.4) * h,
        ],
        from: (x, y, w, h) => ({
          wave: w === 0 ? 0.15 : Math.min(Math.max((4 * x) / w, 0.15), 1),
          amp: h === 0 ? 0 : Math.min(Math.max(y / (2 * h), 0), 0.4),
        }),
      },
    ],
```

**fatArrow** — two dots, each reading only its own axis: the head's shoulder and the stem's top edge:

```ts
    handles: [
      {
        id: "head",
        at: (w, _h, p) => [w * (1 - Math.min(Math.max(p.head ?? 0.4, 0.05), 0.95)), 0],
        from: (x, _y, w) => ({
          head: w === 0 ? 0.05 : Math.min(Math.max(1 - x / w, 0.05), 0.95),
        }),
      },
      {
        id: "stem",
        at: (_w, h, p) => [0, (h * (1 - Math.min(Math.max(p.stem ?? 0.4, 0.05), 1))) / 2],
        from: (_x, y, _w, h) => ({
          stem: h === 0 ? 0.05 : Math.min(Math.max(1 - (2 * y) / h, 0.05), 1),
        }),
      },
    ],
```

- [ ] **Step 2: Write a shared round-trip test**

Create `src/ui/shapes/handles.test.ts`. One data-driven test proves the property that matters for all of them:

```ts
import { describe, it, expect } from "vitest";
import { SHAPES_REGISTRY } from "./registry";

describe("handle round-tripping", () => {
  const W = 200;
  const H = 120;

  for (const def of Object.values(SHAPES_REGISTRY)) {
    for (const handle of def.handles) {
      it(`${def.kind}/${handle.id}: at() and from() are inverses`, () => {
        const p = { ...def.defaults };
        const [x, y] = handle.at(W, H, p);
        const back = handle.from(x, y, W, H, p);
        for (const [key, value] of Object.entries(back)) {
          expect(value).toBeCloseTo(p[key], 5);
        }
      });

      it(`${def.kind}/${handle.id}: sits inside the box`, () => {
        const [x, y] = handle.at(W, H, { ...def.defaults });
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(H);
      });

      it(`${def.kind}/${handle.id}: clamps a wildly out-of-range drag`, () => {
        const p = { ...def.defaults };
        for (const [key, value] of Object.entries(handle.from(-9999, -9999, W, H, p))) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        for (const [key, value] of Object.entries(handle.from(9999, 9999, W, H, p))) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      });
    }
  }
});
```

This test is the reason `at`/`from` were specified as a pair: it holds every future shape to the same contract automatically.

- [ ] **Step 3: Verify by eye**

Run `npm run dev`. Draw each of the seven shapes with dots, drag every dot to both extremes, and confirm the dot stays on the outline it controls and the shape never leaves its selection box. Record what you actually observed, per shape, in your report. Fix any dot that visibly drifts off its edge — that means `at` and the geometry disagree, even though the round-trip test passes.

- [ ] **Step 4: Run and commit**

Run: `npx vitest run && npm run typecheck`
Expected: PASS.

```bash
git add src/ui/shapes
git commit -m "feat(shapes): handles for star, cylinder, cube, tape and fat arrow"
```

---

### Task 12: End-to-end proof and the memory ledger

**Files:**
- Modify: `e2e/shapes.spec.ts`
- Create: `.claude/memory/parametric-shapes.md`
- Modify: `.claude/memory/MEMORY.md`, `.claude/memory/vertical-toolbar.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: The test that earns the architecture**

Add to `e2e/shapes.spec.ts`: draw a triangle, then draw an arrow starting well outside it and ending inside it, and assert the arrow's `endBinding.elementId` is the triangle's id. This is the payoff for choosing a bindable rectangle carrier over a polygon line, and it is the test that would have failed under the rejected design.

- [ ] **Step 2: Persistence and rendering**

Add three more:

- **Save and reload**: draw a cylinder, drag its `cap` dot, reload the page, and assert the restored element still has `kind: "cylinder"` and the dragged parameter.
- **Resize keeps it a shape**: draw a star, resize it via a corner transform handle, and assert `customData.flowShape` is intact and the element is still a `rectangle` (proving normalized parameters need no resize code).
- **Unregistered kind falls back**: stamp an element with `kind: "not-a-shape"` via the test hook and assert the page still renders and the element is still selectable — the graceful-degradation promise from the spec.

- [ ] **Step 3: Write the memory file**

Create `.claude/memory/parametric-shapes.md` in the terse style of the existing memory files, recording:

- The carrier decision and **why**: rectangle is in `isBindableElement`, `line` is not — a polygon-line shape could never have an arrow bound to it. This is the single most important fact in the file.
- `customData.flowShape = { kind, p }`, parameters normalized 0..1, and the load-bearing rule that geometry never leaves the box (what breaks if it does: bounds, snapping, export, selection chrome).
- The four fork sites, by file, and that `packages/common` was chosen for the registry because `utils/src/shape.ts` imports from `common` — putting it in `element` would invert the dependency.
- **`npm run build:excalidraw` after every vendor change**, or nothing sees it.
- The registration ordering rule in `src/main.tsx`, and that an unregistered kind degrades to a plain box rather than crashing.
- The two appState traps: seed **and** global-key list, and clearing the field on every non-shape tool.
- `at`/`from` are inverses and `handles.test.ts` enforces it for every future shape.
- Any surprise the implementation actually hit — record what bit you, not what you expected to bite you.

Add the one-line pointer to `.claude/memory/MEMORY.md`, and update `.claude/memory/vertical-toolbar.md`'s follow-up bullets, which currently say this work is *pending* and describe the `ToolDef`/`setTool` extension as future — it is now done, and the shapebar holds 16 tools.

- [ ] **Step 4: Final verification**

Run: `npx vitest run && npm run typecheck && pkill -f "[v]ite" || true; npx playwright test --workers=1`
Expected: unit and typecheck green; Playwright green but for the 2 known `e2e/text-panel.spec.ts` failures. Record the real numbers in the commit body.

- [ ] **Step 5: Commit**

```bash
git add e2e/shapes.spec.ts .claude/memory
git commit -m "test(e2e): arrow binding, persistence and resize for flow shapes"
```
