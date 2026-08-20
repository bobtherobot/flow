import { test, expect } from "@playwright/test";
import { railButton, dragGrip } from "./helpers/rails";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";

test.describe("shapebar", () => {
  test("docks to the right of the toolbar, below the menu bar", async ({ page }) => {
    await gotoApp(page);
    const tools = page.getByRole("toolbar", { name: "Tools" });
    const shapes = page.getByRole("toolbar", { name: "Shapes" });
    await expect(shapes).toBeVisible();

    const t = (await tools.boundingBox())!;
    const s = (await shapes.boundingBox())!;
    expect(Math.round(s.x)).toBe(Math.round(t.x + t.width)); // flush, no gap
    expect(Math.round(s.width)).toBe(80);
    expect(s.y).toBeGreaterThanOrEqual(30);
  });

  test("insets the canvas by both rail widths", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();
    const reserved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved"),
    );
    expect(reserved.trim()).toBe("124px");
  });

  test("holds the shape tools and selects them", async ({ page }) => {
    await gotoApp(page);
    const rect = railButton(page, "Rectangle");
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
    // The toolbar must not also carry it.
    await expect(
      page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Rectangle", exact: true }),
    ).toHaveCount(0);
  });

  test("slides to the screen edge when the toolbar is hidden", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "View");
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    expect(s.x).toBeLessThan(5);
  });

  test("tears off and re-docks into its own slot", async ({ page }) => {
    await gotoApp(page);
    const shapes = page.getByRole("toolbar", { name: "Shapes" });

    await dragGrip(page, shapes, 500, 320);
    let box = (await shapes.boundingBox())!;
    expect(box.x).toBeGreaterThan(200);

    // Dropping near its slot (x≈44, to the right of the docked toolbar) re-docks
    // it — the reason shouldRedock takes the slot rather than testing x < 10.
    await dragGrip(page, shapes, 46, 60);
    box = (await shapes.boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(box.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides from its own hamburger and persists across reload", async ({ page }) => {
    await gotoApp(page);
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("menuitem", { name: "Hide shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    await reloadApp(page);
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    // The toolbar is untouched by the shapebar's own key.
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  });

  test("View ▸ Show Shapebar brings it back and Reset Layout re-docks it", async ({ page }) => {
    await gotoApp(page);
    await openMenu(page, "View");
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);

    await openMenu(page, "View");
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();

    // Float it, then let Reset Layout put it back in its slot.
    await dragGrip(page, page.getByRole("toolbar", { name: "Shapes" }), 600, 400);

    await openMenu(page, "View");
    await page.getByRole("menuitem", { name: "Reset Layout" }).click();
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(s.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides one shape from its hamburger without touching the toolbar", async ({ page }) => {
    await gotoApp(page);
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("checkbox", { name: "Diamond" }).uncheck();
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await reloadApp(page);
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await expect(railButton(page, "Rectangle")).toBeVisible();
  });
});
