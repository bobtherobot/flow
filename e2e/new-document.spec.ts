import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";
import { openMenu } from "./helpers/menu";
import { gotoApp } from "./helpers/app";

/**
 * File ▸ New calls Excalidraw's `resetScene()`, which replaces the whole
 * appState with `getDefaultAppState()`. Every value flow seeds through
 * `initialData.appState` is app-wide preference state, not document state, so
 * it has to be re-seeded afterwards — see `flowSeedAppState`.
 */
async function fileNew(page: Page) {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  await page.waitForTimeout(200);
}

function readState(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { h: { state: Record<string, unknown> } }).h.state;
    return {
      currentItemRoughness: s.currentItemRoughness,
      currentItemRoundness: s.currentItemRoundness,
      currentItemFontFamily: s.currentItemFontFamily,
      objectsSnapModeEnabled: s.objectsSnapModeEnabled,
      bindingMode: s.bindingMode,
      laserColor: s.laserColor,
      selectionMode: s.selectionMode,
      gridSize: s.gridSize,
      gridColor: s.gridColor,
      gridColorBold: s.gridColorBold,
    };
  });
}

test("a box drawn after File ▸ New gets the dragged dimensions", async ({ page }) => {
  // Regression: resetScene reverted currentItemRoughness to Excalidraw's 1
  // while flow's sloppiness preference stayed 0, so App's onChange normalizer
  // fired on the very first change of the drag and pushed a *cloned* element
  // array into the scene. appState.newElement kept pointing at the original
  // object, so every subsequent drag mutation landed on an orphan and the
  // element in the scene stayed 0x0.
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await fileNew(page);

  await pickTool(page, "Rectangle");
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(760, 480, { steps: 8 });
  await page.mouse.up();

  const box = await page.evaluate(() => {
    const el = (
      window as unknown as { h: { elements: Array<{ type: string; width: number; height: number }> } }
    ).h.elements.find((e) => e.type === "rectangle");
    return el && { width: Math.round(el.width), height: Math.round(el.height) };
  });
  expect(box).toEqual({ width: 200, height: 140 });
});

test("File ▸ New keeps flow's app-wide appState preferences", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  const before = await readState(page);
  await fileNew(page);
  const after = await readState(page);

  expect(after).toEqual(before);
  // Spot-check the actual flow defaults, so this can't pass by both sides
  // drifting to Excalidraw's values together.
  expect(after.currentItemRoundness).toBe("sharp");
  expect(after.currentItemRoughness).toBe(0);
  expect(after.objectsSnapModeEnabled).toBe(true);
  expect(after.bindingMode).toBe("on");
  expect(after.gridColor).toBe("#dddddd");
  expect(after.gridColorBold).toBe("#e5e5e5");
});

test("File ▸ New still clears the canvas", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  await pickTool(page, "Rectangle");
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(760, 480, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { h: { elements: unknown[] } }).h.elements.length),
    )
    .toBe(1);

  await fileNew(page);
  await expect
    .poll(() =>
      page.evaluate(() => (window as unknown as { h: { elements: unknown[] } }).h.elements.length),
    )
    .toBe(0);
});
