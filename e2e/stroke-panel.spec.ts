import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function drawWith(page: Page, toolLabel: string, x2: number, y2: number) {
  // Scope to the tool rail: quick-actions labels can substring-collide (e.g.
  // "Arrow" ⊂ "Arrow binding").
  await page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: toolLabel }).click();
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

  const width = page.getByLabel("Stroke width value");
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
  await endSize.fill("12");
  await expect(endSize).toHaveValue("12");

  // Removing the end head disables its size slider…
  const endGroup = page.getByRole("radiogroup", { name: "End arrowhead" });
  await endGroup.getByRole("radio", { name: "None" }).click();
  await expect(endSize).toBeDisabled();

  // …and adding a start head enables that one.
  const startGroup = page.getByRole("radiogroup", { name: "Start arrowhead" });
  await startGroup.getByRole("radio", { name: "Triangle" }).click();
  await expect(startSize).toBeEnabled();
});
