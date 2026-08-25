import { test, expect, type Page } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp } from "./helpers/app";
import { RECENT_PALETTE_NAME } from "../src/lib/color-palettes";

/**
 * File ▸ Preferences ▸ Restore Factory Settings.
 *
 * The reset is a prefix sweep of localStorage followed by a reload — see
 * `resetFactorySettings` for why it is deliberately blunt. What these tests pin
 * is the boundary that makes bluntness safe: preferences go, IndexedDB stays.
 */

async function openPreferences(page: Page) {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
}

const flowKeys = (page: Page) =>
  page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("flow."))
      .sort(),
  );

/** Move settings away from their defaults across several storage keys. */
async function changeSomeSettings(page: Page) {
  await openPreferences(page);
  await page.getByRole("radio", { name: "Cartoonist" }).check();
  const gridSize = page.getByRole("spinbutton", { name: "Grid size" });
  await gridSize.fill("45");
  await gridSize.press("Enter");
  await page.getByRole("button", { name: "Done" }).click();
}

test("the warning explains what goes and what stays, and cancelling changes nothing", async ({
  page,
}) => {
  await gotoApp(page);
  await changeSomeSettings(page);
  const before = await flowKeys(page);
  expect(before.length).toBeGreaterThan(0);

  await openPreferences(page);
  await page.getByRole("button", { name: "Restore Factory Settings" }).click();

  const warning = page.getByRole("alertdialog");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/cannot be undone/i);
  await expect(warning).toContainText(/palette/i);
  await expect(warning).toContainText(/saved drawings are kept/i);

  await warning.getByRole("button", { name: "Cancel" }).click();
  await expect(warning).toBeHidden();
  // Preferences is still open behind it, and nothing was cleared.
  await expect(page.getByRole("dialog", { name: "Preferences" })).toBeVisible();
  expect(await flowKeys(page)).toEqual(before);
});

test("confirming clears every flow preference and restarts on the defaults", async ({
  page,
}) => {
  await gotoApp(page);
  await changeSomeSettings(page);

  // Something outside flow's namespace, to prove the sweep is scoped.
  await page.evaluate(() => localStorage.setItem("unrelated.setting", "kept"));

  await openPreferences(page);
  await page.getByRole("button", { name: "Restore Factory Settings" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore Factory Settings" })
    .click();

  // The reload is part of the action, so wait for the app to come back up.
  await page.waitForSelector(".flow-pnl");
  await expect
    .poll(() => page.evaluate(() => Boolean((window as any).h?.app?.scene)))
    .toBe(true);

  expect(await page.evaluate(() => localStorage.getItem("unrelated.setting"))).toBe("kept");

  await openPreferences(page);
  await expect(page.getByRole("radio", { name: "Architect" })).toBeChecked();
  await expect(page.getByRole("spinbutton", { name: "Grid size" })).toHaveValue("20");
});

test("saved drawings survive the reset", async ({ page }) => {
  await gotoApp(page);

  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(760, 440, { steps: 8 });
  await page.mouse.up();

  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Save…" }).click();
  const name = page.getByRole("dialog").getByRole("textbox").first();
  await name.fill("Keep me");
  await page.getByRole("dialog").getByRole("button", { name: /save/i }).click();

  // The document lives in IndexedDB, which the sweep cannot reach.
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await (indexedDB as any).databases()).some((d: any) => d.name === "flow"),
      ),
    )
    .toBe(true);

  await openPreferences(page);
  await page.getByRole("button", { name: "Restore Factory Settings" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore Factory Settings" })
    .click();
  await page.waitForSelector(".flow-pnl");

  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Open…" }).click();
  await expect(page.getByText("Keep me")).toBeVisible();
});

test("the Recent palette and its rotating colours are wiped", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(680, 380, { steps: 6 });
  await page.mouse.up();

  const colorPanel = ".flow-clr-panel";
  const tiles = page.locator(colorPanel).locator(".flow-clr-palette__tile");
  const showRecent = () =>
    page
      .locator(colorPanel)
      .getByLabel("Palette", { exact: true })
      .selectOption({ label: RECENT_PALETTE_NAME });

  await showRecent();
  await expect(tiles).toHaveCount(0);

  // Closing the rail popup is the one automatic way a colour enters Recent.
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const picker = page.locator('[role="dialog"][aria-label="Color picker"]');
  const box = (await picker.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  await picker.getByRole("button", { name: /close color picker/i }).click();
  await expect(tiles).toHaveCount(1);

  // The exact colour that landed in Recent, so the check below is about this
  // user's data rather than a hardcoded hex that might never have been stored.
  const captured = (
    await page.evaluate(() => window.h.elements[0].backgroundColor as string)
  ).slice(0, 7);
  expect(captured).toMatch(/^#[0-9a-f]{6}$/);

  await openPreferences(page);
  await page.getByRole("button", { name: "Restore Factory Settings" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Restore Factory Settings" })
    .click();
  await page.waitForSelector(".flow-pnl");

  // Note the keys are BACK — startup re-seeds the palette store on its
  // defaults, so asserting their absence would fail for the right reason and
  // tell us nothing. What matters is the content: this user's colour is gone.
  expect(await flowKeys(page)).toContain("flow.colorPalettes");
  const stored = await page.evaluate(() => localStorage.getItem("flow.colorPalettes") ?? "");
  expect(stored).not.toContain(captured);

  await showRecent();
  await expect(tiles).toHaveCount(0);
});
