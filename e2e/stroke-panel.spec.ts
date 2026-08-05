import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function drawWith(page: Page, toolLabel: string, x2: number, y2: number) {
  // Scope to the tool rail: quick-actions labels can substring-collide (e.g.
  // "Arrow" ⊂ "Arrow binding"). exact: the arrow tool is split into
  // "Arrow" / "Curved arrow" / "Elbow arrow", so "Arrow" alone matches three.
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: toolLabel, exact: true })
    .click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test("arrow controls are disabled for a non-linear selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  await expect(page.getByRole("radio", { name: "Sharp" })).toBeDisabled();
  await expect(
    page.getByRole("radiogroup", { name: "End arrowhead" }).getByRole("radio", { name: "Triangle" }),
  ).toBeDisabled();
});

test("edits stroke width and dash style on the selected element", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await width.fill("8");
  await width.blur();
  await expect(width).toHaveValue("8");

  await page.getByRole("radio", { name: "Dashed" }).click();
  await expect(page.getByRole("radio", { name: "Dashed" })).toBeChecked();

  await page.screenshot({ path: `${OUT}/stroke-width-dash.png` });
});

test("arrowhead controls apply to an arrow", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const sharp = page.getByRole("radio", { name: "Sharp" });
  await expect(sharp).toBeEnabled();

  const endGroup = page.getByRole("radiogroup", { name: "End arrowhead" });
  await endGroup.getByRole("radio", { name: "Triangle" }).click();
  await expect(endGroup.getByRole("radio", { name: "Triangle" })).toBeChecked();

  await page.screenshot({ path: `${OUT}/arrow-triangle.png` });
});

test("arrowhead size sliders track the arrowhead state", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const startSize = page.getByRole("slider", { name: "Start arrowhead size" });
  const endSize = page.getByRole("slider", { name: "End arrowhead size" });

  // A fresh arrow has an end head but no start head.
  await expect(endSize).toBeEnabled();
  await expect(startSize).toBeDisabled();

  // Resizing the end head commits the new factor.
  await endSize.fill("10");
  await expect(endSize).toHaveValue("10");

  // Removing the end head disables its size slider…
  const endGroup = page.getByRole("radiogroup", { name: "End arrowhead" });
  await endGroup.getByRole("radio", { name: "None" }).click();
  await expect(endSize).toBeDisabled();

  // …and adding a start head enables that one.
  const startGroup = page.getByRole("radiogroup", { name: "Start arrowhead" });
  await startGroup.getByRole("radio", { name: "Triangle" }).click();
  await expect(startSize).toBeEnabled();
});

test("arrowhead size is a new-arrow tool default", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // With nothing selected, the End size slider edits the tool default.
  await page.keyboard.press("Escape");
  const endSize = page.getByRole("slider", { name: "End arrowhead size" });
  await expect(endSize).toBeEnabled();
  await endSize.fill("10");

  // A freshly drawn arrow inherits that default.
  await drawWith(page, "Arrow", 860, 320);
  await expect(page.getByRole("slider", { name: "End arrowhead size" })).toHaveValue("10");
});

test("an arrowhead-size drag records exactly one undo entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const size = page.getByRole("slider", { name: "End arrowhead size" });
  await expect(size).toBeEnabled();
  const before = await size.inputValue();

  // Drag the thumb across the track in steps, so the gesture emits many
  // intermediate values rather than a single jump. Raw page.mouse events
  // (unlike locator actions such as .click()/.fill()) don't auto-scroll, so
  // bring the slider into view before reading its box.
  await size.scrollIntoViewIfNeeded();
  const box = (await size.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();

  const after = await size.inputValue();
  expect(Number(after)).toBeGreaterThan(Number(before));

  // One undo must restore the pre-drag value: if the intermediates were each
  // captured, this would step back a single increment instead.
  await page.keyboard.press("Control+z");
  await expect(size).toHaveValue(before);
});

test("scrubbing the stroke width field changes the value in one undo entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");

  // Drag up over the field: span is the 0-10 range, so 150px sweeps the lot.
  // Raw page.mouse events don't auto-scroll like locator actions do, so bring
  // the field into view before reading its box (it sits at the viewport's
  // bottom edge by default).
  await width.scrollIntoViewIfNeeded();
  const box = (await width.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 12 });
  await page.mouse.up();

  await expect(width).toHaveValue("6");
  await page.keyboard.press("Control+z");
  await expect(width).toHaveValue("2");
});
