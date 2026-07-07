import { test, expect } from "@playwright/test";

test.describe("desktop menu bar + preferences", () => {
  test("menu bar sits above the canvas", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("menubar", { name: "Application menu" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.y).toBeLessThanOrEqual(1); // pinned to the very top
  });

  test("File menu exposes Open/Save/Export/Preferences", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "File" }).click();
    await expect(page.getByRole("menuitem", { name: "Open…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Save…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Preferences…" })).toBeVisible();
  });

  test("changing sloppiness persists across reload", async ({ page }) => {
    await page.goto("/");
    // Draw a rectangle so there is an element to restyle.
    await page.keyboard.press("r");
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(460, 420);
    await page.mouse.up();

    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await page.getByRole("radio", { name: "Cartoonist" }).check();
    await page.getByRole("button", { name: "Done" }).click();

    await page.reload();
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await expect(page.getByRole("radio", { name: "Cartoonist" })).toBeChecked();
  });

  test("Help ▸ About shows both repo links", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "Help" }).click();
    await page.getByRole("menuitem", { name: "About wimp…" }).click();
    await expect(page.getByRole("link", { name: /wimp repository/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /excalidraw fork/i })).toBeVisible();
  });
});
