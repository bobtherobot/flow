import { test, expect } from "@playwright/test";

// Each Playwright test gets a fresh browser context, so localStorage starts
// empty — no manual clearing needed (and clearing on reload would defeat the
// persistence test below).

test("dockable accordion replaces the Excalidraw island", async ({ page }) => {
  await page.goto("/");

  const panel = page.locator(".flow-pnl");
  await expect(panel).toBeVisible();

  // Transform / Color / Stroke / Text / Align / Search / Layers sub-panels, in order.
  const titles = page.locator(".flow-pnl-sub__title");
  await expect(titles).toHaveText([
    "Transform",
    "Color",
    "Stroke",
    "Text",
    "Align",
    "Search",
    "Layers",
  ]);

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
  const colorSection = page.locator('.flow-pnl-sub[data-pid="color"]');
  await expect(colorSection.locator(".flow-pnl-sub__content")).toBeVisible();

  await colorSection.getByRole("button", { name: "Collapse" }).click();
  await expect(colorSection.locator(".flow-pnl-sub__content")).toHaveCount(0);
});

test("detach floats the whole panel", async ({ page }) => {
  await page.goto("/");
  const panel = page.locator(".flow-pnl");
  await page.getByRole("button", { name: "Panel options" }).click();
  await page.getByRole("menuitem", { name: "Detach panel" }).click();
  await expect(panel).toHaveClass(/flow-pnl--floating/);
});

test("config menu stays fully on-screen when the panel is docked right", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Panel options" }).click();
  const menu = page.locator(".flow-pnl-config");
  await expect(menu).toBeVisible();

  const box = (await menu.boundingBox())!;
  const vp = page.viewportSize()!;
  // The whole menu is inside the viewport on every edge.
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
});

test("reordering a docked sub-panel persists after drop and reload", async ({ page }) => {
  await page.goto("/");
  const titles = page.locator(".flow-pnl-sub__title");
  await expect(titles).toHaveText([
    "Transform",
    "Color",
    "Stroke",
    "Text",
    "Align",
    "Search",
    "Layers",
  ]);

  // Drag Stroke's header up above Transform to drop it at the top of the stack.
  const strokeHeader = page.locator('.flow-pnl-sub[data-pid="stroke"] .flow-pnl-sub__header');
  const transform = page.locator('.flow-pnl-sub[data-pid="transform"]');
  const sh = (await strokeHeader.boundingBox())!;
  const tb = (await transform.boundingBox())!;
  const grabX = sh.x + sh.width / 2;

  await page.mouse.move(grabX, sh.y + sh.height / 2);
  await page.mouse.down();
  // Move up in steps so pointermove fires, the ghost lifts, and the drop index
  // resolves. Stay at the same x so we don't cross the tear-off threshold.
  await page.mouse.move(grabX, sh.y - 24, { steps: 6 });
  await page.mouse.move(grabX, tb.y + 4, { steps: 6 });
  // The dragged panel is lifted out of the flow as a translucent ghost.
  await expect(page.locator(".flow-pnl-sub--dragging")).toBeVisible();
  await expect(page.locator(".flow-pnl__drop")).toBeVisible();
  await page.mouse.up();

  const reordered = ["Stroke", "Transform", "Color", "Text", "Align", "Search", "Layers"];
  await expect(titles).toHaveText(reordered);

  await page.reload();
  await expect(page.locator(".flow-pnl-sub__title")).toHaveText(reordered);
});
