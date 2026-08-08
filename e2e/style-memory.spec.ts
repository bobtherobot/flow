import { test, expect, type Page } from "@playwright/test";

/**
 * Non-overlapping footprints in the clear canvas region between the tool rail
 * and the docked panel. They must not overlap: one test click-selects a
 * specific box, and an overlap would silently hand the click to whichever
 * element sits on top.
 */
const BOX_A = [520, 300, 640, 380] as const;
const BOX_B = [680, 300, 800, 380] as const;
const BOX_C = [520, 420, 640, 500] as const;
const ARROW = [680, 420, 800, 470] as const;
/**
 * A point on BOX_A's left edge, for click-to-select. A plain rectangle has a
 * transparent background, and Excalidraw's hit-testing (`shouldTestInside` in
 * the fork's `element/collision.ts`) does not consider a transparent-fill
 * shape's interior a hit at all — only its outline is — so a click must land
 * on the border, not the centre, or it silently misses the shape entirely.
 */
const BOX_A_EDGE = [520, 340] as const;
/** Empty canvas, clear of every footprint above. */
const EMPTY_SPOT = [880, 550] as const;

/** Draw with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x1: number, y1: number, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: tool, exact: true })
    .click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Switch to the Selection tool. flow keeps the drawing tool active after a
 *  draw (permanent tool lock), so selecting must be explicit. */
async function pickSelection(page: Page) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: "Selection", exact: true })
    .click();
}

/** Place a loose text element. Leaves the text tool having been active. */
async function addText(page: Page, text: string) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: "Text", exact: true })
    .click();
  await page.mouse.click(EMPTY_SPOT[0], EMPTY_SPOT[1]);
  await page.keyboard.type(text);
  // Commits the text edit; focus is in Excalidraw's own WYSIWYG textarea here,
  // so (unlike a canvas-level deselect) this Escape actually reaches it. See
  // e2e/text-panel.spec.ts:9 for the same pattern.
  await page.keyboard.press("Escape");
}

/** Scene elements via the fork's `window.h` test hook (see
 *  e2e/drawing-defaults.spec.ts for the same cast). */
function readElements(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { h: { elements: Array<Record<string, unknown>> } };
    return w.h.elements.map((el) => ({
      type: el.type as string,
      strokeWidth: el.strokeWidth as number,
      cornerRadius: el.cornerRadius as number | undefined,
      roundness: el.roundness as { type: number } | null | undefined,
    }));
  });
}

// "A second box inherits the first box's stroke width" is deliberately absent:
// it passed with the whole hook unmounted (vanilla Excalidraw's single shared
// currentItemStrokeWidth already carries a value forward between two
// same-category draws) and is fully subsumed by the harder case right below,
// which adds an intervening different-category draw the vanilla behavior
// cannot survive.
test("an arrow's stroke width does not reach the next box", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // Give the shape bucket a distinctive width.
  await draw(page, "Rectangle", ...BOX_A);
  const boxWidth = page.getByLabel("Stroke width");
  await boxWidth.fill("7");
  await boxWidth.blur();

  // Now give the arrow bucket a different one.
  await draw(page, "Arrow", ...ARROW);
  const arrowWidth = page.getByLabel("Stroke width");
  await arrowWidth.fill("2");
  await arrowWidth.blur();
  await expect(arrowWidth).toHaveValue("2");

  // A new box must come back at 7, not the arrow's 2.
  await draw(page, "Rectangle", ...BOX_B);

  await expect(page.getByLabel("Stroke width")).toHaveValue("7");
});

test("selecting an element adopts its style for the next one of that kind", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", ...BOX_A);
  const first = page.getByLabel("Stroke width");
  await first.fill("8");
  await first.blur();

  await draw(page, "Rectangle", ...BOX_B);
  const second = page.getByLabel("Stroke width");
  await second.fill("3");
  await second.blur();
  await expect(second).toHaveValue("3");

  // Click BOX_A's outline — adopting it must restore 8 as the shape default.
  // flow keeps Rectangle active after drawing BOX_B (permanent tool lock),
  // so reaching Selection for this click must be explicit; a plain click
  // while a drawing tool is still active would start a new shape instead of
  // selecting BOX_A.
  await pickSelection(page);
  await page.mouse.click(BOX_A_EDGE[0], BOX_A_EDGE[1]);
  await expect(page.getByLabel("Stroke width")).toHaveValue("8");

  await draw(page, "Rectangle", ...BOX_C);
  await expect(page.getByLabel("Stroke width")).toHaveValue("8");
});

// Forward-looking guard, not a per-category-isolation test: it cannot detect
// the absence of isolation today. CATEGORY_KEYS.text currently holds only
// currentItemOpacity, and no flow panel writes currentItemOpacity at all (alpha
// rides in an 8-digit color hex instead — see .claude/memory/style-memory.md's
// "Known gap"), so activating the text tool never touches currentItemStrokeWidth
// either way; this passes identically with useStyleMemory unmounted. What it
// *does* pin: drawing a box, using the text tool, then drawing a second box
// still reads and stores the same stroke width on both boxes — a regression
// here would mean either the text tool clobbers unrelated appState, or the
// rectangle tool fails to reload its own default after an intervening tool
// change. If CATEGORY_KEYS.text ever widens to include a stroke-surface key,
// promote this back into a real per-category-isolation test (assert the
// panel/element value *during* text-tool activation, before the next box's own
// tool-change reload can paper over a leak).
test("stroke width survives an intervening text-tool detour, panel and element alike", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", ...BOX_A);
  const width = page.getByLabel("Stroke width");
  await width.fill("6");
  await width.blur();
  await expect(width).toHaveValue("6");

  await addText(page, "hello");

  await draw(page, "Rectangle", ...BOX_B);
  await expect(page.getByLabel("Stroke width")).toHaveValue("6");

  const boxes = (await readElements(page)).filter((el) => el.type === "rectangle");
  expect(boxes.map((b) => b.strokeWidth)).toEqual([6, 6]);
});

test("a second box inherits the first box's corner radius", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", ...BOX_A);
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("18");
  await radius.blur();
  await expect(radius).toHaveValue("18");

  // No explicit deselect: clicking the Rectangle tool to start the next draw
  // clears the current selection on its own.
  await draw(page, "Rectangle", ...BOX_B);

  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("18");

  // The panel field alone is not proof: `effectiveCornerRadius` reads
  // `cornerRadius` directly and never consults `roundness`, so it would read
  // 18 even if the box rendered square. Assert the element actually carries
  // a non-null `roundness` alongside the radius — that pair is what the
  // vendor's render path (Shape.ts) requires to draw rounded corners at all.
  const boxes = (await readElements(page)).filter((el) => el.type === "rectangle");
  expect(boxes[1]?.cornerRadius).toBe(18);
  expect(boxes[1]?.roundness).not.toBeNull();
});

test("an ellipse is never stamped with a remembered corner radius", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", ...BOX_A);
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("18");
  await radius.blur();
  await expect(radius).toHaveValue("18");

  // No explicit deselect: clicking the Ellipse tool to start the next draw
  // clears the current selection on its own.
  await draw(page, "Ellipse", ...BOX_B);

  // The control is inapplicable to an ellipse, and — the point of the test —
  // the remembered radius must not have been written onto the element either.
  await expect(page.getByLabel("Corner radius", { exact: true })).toBeDisabled();
  const ellipse = (await readElements(page)).find((el) => el.type === "ellipse");
  expect(ellipse?.cornerRadius).toBeUndefined();
});
