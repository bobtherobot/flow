import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/97196cc9-5c01-4299-a65a-c305e9b38b42/scratchpad";

/** Draw a rectangle by dragging between two viewport points; leaves it selected. */
async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

/** The Align sub-panel is expanded by default (fresh localStorage per test). */
async function openAlignPanel(page: Page) {
  await expect(page.locator(".flow-align-panel").getByRole("button", { name: "Align left" })).toBeVisible();
}

test("align buttons are disabled without a 2+ selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await openAlignPanel(page);
  // No selection at all.
  await expect(page.locator(".flow-align-panel").getByRole("button", { name: "Align left" })).toBeDisabled();
  await expect(page.locator(".flow-align-panel").getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();

  // A single element is still below the align threshold.
  await drawRect(page, 560, 300, 660, 380);
  await expect(page.locator(".flow-align-panel").getByRole("button", { name: "Align left" })).toBeDisabled();
});

test("align enables with 2 selected and dispatches; distribute needs 3", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await openAlignPanel(page);

  await drawRect(page, 560, 300, 640, 360);
  await drawRect(page, 720, 440, 800, 500);
  await page.keyboard.press("Control+a");

  const alignLeft = page.locator(".flow-align-panel").getByRole("button", { name: "Align left" });
  await expect(alignLeft).toBeEnabled();
  // Distribute needs 3.
  await expect(page.locator(".flow-align-panel").getByRole("button", { name: "Distribute horizontally" })).toBeDisabled();

  await alignLeft.click();
  // Draw a third and select all → distribute enables.
  await drawRect(page, 620, 380, 700, 440);
  await page.keyboard.press("Control+a");
  const distH = page.locator(".flow-align-panel").getByRole("button", { name: "Distribute horizontally" });
  await expect(distH).toBeEnabled();
  await distH.click();

  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/align-panel.png` });
});
