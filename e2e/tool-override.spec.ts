import { test, expect, type Page } from "@playwright/test";

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

async function pickTool(page: Page, name: string) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name, exact: true })
    .click();
}

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
  // (`actionFinalize.tsx`) is the sole determinor of whether the element ends
  // up selected — verified by instrumenting actionFinalize directly: it runs
  // with `selectedElementIds: {}` here, unlike every other creation path in
  // this suite. See finding 1 in final-review-findings.md.
  await pickTool(page, "Elbow arrow");
  await page.mouse.click(BOX[0], BOX[1]);
  await page.mouse.click(BOX[2], BOX[3]);
  await expect.poll(() => selectedCount(page)).toBe(1);
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
