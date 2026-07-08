import { test, expect } from "@playwright/test";

// Each Playwright test gets a fresh browser context, so localStorage starts
// empty — no manual clearing needed (and clearing on reload would defeat the
// persistence test below).

test("dockable accordion replaces the Excalidraw island", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator(".flow-pnl");
  await expect(panel).toBeVisible();

  // Style / Stroke / Text / Layers sub-panels present, in order.
  const titles = page.locator(".flow-pnl-sub__title");
  await expect(titles).toHaveText(["Style", "Stroke", "Text", "Layers"]);

  // Excalidraw's context-aware properties island is suppressed.
  await expect(page.locator(".excalidraw .selected-shape-actions")).toHaveCount(0);
});

test("collapse persists across reload", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".flow-pnl");
  await expect(panel).toHaveClass(/flow-pnl--docked/);

  await page.getByRole("button", { name: "Collapse panel" }).click();
  await expect(panel).toHaveClass(/flow-pnl--collapsed/);

  await page.reload();
  await expect(page.locator(".flow-pnl")).toHaveClass(/flow-pnl--collapsed/);
});

test("a sub-panel collapses its content", async ({ page }) => {
  await page.goto("/");
  const styleSection = page.locator('.flow-pnl-sub[data-pid="style"]');
  await expect(styleSection.locator(".flow-pnl-sub__content")).toBeVisible();

  await styleSection.getByRole("button", { name: "Collapse" }).click();
  await expect(styleSection.locator(".flow-pnl-sub__content")).toHaveCount(0);
});

test("detach floats the whole panel", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".flow-pnl");
  await page.getByRole("button", { name: "Panel options" }).click();
  await page.getByRole("menuitem", { name: "Detach panel" }).click();
  await expect(panel).toHaveClass(/flow-pnl--floating/);
});
