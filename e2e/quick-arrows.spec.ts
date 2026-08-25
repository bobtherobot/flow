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
 *  lock keeps Rectangle armed after a draw, so the switch back is required.
 *
 *  Deliberately does NOT click the canvas afterward. The Escape press below
 *  clears the freshly drawn shape's selection without moving keyboard focus
 *  onto the canvas — focus stays on the rail's "Selection" button. That is
 *  load-bearing: a real bug here left keyboard focus on flow's chrome after a
 *  quick-arrow drag, so Ctrl+Z did nothing even though the arrow was in the
 *  undo stack. The fix makes the drag gesture explicitly focus
 *  `.excalidraw-container`. If a test clicked the canvas first, focus would
 *  already be correct going into the gesture and the undo assertions in this
 *  file would pass for the wrong reason. */
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

  // A point just short of the glyph's near edge, back toward the shape:
  // outside the element itself, inside the halo. Read from the glyph's own
  // bounding box rather than a hardcoded pixel so this survives a tuning
  // change to ARROW_GAP/ARROW_DEPTH — if the hover region were the element's
  // own hit area, this point would dismiss the arrows before the pointer
  // ever reached the glyph.
  const glyph = await upArrow(page).boundingBox();
  await page.mouse.move(glyph!.x + glyph!.width / 2, glyph!.y + glyph!.height + 1);
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
  const glyph = await rightArrow(page).boundingBox();
  const before = await page.evaluate(() => (window as any).h.history.undoStack.length);

  await page.mouse.move(glyph!.x + glyph!.width / 2, glyph!.y + glyph!.height / 2);
  await page.mouse.down();
  // Ruling R16: deliberate and load-bearing. A realistic click hold is
  // 40-100ms, well past one animation frame — exactly the condition that
  // used to slip past the old (fixed in 3ee73e8) timing-race click detector
  // and mint a degenerate arrow. Without this wait, a fast synthetic
  // down/up could pass even against that old, buggy detector, so the test
  // would stop proving what its name claims.
  await page.waitForTimeout(60);
  await page.mouse.up();

  // Ruling R16: probing this with Ctrl+Z would test the wrong thing. In
  // flow, undo is dead while focus sits on a rail button -- a pre-existing,
  // unrelated gap reproducible with zero quick-arrow interaction (draw a
  // rectangle, click the Selection rail button, press Ctrl+Z: the rectangle
  // survives). Read the undo stack directly, which is what "mints no undo
  // entry" actually means.
  expect((await scene(page)).map((e: any) => e.type)).toEqual(["rectangle"]);
  expect(await page.evaluate(() => (window as any).h.history.undoStack.length)).toBe(before);
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

test("the arrows follow the shape when it is panned, and do not scale with zoom", async ({
  page,
}) => {
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
  expect(after!.x, "the glyph followed the pan").toBeLessThan(before!.x - 50);

  // Zoom moves the anchor but must NOT scale the glyph: it is sized in
  // viewport pixels so it stays equally grabbable at any zoom. Find the shape
  // by reading its real post-zoom viewport position rather than assuming it
  // stayed under a fixed point — Excalidraw's zoom anchor is not part of this
  // test's subject.
  await page.keyboard.press("Control+=");
  const centre = await page.evaluate(() => {
    const h = (window as any).h;
    const el = h.app.scene.getNonDeletedElements()[0];
    const st = h.app.state;
    return {
      x: (el.x + el.width / 2 + st.scrollX) * st.zoom.value + st.offsetLeft,
      y: (el.y + el.height / 2 + st.scrollY) * st.zoom.value + st.offsetTop,
    };
  });
  // Two moves: the first re-enters the halo, the second guarantees a
  // pointermove event even if the first landed on the same pixel.
  await page.mouse.move(centre.x, centre.y + 1);
  await page.mouse.move(centre.x, centre.y);
  const zoomed = await upArrow(page).boundingBox();
  expect(zoomed!.width, "the glyph is viewport-sized, not scene-sized").toBeCloseTo(
    after!.width,
    0,
  );
});
