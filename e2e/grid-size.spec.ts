import { test, expect, type Page } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";

async function setGridSize(page: Page, value: number) {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const input = page.getByLabel("Grid size");
  await input.fill(String(value));
  await input.blur();
  await page.getByRole("button", { name: "Done" }).click();
}

function readGridSize(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { gridSize?: number } } }).h?.state
        ?.gridSize,
  );
}

test("grid-size preference updates the live appState.gridSize", async ({ page }) => {
  await gotoApp(page);
  // Wait for the app to be interactive before touching window.h (mount race).
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  // Default is Excalidraw's 20.
  await expect.poll(() => readGridSize(page)).toBe(20);

  await setGridSize(page, 50);
  await expect.poll(() => readGridSize(page)).toBe(50);
});

test("grid-size preference persists across reload", async ({ page }) => {
  await gotoApp(page);
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await setGridSize(page, 40);
  await reloadApp(page);
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();
  await expect.poll(() => readGridSize(page)).toBe(40);
});
