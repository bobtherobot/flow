import { test, expect } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";

test.describe("desktop menu bar + preferences", () => {
  test("menu bar sits above the canvas", async ({ page }) => {
    await gotoApp(page);
    const bar = page.getByRole("menubar", { name: "Application menu" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.y).toBeLessThanOrEqual(1); // pinned to the very top
  });

  test("File menu exposes Open/Save/Export/Preferences", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "File");
    await expect(page.getByRole("menuitem", { name: "Open…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Save…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Preferences…" })).toBeVisible();
  });

  test("changing sloppiness persists across reload", async ({ page }) => {
    await gotoApp(page);
    // Draw a rectangle so there is an element to restyle.
    await page.keyboard.press("r");
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(460, 420);
    await page.mouse.up();

    await openMenu(page, "File");
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await page.getByRole("radio", { name: "Cartoonist" }).check();
    await page.getByRole("button", { name: "Done" }).click();

    await reloadApp(page);
    await openMenu(page, "File");
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await expect(page.getByRole("radio", { name: "Cartoonist" })).toBeChecked();
  });

  test("Help ▸ About shows both repo links", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "Help");
    await page.getByRole("menuitem", { name: "About flow…" }).click();
    await expect(page.getByRole("link", { name: /flow repository/i })).toBeVisible();
    // The upstream link renders as plain "Excalidraw" (AboutDialog.tsx); `exact`
    // keeps it from also matching a future differently-worded Excalidraw link.
    await expect(page.getByRole("link", { name: "Excalidraw", exact: true })).toBeVisible();
  });

  test("library trigger and footer help icon are hidden", async ({ page }) => {
    await gotoApp(page);
    await expect(page.locator(".excalidraw .default-sidebar-trigger")).toBeHidden();
    await expect(page.locator(".excalidraw .help-icon")).toBeHidden();
  });

  test("Help menu exposes Documentation, Submit an issue, and Keyboard Shortcuts", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "Help");
    await expect(page.getByRole("menuitem", { name: "Documentation" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Submit an issue" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Keyboard Shortcuts" })).toBeVisible();
  });

  test("Keyboard Shortcuts opens the shortcuts dialog with the link row hidden", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "Help");
    await page.getByRole("menuitem", { name: "Keyboard Shortcuts" }).click();
    // The built-in help/shortcuts dialog opens…
    await expect(page.locator(".excalidraw .HelpDialog")).toBeVisible();
    // …but its documentation/blog/issue/youtube link row is suppressed.
    await expect(page.locator(".excalidraw .HelpDialog__header")).toBeHidden();
  });
});
