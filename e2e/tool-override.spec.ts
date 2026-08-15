import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";

/**
 * The canvas region clear of the tool rail (left) and the docked controls panel
 * (right), matching e2e/style-memory.spec.ts's footprints.
 */
const BOX = [520, 300, 640, 380] as const;
/**
 * A point on BOX's left edge. A plain rectangle has a transparent background,
 * and Excalidraw only hit-tests the outline of a transparent-fill shape — a
 * click at the centre silently misses. Same note as style-memory.spec.ts.
 */
const BOX_EDGE = [520, 340] as const;

type H = {
  state?: {
    activeTool?: { type?: string; locked?: boolean };
    selectedElementIds?: Record<string, boolean>;
  };
};
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

const selectedCount = async (page: Page) =>
  Object.keys((await readState(page))?.selectedElementIds ?? {}).length;

async function drawBox(page: Page) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(BOX[0], BOX[1]);
  await page.mouse.down();
  await page.mouse.move(BOX[2], BOX[3], { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
});

test("the tool lock is on from the first paint", async ({ page }) => {
  expect((await readState(page))?.activeTool?.locked).toBe(true);
});

test("a drawing tool stays active after drawing", async ({ page }) => {
  await drawBox(page);
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
});

test("holding the modifier suspends the tool and releasing restores it", async ({ page }) => {
  await drawBox(page);
  // Shortcuts are container-bound (handleKeyboardGlobally is off), so focus the
  // canvas before any keyboard call — see [[vertical-toolbar]].
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("selection");

  await page.keyboard.up("ControlOrMeta");
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
});

test("a two-click elbow arrow ends up selected once it auto-finishes", async ({ page }) => {
  // Every other line/arrow test in this suite drag-creates (mousedown, move,
  // mouseup) or click-continues (a 2nd, 3rd, ... click while already
  // mid-line), both of which route through vendor App.tsx sites that
  // unconditionally select the in-progress element regardless of the tool
  // lock (already patched by commit a9dcdb6f). An elbow arrow is different:
  // vendor App.tsx auto-finalizes it the instant its second point commits
  // (the `isElbowArrow(multiElement) && multiElement.points.length > 1`
  // branch in `handleLinearElementOnPointerDown`), calling
  // `actionManager.executeAction(actionFinalize)` directly and skipping the
  // click-continuation selection code entirely. That makes a 2-click elbow
  // arrow the one reachable path where actionFinalize's OWN selection logic
  // (`actionFinalize.tsx`) is the sole determiner of whether the element ends
  // up selected — verified by instrumenting actionFinalize directly: it runs
  // with `selectedElementIds: {}` here, unlike every other creation path in
  // this suite. See finding 1 in final-review-findings.md.
  await pickTool(page, "Elbow arrow");
  await page.mouse.click(BOX[0], BOX[1]);
  await page.mouse.click(BOX[2], BOX[3]);
  await expect.poll(() => selectedCount(page)).toBe(1);
});

test("typing into the canvas search box reaches the field, letter q included", async ({ page }) => {
  // useToolOverride.ts swallows a bare "q" keydown on the canvas (it would
  // otherwise silently drop the user to the Selection tool, see the design
  // spec), guarded by isTextEntry so the letter still reaches a real text
  // field. flow's own search boxes (SearchControl.tsx, SearchPanel.tsx) are
  // both type="search" — a type isTextEntry did not recognize until this
  // fix, so "q" was eaten here too. A `.fill()`-based test (as
  // e2e/bottombar.spec.ts's search test uses) sets the value directly with no
  // per-key keydown, so it cannot see this bug; type per-key here instead.
  const search = page.getByRole("searchbox", { name: "Search canvas", exact: true });
  await search.click();
  await page.keyboard.type("quick");
  await expect(search).toHaveValue("quick");
});

test("a selection made while the modifier is held survives the release", async ({ page }) => {
  await drawBox(page);
  await pickTool(page, "Rectangle");
  // Clear the post-draw selection so the assertion can only pass via the
  // Cmd-held click below.
  await page.mouse.click(900, 600);
  expect(await selectedCount(page)).toBe(0);

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
  expect(await selectedCount(page)).toBe(1);
});

test("holding the modifier lets you drag a shape to move it", async ({ page }) => {
  // The override exists so a modifier press gives you the selection tool *and
  // everything it does* — including moving. Upstream deliberately suppresses
  // element dragging for any gesture whose pointerdown carried cmd/ctrl (it
  // reserves that modifier for select-through), which silently made flow's
  // override select-only. Nothing caught it: the tests above prove the tool
  // switches and that a selection survives the release, but never that the
  // thing you selected can actually be moved.
  await drawBox(page); // leaves the box selected, which is the real scenario:
                       // draw something, then hold the modifier to nudge it
  const before = await page.evaluate(() => {
    const el = (window as any).h.app.scene.getNonDeletedElements()[0];
    return { x: el.x, y: el.y };
  });

  await page.keyboard.down("ControlOrMeta");
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("selection");

  const mid = { x: (BOX[0] + BOX[2]) / 2, y: (BOX[1] + BOX[3]) / 2 };
  await page.mouse.move(mid.x, mid.y);
  await page.mouse.down();
  await page.mouse.move(mid.x + 120, mid.y + 90, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");

  const after = await page.evaluate(() => {
    const el = (window as any).h.app.scene.getNonDeletedElements()[0];
    return { x: el.x, y: el.y };
  });

  expect(Math.round(after.x - before.x)).toBe(120);
  expect(Math.round(after.y - before.y)).toBe(90);
});

test("the modifier still marquee-selects from empty canvas", async ({ page }) => {
  // Guard on the other side of the fork edit: enabling drag-while-held must not
  // turn an empty-canvas modifier drag into something other than a marquee.
  await drawBox(page);
  await pickTool(page, "Selection");
  await page.mouse.click(900, 600); // deselect
  expect(await selectedCount(page)).toBe(0);

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.move(BOX[0] - 60, BOX[1] - 60);
  await page.mouse.down();
  await page.mouse.move(BOX[2] + 40, BOX[3] + 40, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");

  expect(await selectedCount(page)).toBe(1);
});

/** A second box, clear of BOX, drawn the same way. Its left edge is the hit
 *  target for the same transparent-fill reason BOX_EDGE exists. */
const BOX2 = [700, 300, 820, 380] as const;
const BOX2_EDGE = [700, 340] as const;

async function drawSecondBox(page: Page) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(BOX2[0], BOX2[1]);
  await page.mouse.down();
  await page.mouse.move(BOX2[2], BOX2[3], { steps: 8 });
  await page.mouse.up();
}

test("modifier + shift-click adds a second element to the selection", async ({ page }) => {
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);

  await page.keyboard.down("Shift");
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(() => selectedCount(page)).toBe(2);
});

test("modifier + shift-click on an already-selected element removes it", async ({ page }) => {
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await page.keyboard.down("Shift");
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(2);

  // Clicking the second one again with shift still held takes it back out.
  // This proves the pointerup deselect path still owns deselection and that
  // pointerdown did not also toggle (which would net out to no change).
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(() => selectedCount(page)).toBe(1);
});

test("modifier + shift-drag moves the selection instead of deselecting", async ({ page }) => {
  await drawBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);

  const before = await page.evaluate(
    () => (window as unknown as { h: { elements: { x: number }[] } }).h.elements[0].x,
  );

  await page.keyboard.down("Shift");
  await page.mouse.move(BOX_EDGE[0], BOX_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 60, BOX_EDGE[1], { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  // Still selected (not deselected by the shift), and actually moved.
  await expect.poll(() => selectedCount(page)).toBe(1);
  const after = await page.evaluate(
    () => (window as unknown as { h: { elements: { x: number }[] } }).h.elements[0].x,
  );
  expect(after).toBeGreaterThan(before);
});

/** Read how many object-snap guide lines the canvas is currently showing. */
const snapLineCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { snapLines?: unknown[] } } }).h
        ?.state?.snapLines?.length ?? 0,
  );

/** Turn "Snap to Objects" off via the real View menu if it is currently on. */
async function ensureObjectSnapOff(page: Page) {
  const enabled = await page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
        .h?.state?.objectsSnapModeEnabled ?? false,
  );
  if (!enabled) {
    return;
  }
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Snap to Objects" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
            .h?.state?.objectsSnapModeEnabled ?? false,
      ),
    )
    .toBe(false);
}

test("holding the modifier does not turn object snapping on", async ({ page }) => {
  await ensureObjectSnapOff(page);
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  // Grab the second box with the modifier held and drag it until its edges are
  // near the first box's — the alignment that would produce snap guides.
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.move(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 2, BOX_EDGE[1] + 2, { steps: 12 });

  // Snap mode is OFF, so no guides may appear regardless of the held modifier.
  expect(await snapLineCount(page)).toBe(0);

  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");
});

/** Turn "Snap to Objects" on via the real View menu if it is currently off. */
async function ensureObjectSnapOn(page: Page) {
  const enabled = await page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
        .h?.state?.objectsSnapModeEnabled ?? false,
  );
  if (enabled) {
    return;
  }
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Snap to Objects" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
            .h?.state?.objectsSnapModeEnabled ?? false,
      ),
    )
    .toBe(true);
}

test("the snap toggle, switched on through the real menu, still produces guides with no modifier held", async ({
  page,
}) => {
  // Companion to the test above: that one proves the OFF side survived the
  // fork edit (modifier can no longer force snapping on). This proves the ON
  // side survived too — the binding constraint is "snapping follows the
  // explicit toggles alone," not just "the modifier no longer overrides it."
  // Route through OFF first so the ON branch below always exercises the real
  // menu-click path, regardless of flow's default.
  await ensureObjectSnapOff(page);
  await ensureObjectSnapOn(page);
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  // Identical drag geometry to the RED run that reported snapLines.length
  // === 6 at this exact alignment — no modifier held this time, since this
  // test is about the toggle, not the override.
  await page.mouse.move(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 2, BOX_EDGE[1] + 2, { steps: 12 });

  // Assert while the drag is still in progress — snapLines is only populated
  // during an active drag, not after mouse.up() commits the move.
  expect(await snapLineCount(page)).toBeGreaterThan(0);

  await page.mouse.up();
});

/** Turn grid mode on via the real View menu. */
async function enableGridMode(page: Page) {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Grid", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { h?: { state?: { gridModeEnabled?: boolean } } }).h
            ?.state?.gridModeEnabled ?? false,
      ),
    )
    .toBe(true);
}

test("holding the modifier does not bypass grid snapping", async ({ page }) => {
  await enableGridMode(page);
  await drawBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  // Drag by a deliberately non-grid-multiple offset with the modifier held.
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);
  await page.mouse.move(BOX_EDGE[0], BOX_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 47, BOX_EDGE[1] + 33, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");

  const { x, y, gridSize } = await page.evaluate(() => {
    const h = (
      window as unknown as {
        h: { elements: { x: number; y: number }[]; state: { gridSize: number } };
      }
    ).h;
    return { x: h.elements[0].x, y: h.elements[0].y, gridSize: h.state.gridSize };
  });

  // The drop position must land on the grid despite the held modifier.
  expect(x % gridSize).toBe(0);
  expect(y % gridSize).toBe(0);
});
