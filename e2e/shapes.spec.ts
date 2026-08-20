import { test, expect } from "@playwright/test";
import { pickTool } from "./helpers/rails";
import { SHAPES } from "../src/ui/toolbar/tools";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";

/**
 * Draw a rectangle from (400,200) to (700,400) and turn it into a flow shape.
 *
 * Stamps `customData.flowShape` through the vendor's `window.h` test hook —
 * there is no shape tool yet (Task 5). A plain `scene.mutateElement({
 * customData })` call does not do it: `mutateElement` only calls
 * `ShapeCache.delete` when the update touches `width`/`height`/`fileId`/
 * `points` (vendor/excalidraw/packages/element/src/mutateElement.ts:130-137),
 * so a `customData`-only in-place mutation leaves the cached rough shape (and
 * thus the render) stale — Task 2 discovered this exact gotcha. Minting a
 * fresh element object via `updateScene` is a guaranteed cache miss and
 * sidesteps it.
 *
 * `backgroundColor` defaults to the tool's own default (transparent) — pass
 * a real color to exercise the filled/interior hit-test path instead of the
 * outline-only one.
 */
async function drawFlowShape(
  page: import("@playwright/test").Page,
  kind: string,
  backgroundColor?: string,
) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 8 });
  await page.mouse.up();
  await page.evaluate(
    ({ k, bg }) => {
      const app = (window as any).h.app;
      const el = app.scene.getNonDeletedElements().at(-1);
      app.updateScene({
        elements: app.scene.getNonDeletedElements().map((e: any) =>
          e.id === el.id
            ? {
                ...e,
                customData: { flowShape: { kind: k, p: {} } },
                ...(bg ? { backgroundColor: bg } : {}),
                version: e.version + 1,
                versionNonce: Math.floor(Math.random() * 2 ** 31),
              }
            : e,
        ),
      });
    },
    { k: kind, bg: backgroundColor },
  );
  await pickTool(page, "Selection");
  // A freshly-drawn element stays selected. App.hitElement() hit-tests a
  // *selected* element against its full (padded) bounding box before it ever
  // consults the real outline/interior — so every click below would trivially
  // "hit" until we deselect for real. (900,500) is definitely on open canvas
  // (the toolbar rails occupy the left ~124px and top ~36px in this app's
  // layout), confirmed via document.elementFromPoint during investigation.
  await page.mouse.click(900, 500);
  expect(
    await page.evaluate(
      () => Object.keys((window as any).h.state.selectedElementIds ?? {}).length,
    ),
  ).toBe(0);
}

/** How many elements are currently selected. */
function selectedCount(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => Object.keys((window as any).h.state.selectedElementIds ?? {}).length,
  );
}

// The rectangle carrier spans (400,200)-(700,400). The triangle inscribed in
// it (apex centred on the top edge, base on the bottom edge) has vertices at
// (550,200), (700,400), (400,400) — see src/ui/shapes/geometry/triangle.ts.

test.describe("flow shape hit-testing", () => {
  test("a transparent shape selects on its real outline, not its bounding box", async ({
    page,
  }) => {
    await gotoApp(page);
    // Transparent is this app's default background (see
    // e2e/drawing-defaults.spec.ts) — a transparent element only hit-tests
    // along its outline, never its interior, so both points below sit near
    // an outline — either the box's or the triangle's — rather than deep
    // inside either shape. This is also the exact configuration the bug
    // report is about: a transparent triangle hit-testing as its box.
    await drawFlowShape(page, "triangle");

    // (405,205) sits right on the box's top-left corner, ~113px from the
    // nearest point on the triangle's real left edge — on the box outline,
    // nowhere near the triangle's.
    await page.mouse.click(405, 205);
    expect(await selectedCount(page)).toBe(0);

    // (475,300) is the exact midpoint of the triangle's left edge (from apex
    // (550,200) to base corner (400,400)) — on the triangle's real outline,
    // but 75-225px from every edge of the bounding box, so it never scores a
    // hit against the box.
    await page.mouse.click(475, 300);
    expect(await selectedCount(page)).toBe(1);
  });

  test("a filled shape selects on its real interior, not its bounding box", async ({
    page,
  }) => {
    await gotoApp(page);
    // Non-transparent background flips shouldTestInside() to true, routing
    // the click through the *interior* test (isPointInElement ->
    // intersectElementWithLineSegment -> intersectRectanguloidWithLineSegment)
    // instead of the outline-only one — this is the other hit-test consumer
    // this task fixed, and also the function an arrow's binding search uses.
    await drawFlowShape(page, "triangle", "#e03131");

    // Same box-corner point as above: inside the box, well outside the real
    // triangle (~113px from its nearest edge).
    await page.mouse.click(405, 205);
    expect(await selectedCount(page)).toBe(0);

    // (550,330) sits well inside the triangle's interior (near its centroid,
    // ~(550,333)) — nowhere near any edge, so this can only hit via a real
    // point-in-polygon test against the triangle, never the outline.
    await page.mouse.click(550, 330);
    expect(await selectedCount(page)).toBe(1);
  });
});

test("the shapebar's Triangle tool draws a stamped rectangle", async ({ page }) => {
  await gotoApp(page);
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
  await gotoApp(page);
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

// Finding 1 of the final review: `useActiveTool.setTool` (the shapebar's own
// click handler) is the only *flow-side* code that clears
// `currentItemFlowShape` -- but the vendor also activates tools directly from
// the keyboard (`findShapeByKey` in App.tsx), bypassing that wrapper
// entirely. Repro: arm Triangle from the shapebar, click the canvas (so the
// keyboard shortcut handler -- bound to the canvas container -- actually
// receives it), press R, drag. Before the vendor-side fix (a fifth fork
// site, App.tsx's keyboard shape-shortcut branch), the drawn rectangle came
// out stamped `kind: "triangle"` and the shapebar kept highlighting Triangle
// even though R is the plain Rectangle tool's own shortcut.
test("pressing a tool's keyboard shortcut disarms a previously-armed flow shape", async ({
  page,
}) => {
  await gotoApp(page);
  await pickTool(page, "Triangle");
  // Plain `page.mouse.click`, not a locator-based click: the Controls dock's
  // resize handle can overlap this point depending on which panels are open,
  // and a locator click's strict actionability check fails on that overlap
  // even though a real click here reaches the canvas fine (same pattern
  // `drawFlowShape` above and other tests in this file already rely on).
  await page.mouse.click(900, 500);
  await page.keyboard.press("r");

  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 8 });
  await page.mouse.up();

  const kind = await page.evaluate(
    () => (window as any).h.app.scene.getNonDeletedElements().at(-1).customData?.flowShape?.kind,
  );
  expect(kind).toBeUndefined();

  // The shapebar's own highlight must have followed the keyboard switch too
  // (it reads the same `currentItemFlowShape` appState field).
  const triangleBtn = page
    .getByRole("toolbar", { name: "Shapes" })
    .getByRole("button", { name: "Triangle", exact: true });
  await expect(triangleBtn).not.toHaveAttribute("aria-pressed", "true");
});

// Data-driven over every flow-shape tool in the shapebar (read from the same
// SHAPES list the rail renders from, not copy-pasted) — this is the test that
// catches a tool wired to the wrong kind: pick it by its visible label, drag
// a box, and assert the created element is a rectangle stamped with exactly
// that kind.
const FLOW_SHAPE_TOOLS = SHAPES.filter((t) => t.flowShape);

test.describe("every shapebar tool draws its own kind", () => {
  for (const tool of FLOW_SHAPE_TOOLS) {
    test(`${tool.label} draws a rectangle stamped with "${tool.flowShape}"`, async ({ page }) => {
      await gotoApp(page);
      await pickTool(page, tool.label);
      await page.mouse.move(400, 200);
      await page.mouse.down();
      await page.mouse.move(700, 400, { steps: 8 });
      await page.mouse.up();

      const stamped = await page.evaluate(() => {
        const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
        return { type: el.type, kind: el.customData?.flowShape?.kind };
      });
      expect(stamped).toEqual({ type: "rectangle", kind: tool.flowShape });
    });
  }
});

// Draws a 300x200 parallelogram carrier at (400,200)-(700,400). Its default
// skew (0.25) puts the "skew" handle dot at local (75,0) -> viewport
// (475,200) at this app's 100% zoom / zero scroll-offset default, the same
// 1:1 viewport-to-scene mapping the triangle-vertex math above this comment
// already relies on. Dragging the dot to viewport (600,200) -- local
// (200,0) -- clamps to skew = 200/300 = 0.6667.
test.describe("dragging a handle", () => {
  async function drawParallelogram(page: import("@playwright/test").Page) {
    await pickTool(page, "Parallelogram");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();
    // flow permanently locks the active tool (Illustrator-style) instead of
    // reverting to Selection after a draw, unlike vanilla Excalidraw -- so a
    // raw click on the canvas right now would arm another Parallelogram draw,
    // not select/deselect the one just drawn. Switch back explicitly, same
    // workaround `drawFlowShape` above uses. The just-drawn element stays
    // selected across the switch.
    await pickTool(page, "Selection");
    // Clicking the toolbar's Selection button leaves *it* focused, not the
    // canvas -- and since flow doesn't set Excalidraw's
    // `handleKeyboardGlobally` prop, its keyboard shortcuts (Ctrl+Z
    // included) only fire while focus is inside the excalidraw-container
    // div, which the toolbar rails render outside of (onKeyDown is a React
    // handler on that div, not a window listener). A real click on the
    // shape -- on its already-selected top edge, a no-op for selection --
    // returns focus to the canvas. Confirmed via a throwaway script that
    // without this, a Ctrl+Z run right after switching tools silently
    // no-ops (pre-existing app behavior, not something this feature
    // introduced: our handle-drag's `onPointerDown` also calls
    // `preventDefault`, mirroring `useDrag`'s existing contract, so it never
    // moves focus off whatever was focused before the drag started either).
    await page.mouse.click(650, 200);
  }

  async function flowParams(page: import("@playwright/test").Page) {
    return page.evaluate(() => {
      const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
      return el.customData?.flowShape?.p as { skew: number };
    });
  }

  async function dragSkewDot(page: import("@playwright/test").Page) {
    const dot = page.getByRole("button", { name: /Parallelogram skew handle/i });
    const box = (await dot.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(550, 200, { steps: 4 });
    await page.mouse.move(600, 200, { steps: 4 });
    await page.mouse.up();
  }

  test("dragging the skew dot changes the parameter and the outline hit-test follows the regenerated geometry", async ({
    page,
  }) => {
    await gotoApp(page);
    await drawParallelogram(page);
    expect((await flowParams(page)).skew).toBeCloseTo(0.25);

    // Deselect, then confirm (500,300) -- local (100,100) -- is nowhere near
    // the *default*-skew outline (interior only, no edge nearby) so it
    // doesn't hit-test as a select. This is the "before" half of the
    // regenerated-geometry proof below.
    await page.mouse.click(900, 500);
    expect(await selectedCount(page)).toBe(0);
    await page.mouse.click(500, 300);
    expect(await selectedCount(page)).toBe(0);

    // Reselect by clicking a point that's on the top edge regardless of skew
    // (the top edge's right endpoint (w,0) never moves).
    await page.mouse.click(650, 200);
    expect(await selectedCount(page)).toBe(1);

    await dragSkewDot(page);

    const dragged = await flowParams(page);
    expect(dragged.skew).toBeGreaterThan(0.64);
    expect(dragged.skew).toBeLessThan(0.69);

    // "The geometry regenerated": at skew ~0.667 the new left edge runs from
    // (0,200) to (200,0), which passes exactly through local (100,100) --
    // scene/viewport (500,300), the same point that missed entirely at the
    // default skew above. If the outline's geometry were still being read
    // from stale data, this point would still miss.
    await page.mouse.click(900, 500);
    expect(await selectedCount(page)).toBe(0);
    await page.mouse.click(500, 300);
    expect(await selectedCount(page)).toBe(1);
  });

  test("a single Ctrl+Z undoes the whole drag, not one step of it", async ({ page }) => {
    await gotoApp(page);
    await drawParallelogram(page);
    expect((await flowParams(page)).skew).toBeCloseTo(0.25);

    await dragSkewDot(page);
    const dragged = await flowParams(page);
    expect(dragged.skew).toBeGreaterThan(0.64);
    expect(dragged.skew).toBeLessThan(0.69);

    // Every intermediate frame of the drag was a deferred (EVENTUALLY),
    // non-history write, and only the pointer-up write committed -- so one
    // undo should land straight back on the pre-drag default, not one step
    // closer to it.
    await page.keyboard.press("Control+z");
    expect((await flowParams(page)).skew).toBeCloseTo(0.25);
  });
});

/**
 * Task 12: the end-to-end proof that the architecture works, plus the three
 * persistence/rendering guarantees the spec promises.
 */

// This is the test that earns the whole design. Flow's ten shapes are drawn
// on an ordinary `rectangle` element (customData.flowShape), specifically
// because `isBindableElement` (vendor/excalidraw/packages/element/src/
// typeChecks.ts) covers "rectangle" and excludes "line" -- the rejected
// alternative design (a closed polygon `line` carrier) would have needed
// zero fork edits anywhere, but an arrow could never bind to it. If the
// carrier were ever swapped for a line, this test is the one that would
// fail.
test("an arrow ending inside a triangle binds to it", async ({ page }) => {
  await gotoApp(page);
  await pickTool(page, "Triangle");
  await page.mouse.move(400, 200);
  await page.mouse.down();
  await page.mouse.move(700, 400, { steps: 8 });
  await page.mouse.up();

  const triangleId = await page.evaluate(
    () => (window as any).h.app.scene.getNonDeletedElements().at(-1).id,
  );

  await pickTool(page, "Arrow");
  // Start well outside the triangle's box entirely, end deep in its interior
  // (near its centroid, ~(550,320)). Correction: this point sits inside both
  // the triangle's real outline *and* its bounding box, so this assertion
  // alone doesn't distinguish a real point-in-polygon test from a
  // bounding-box guess -- proving that distinction is `distance.test.ts`/
  // `collision.test.ts`'s job (vendor/excalidraw/packages/element/src),
  // which probe points inside the box but outside the triangle's slanted
  // edges. What this test actually proves, and the reason it exists: an
  // arrow *can* bind to a flow-shape carrier at all -- that `rectangle` was
  // the right element type to build these shapes on (see the fork-site
  // comment above the test) -- exercised end-to-end through the real drawing
  // and binding UI, not through a test hook.
  await page.mouse.move(150, 150);
  await page.mouse.down();
  await page.mouse.move(550, 320, { steps: 8 });
  await page.mouse.up();

  const endBinding = await page.evaluate(
    () => (window as any).h.app.scene.getNonDeletedElements().at(-1).endBinding,
  );
  expect(endBinding?.elementId).toBe(triangleId);
});

test.describe("persistence, resize and graceful degradation", () => {
  test("saving, reloading and reopening preserves a dragged shape parameter", async ({
    page,
  }) => {
    await gotoApp(page);
    await pickTool(page, "Cylinder");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();
    // Flow's tool lock keeps Cylinder armed after drawing, so switch to
    // Selection before interacting further -- but do NOT click the canvas to
    // do it (unlike the drag-a-handle tests above): this shape's default
    // background is transparent, so it only hit-tests on its real outline,
    // and a click that misses it would deselect instead of refocusing. The
    // just-drawn element stays selected across a tool switch on its own
    // (same fact `drawParallelogram` above relies on), and this test never
    // needs keyboard focus on the canvas, so there's nothing the click would
    // have bought.
    await pickTool(page, "Selection");

    const dot = page.getByRole("button", { name: /Cylinder cap handle/i });
    const box = (await dot.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Cylinder's box is 300x200 at (400,200)-(700,400); the cap dot sits at
    // local (w/2, 2*cap*h) -- viewport (550,272) at the 0.18 default. Drag it
    // down to local y=150 (viewport 550,350), i.e. cap = 150/(2*200) = 0.375,
    // comfortably inside the geometry's own 0.02..0.45 clamp.
    await page.mouse.move(550, 350, { steps: 4 });
    await page.mouse.up();

    const dragged = await page.evaluate(() => {
      const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
      return el.customData?.flowShape?.p as { cap: number };
    });
    expect(dragged.cap).toBeGreaterThan(0.3);

    // Persist for real: File > Save > Store internally (IndexedDB -- flow's
    // scene isn't restored from a bare reload, unlike the appState prefs
    // other e2e specs reload-test, so round-tripping through Save/Open is
    // what actually proves customData.flowShape survives serialization).
    const docName = `flow-shapes-e2e-cylinder-${Date.now()}`;
    await openMenu(page, "File");
    await page.getByRole("menuitem", { name: "Save…" }).click();
    await page.getByLabel("Name").fill(docName);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await reloadApp(page);

    await openMenu(page, "File");
    await page.getByRole("menuitem", { name: "Open…" }).click();
    await page.getByRole("option", { name: new RegExp(docName) }).click();

    // Opening a stored document is asynchronous (IndexedDB read, then a scene
    // swap), and clicking the option only *starts* it. Reading the scene
    // straight afterwards races that swap and sees the pre-open scene, which
    // is why this test flaked ~2 runs in 3. Poll for the shape to arrive
    // instead — the same idiom `drawing-defaults.spec.ts` already uses after
    // its own File ▸ Open round-trip.
    const readCylinder = () =>
      page.evaluate(() => {
        const el = (window as any).h.app.scene
          .getNonDeletedElements()
          .find((e: any) => e.customData?.flowShape?.kind === "cylinder");
        return el ? (el.customData.flowShape as { kind: string; p: { cap: number } }) : null;
      });

    await expect.poll(async () => (await readCylinder())?.kind).toBe("cylinder");
    const restored = await readCylinder();
    expect(restored?.p.cap).toBeCloseTo(dragged.cap, 5);
  });

  test("resizing a star via a corner transform handle keeps it a flow shape", async ({
    page,
  }) => {
    await gotoApp(page);
    await pickTool(page, "Star");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();

    const before = await page.evaluate(() => {
      const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
      return {
        id: el.id,
        type: el.type,
        width: el.width,
        height: el.height,
        flowShape: el.customData?.flowShape,
      };
    });
    expect(before.type).toBe("rectangle");
    expect(before.flowShape?.kind).toBe("star");

    // Flow's tool lock keeps Star armed after drawing (Illustrator-style,
    // unlike vanilla Excalidraw) -- switch to Selection first, or the next
    // drag draws a second, smaller star instead of resizing this one. No
    // reselect click needed: the just-drawn element stays selected across
    // the switch on its own (see the cylinder test above for the same fact,
    // and why a click isn't used to prove it here either).
    await pickTool(page, "Selection");

    // Drag the native bottom-right resize handle (vendor chrome, not one of
    // flow's own orange dots -- this proves shapes need zero resize code of
    // their own because parameters are normalized 0..1 fractions of the box).
    // SELECTION_SPACING is 0 (flow's tight-chrome fork edit, see
    // drawing-defaults.md), so the 8px handle is centered exactly on the
    // element's own bounding corner (700,400), the point the box was drawn to.
    await page.mouse.move(700, 400);
    await page.mouse.down();
    await page.mouse.move(800, 500, { steps: 8 });
    await page.mouse.up();

    const after = await page.evaluate((id) => {
      const el = (window as any).h.app.scene
        .getNonDeletedElements()
        .find((e: any) => e.id === id);
      return {
        type: el.type,
        width: el.width,
        height: el.height,
        flowShape: el.customData?.flowShape,
      };
    }, before.id);

    expect(after.type).toBe("rectangle");
    expect(after.width).toBeGreaterThan(before.width);
    expect(after.height).toBeGreaterThan(before.height);
    // customData is untouched by resize -- normalized parameters don't need
    // to change when the box they're a fraction of does.
    expect(after.flowShape).toEqual(before.flowShape);
  });

  test("an unregistered shape kind degrades to a selectable plain box instead of crashing", async ({
    page,
  }) => {
    await gotoApp(page);
    await pickTool(page, "Rectangle");
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();

    // Stamp a kind the registry has never heard of, through the same vendor
    // test hook `drawFlowShape` uses -- getFlowShapeGeometry (register.test.ts)
    // returns null for it, so the renderer must fall back to the plain
    // rectangle carrier rather than throwing.
    const id = await page.evaluate(() => {
      const app = (window as any).h.app;
      const el = app.scene.getNonDeletedElements().at(-1);
      app.updateScene({
        elements: app.scene.getNonDeletedElements().map((e: any) =>
          e.id === el.id
            ? {
                ...e,
                customData: { flowShape: { kind: "not-a-shape", p: {} } },
                version: e.version + 1,
                versionNonce: Math.floor(Math.random() * 2 ** 31),
              }
            : e,
        ),
      });
      return el.id;
    });

    // The page is still alive and interactive rather than crashed white.
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();

    // Still selectable -- clicking its (box) outline hits it like any plain
    // rectangle would, proving the fallback isn't just inert paint.
    await pickTool(page, "Selection");
    await page.mouse.click(900, 500);
    expect(await selectedCount(page)).toBe(0);
    await page.mouse.click(400, 300);
    const selected = await page.evaluate(() =>
      Object.keys((window as any).h.state.selectedElementIds ?? {}),
    );
    expect(selected).toEqual([id]);
  });
});
