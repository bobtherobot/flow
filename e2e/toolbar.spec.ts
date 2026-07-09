import { test, expect } from "@playwright/test";

test.describe("vertical tool bar", () => {
  test("renders docked on the left, below the menu bar", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(5); // flush to the left edge
    expect(box!.y).toBeGreaterThanOrEqual(30); // below the 36px menu bar
  });

  test("selecting a tool marks it active", async ({ page }) => {
    await page.goto("/");
    const rect = page.getByRole("button", { name: "Rectangle" });
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
  });

  test("each of the three arrow-shape tools activates the arrow tool", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    for (const name of ["Arrow", "Curved arrow", "Elbow arrow"]) {
      const btn = rail.getByRole("button", { name, exact: true });
      await btn.click();
      // Only the clicked shape is highlighted (they share the "arrow" tool).
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("pressing A repeatedly cycles the highlighted arrow shape and wraps", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const sharp = rail.getByRole("button", { name: "Arrow", exact: true });
    const curved = rail.getByRole("button", { name: "Curved arrow" });
    const elbow = rail.getByRole("button", { name: "Elbow arrow" });

    // Excalidraw's shortcut handler is bound to the canvas container, so focus it
    // with a harmless selection-tool click before driving the keyboard cycle.
    await page.locator("canvas.interactive").first().click({ position: { x: 200, y: 200 } });

    // First A selects the arrow tool (default shape is round); each further A
    // advances round → elbow → sharp → round (native Excalidraw cycle).
    await page.keyboard.press("a");
    await expect(curved).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(elbow).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(sharp).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(curved).toHaveAttribute("aria-pressed", "true"); // wrapped back
  });

  test("View ▸ Show Toolbar hides the rail and persists across reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
  });

  test("the hamburger hides a tool and the choice persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Frame" })).toBeVisible();

    await page.getByRole("button", { name: "Toolbar options" }).click();
    await page.getByRole("checkbox", { name: "Frame" }).uncheck();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);
  });

  test("tearing off the top bar floats the rail", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const before = await rail.boundingBox();

    // Drag from the grip at the top of the header (above the hamburger button).
    const grip = page.locator(".flow-toolbar__grip");
    const g = await grip.boundingBox();
    await page.mouse.move(g!.x + g!.width / 2, g!.y + g!.height / 2);
    await page.mouse.down();
    await page.mouse.move(g!.x + 220, g!.y + 160, { steps: 8 });
    await page.mouse.up();

    const after = await rail.boundingBox();
    expect(after!.x).toBeGreaterThan(before!.x + 100); // moved right, now floating
  });

  test("View ▸ Reset Layout re-docks the rail and wipes its drag memory", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });

    // Detach and drag the rail far to the right.
    const grip = page.locator(".flow-toolbar__grip");
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + 400, g.y + 200, { steps: 10 });
    await page.mouse.up();
    expect((await rail.boundingBox())!.x).toBeGreaterThan(300);

    // Reset Layout → docked back at the left edge.
    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitem", { name: "Reset Layout" }).click();
    expect((await rail.boundingBox())!.x).toBeLessThan(10);

    // Detaching again starts from the default spot, not the old far-right one.
    await page.getByRole("button", { name: "Toolbar options" }).click();
    await page.getByRole("menuitem", { name: "Detach toolbar" }).click();
    expect((await rail.boundingBox())!.x).toBeLessThan(50);
  });
});
