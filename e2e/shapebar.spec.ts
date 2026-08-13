import { test, expect, type Locator, type Page } from "@playwright/test";
import { railButton } from "./helpers/rails";

/**
 * Move to a locator's bounding-box centre and drag by mouse, rather than
 * Playwright's `.hover()` + drag pattern: the grip glyph is
 * `pointer-events: none` (drags fall through to the topbar's own drag
 * surface), which makes `.hover()`'s actionability check spin forever
 * waiting for the grip itself to receive pointer events.
 */
async function dragGrip(page: Page, grip: Locator, toX: number, toY: number) {
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 10 });
  await page.mouse.up();
}

test.describe("shapebar", () => {
  test("docks to the right of the toolbar, below the menu bar", async ({ page }) => {
    await page.goto("/");
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
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();
    const reserved = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved"),
    );
    expect(reserved.trim()).toBe("124px");
  });

  test("holds the shape tools and selects them", async ({ page }) => {
    await page.goto("/");
    const rect = railButton(page, "Rectangle");
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
    // The toolbar must not also carry it.
    await expect(
      page.getByRole("toolbar", { name: "Tools" }).getByRole("button", { name: "Rectangle", exact: true }),
    ).toHaveCount(0);
  });

  test("slides to the screen edge when the toolbar is hidden", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    expect(s.x).toBeLessThan(5);
  });

  test("tears off and re-docks into its own slot", async ({ page }) => {
    await page.goto("/");
    const shapes = page.getByRole("toolbar", { name: "Shapes" });
    const grip = shapes.locator(".flow-toolbar__grip");

    await dragGrip(page, grip, 500, 320);
    let box = (await shapes.boundingBox())!;
    expect(box.x).toBeGreaterThan(200);

    // Dropping near its slot (x≈44, to the right of the docked toolbar) re-docks
    // it — the reason shouldRedock takes the slot rather than testing x < 10.
    await dragGrip(page, grip, 46, 60);
    box = (await shapes.boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(box.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides from its own hamburger and persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("menuitem", { name: "Hide shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);
    // The toolbar is untouched by the shapebar's own key.
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
  });

  test("View ▸ Show Shapebar brings it back and Reset Layout re-docks it", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toHaveCount(0);

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Shapebar" }).click();
    await expect(page.getByRole("toolbar", { name: "Shapes" })).toBeVisible();

    // Float it, then let Reset Layout put it back in its slot.
    const grip = page.getByRole("toolbar", { name: "Shapes" }).locator(".flow-toolbar__grip");
    await dragGrip(page, grip, 600, 400);

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Reset Layout" }).click();
    const s = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
    const t = (await page.getByRole("toolbar", { name: "Tools" }).boundingBox())!;
    expect(Math.round(s.x)).toBe(Math.round(t.x + t.width));
  });

  test("hides one shape from its hamburger without touching the toolbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Shapebar options" }).click();
    await page.getByRole("checkbox", { name: "Diamond" }).uncheck();
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await page.reload();
    await expect(railButton(page, "Diamond")).toHaveCount(0);
    await expect(railButton(page, "Rectangle")).toBeVisible();
  });
});
