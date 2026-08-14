import { test, expect } from "@playwright/test";
import { pickTool } from "./helpers/rails";

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
    await page.goto("/");
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
    await page.goto("/");
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
