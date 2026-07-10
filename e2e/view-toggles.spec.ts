import { test, expect, type Page } from "@playwright/test";

type H = { state?: Record<string, unknown> & { activeTool?: { locked?: boolean } } };
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

async function clickViewToggle(page: Page, name: string) {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name, exact: true }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
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

test("Tool Lock toggle flips activeTool.locked", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(false);
  await clickViewToggle(page, "Tool Lock");
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(true);
});

test("Arrow Binding toggle flips bindingMode on→off", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("on");
  await clickViewToggle(page, "Arrow Binding");
  await expect.poll(async () => (await readState(page))?.bindingMode).toBe("off");
});
