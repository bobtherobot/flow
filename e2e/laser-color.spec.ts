import { test, expect, type Page } from "@playwright/test";
import { SEED_VERSION } from "../src/lib/color-palettes";
import { openMenu } from "./helpers/menu";
import { gotoApp } from "./helpers/app";

/**
 * Pin the picker's presets to a fixed set before the app boots — these tests
 * assert on exact colors, which must not depend on which colors the shipped
 * default palette happens to contain. The stamped seed version keeps
 * `palette-store` from migrating the fixture back to the builtins on load.
 */
async function pinPresets(page: Page) {
  await page.addInitScript((version: string) => {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "e2e", name: "E2E", colors: ["#e03131", "#2f9e44", "#1971c2"] },
      ]),
    );
    localStorage.setItem("flow.defaultPaletteId", "e2e");
    localStorage.setItem("flow.paletteSeedVersion", version);
  }, String(SEED_VERSION));
}

async function openPreferences(page: Page) {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
}

test("laser color round-trips through the Preferences swatch", async ({ page }) => {
  await pinPresets(page);
  await gotoApp(page);
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await openPreferences(page);
  const laserSwatch = page.getByRole("button", { name: "Laser color", exact: true });
  await expect(laserSwatch).toHaveAttribute("title", "#ff0000"); // default

  await laserSwatch.click();
  await page.getByRole("button", { name: "#e03131", exact: true }).click();
  await expect(laserSwatch).toHaveAttribute("title", "#e03131");

  // Survives closing and reopening the dialog (it is persisted, not local state).
  await page.getByRole("button", { name: "Done" }).click();
  await openPreferences(page);
  await expect(laserSwatch).toHaveAttribute("title", "#e03131");
});

test("the laser trail renders in the chosen color", async ({ page }) => {
  await pinPresets(page);
  await gotoApp(page);
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await openPreferences(page);
  await page.getByRole("button", { name: "Laser color", exact: true }).click();
  await page.getByRole("button", { name: "#2f9e44", exact: true }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // Activate the laser tool and drag (right of the docked panel).
  await page.getByRole("button", { name: "Laser pointer" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 12 });

  // While the trail is live, its SVG path fill is the chosen color.
  await page.waitForFunction(() => {
    const p = document.querySelector(".SVGLayer svg path");
    return p?.getAttribute("fill") === "#2f9e44";
  }, { timeout: 2000 });

  await page.mouse.up();
});
