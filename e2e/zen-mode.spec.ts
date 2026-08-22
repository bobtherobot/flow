import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./helpers/app";
import { railButton } from "./helpers/rails";

type H = { state?: Record<string, unknown> };
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

/** Every flow surface zen is meant to remove. */
const HIDDEN_IN_ZEN: readonly [string, string][] = [
  ["main menu bar", ".flow-menubar"],
  ["quick-actions bar", ".flow-quickbar"],
  ["bottom bar", ".flow-bottombar"],
  ["controls dock", ".flow-pnl"],
  ["shapebar", '[role="toolbar"][aria-label="Shapes"]'],
];

const toolsRail = (page: Page) => page.locator('[role="toolbar"][aria-label="Tools"]');
const zenButton = (page: Page) => railButton(page, "Zen mode");

test.beforeEach(async ({ page }) => {
  await gotoApp(page);
  await expect(toolsRail(page)).toBeVisible();
});

test("the zen toggle sits on the Tools rail, right after the laser", async ({ page }) => {
  const labels = await toolsRail(page)
    .locator(".flow-toolbar__tools button")
    .evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
  expect(labels[labels.length - 1]).toBe("Zen mode");
  expect(labels[labels.length - 2]).toBe("Laser pointer");
});

test("the bottom bar no longer carries a zen toggle", async ({ page }) => {
  await expect(page.locator(".flow-bottombar")).toBeVisible();
  await expect(page.locator('.flow-bottombar button[aria-label="Zen mode"]')).toHaveCount(0);
});

test("zen hides every flow surface except the Tools rail, and restores them", async ({ page }) => {
  for (const [, selector] of HIDDEN_IN_ZEN) {
    await expect(page.locator(selector)).toBeVisible();
  }

  await zenButton(page).click();
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(true);

  for (const [name, selector] of HIDDEN_IN_ZEN) {
    await expect(page.locator(selector), `${name} should be hidden in zen`).toHaveCount(0);
  }
  // The escape hatch has to survive, or zen is a one-way door.
  await expect(toolsRail(page)).toBeVisible();
  await expect(zenButton(page)).toBeVisible();

  await zenButton(page).click();
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(false);
  for (const [name, selector] of HIDDEN_IN_ZEN) {
    await expect(page.locator(selector), `${name} should come back`).toBeVisible();
  }
});

test("the canvas reclaims the gutters zen frees up", async ({ page }) => {
  const gutters = () =>
    page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return {
        top: s.getPropertyValue("--flow-menubar-h").trim(),
        // PanelDock *removes* this on unmount rather than zeroing it; App reads
        // it as `var(--flow-panel-reserved, 0px)`, so "" is the zero case.
        right: s.getPropertyValue("--flow-panel-reserved").trim(),
        left: s.getPropertyValue("--flow-toolbar-reserved").trim(),
      };
    });
  /** The editor's own box — the ground truth the gutter vars only feed into. */
  const editorBox = async () => (await page.locator(".excalidraw").boundingBox())!;
  const viewport = page.viewportSize()!;

  const before = await gutters();
  expect(before.top).toBe("36px");
  expect(before.left).toBe("124px"); // 44px Tools + 80px Shapes
  expect(parseFloat(before.right)).toBeGreaterThan(0);
  const boxBefore = await editorBox();
  expect(boxBefore.width).toBeLessThan(viewport.width - 124);

  await zenButton(page).click();
  await expect.poll(async () => (await gutters()).top).toBe("0px");
  const during = await gutters();
  expect(during.right).toBe("");
  expect(during.left).toBe("44px"); // Tools rail alone

  // Full viewport minus the one rail that survives — top, right and the
  // shapebar's 80px all reclaimed.
  const boxDuring = await editorBox();
  expect(boxDuring.y).toBe(0);
  expect(boxDuring.height).toBe(viewport.height);
  expect(boxDuring.x).toBe(44);
  expect(boxDuring.width).toBe(viewport.width - 44);

  await zenButton(page).click();
  await expect.poll(async () => (await gutters()).top).toBe("36px");
  expect(await gutters()).toEqual(before);
  expect(await editorBox()).toEqual(boxBefore);
});

test("zen entered from the View menu is still exitable from the rail", async ({ page }) => {
  // The menu that turned zen on is the first thing zen removes, so the rail
  // button is the only way back — this is the trip that motivates it.
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Zen Mode", exact: true }).click();
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(true);
  await expect(page.locator(".flow-menubar")).toHaveCount(0);

  await zenButton(page).click();
  await expect.poll(async () => (await readState(page))?.zenModeEnabled).toBe(false);
  await expect(page.locator(".flow-menubar")).toBeVisible();
});
