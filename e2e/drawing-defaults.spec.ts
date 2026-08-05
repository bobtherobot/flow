import { test, expect, type Page } from "@playwright/test";

/** Draw a shape with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: tool, exact: true })
    .click();
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test("a fresh rectangle has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  // Excalidraw ships currentItemRoundness "round" → an adaptive 32px radius.
  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("a fresh diamond has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Diamond", 760, 480);

  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("the Transform panel still rounds a shape on demand", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("16");
  await radius.blur();
  await expect(radius).toHaveValue("16");
});

test("the stroke slider spans 0 to 10px", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const slider = page.getByRole("slider", { name: "Stroke width" });
  await expect(slider).toHaveAttribute("min", "0");
  await expect(slider).toHaveAttribute("max", "10");
});

test("a zero stroke width applies without hanging the canvas", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const width = page.getByLabel("Stroke width value");
  await width.fill("0");
  await width.blur();
  await expect(width).toHaveValue("0");

  // The canvas must still be responsive: a degenerate fill would peg the main
  // thread and starve this second interaction.
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("8");
  await radius.blur();
  await expect(radius).toHaveValue("8", { timeout: 5000 });
});
