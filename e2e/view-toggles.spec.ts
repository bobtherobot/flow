import { test, expect, type Page } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp } from "./helpers/app";

type H = { state?: Record<string, unknown> };
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

async function clickViewToggle(page: Page, name: string) {
  await openMenu(page, "View");
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("menuitem", { name: "View" })).toBeVisible();
});

test("Grid toggle flips gridModeEnabled", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.gridModeEnabled).toBe(false);
  await clickViewToggle(page, "Grid");
  await expect.poll(async () => (await readState(page))?.gridModeEnabled).toBe(true);
});

test("Snap to Objects toggle flips objectsSnapModeEnabled (defaults on)", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.objectsSnapModeEnabled).toBe(true);
  await clickViewToggle(page, "Snap to Objects");
  await expect.poll(async () => (await readState(page))?.objectsSnapModeEnabled).toBe(false);
});

test("Zen Mode toggle flips zenModeEnabled", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(false);
  await clickViewToggle(page, "Zen Mode");
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(true);
});

test("Arrow Binding toggle flips bindingMode on→off", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("on");
  await clickViewToggle(page, "Arrow Binding");
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("off");
});
