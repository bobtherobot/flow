import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function drawWith(page: Page, testid: string, x2: number, y2: number) {
  await page.getByTestId(testid).click({ force: true });
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test("Edit menu exposes z-order, group and align actions", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await page.getByRole("menuitem", { name: "Edit" }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /^Group/ })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Bring to Front" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Send to Back" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Align", exact: true })).toBeVisible();
});

test("arrow elbow applies via the executeAction fork export", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "toolbar-arrow", 900, 560); // diagonal so elbow routing is visible

  await page.getByRole("radio", { name: "Elbow" }).click();
  await expect(page.getByRole("radio", { name: "Elbow" })).toBeChecked();

  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/arrow-elbow.png` });
});

test("Edit ▸ Duplicate runs the action without error", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "toolbar-rectangle", 760, 480);

  await page.getByRole("menuitem", { name: "Edit" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();

  // The app is still alive and the panel intact (the action dispatched cleanly).
  await expect(page.locator(".flow-pnl")).toBeVisible();
  await page.screenshot({ path: `${OUT}/duplicate.png` });
});
