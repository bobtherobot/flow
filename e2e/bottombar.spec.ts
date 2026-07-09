import { test, expect } from "@playwright/test";

test.describe("bottom bar", () => {
  test("renders docked at the bottom-left", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Bottom bar" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    const vp = page.viewportSize()!;
    expect(box).not.toBeNull();
    // Near the bottom edge and near the left edge.
    expect(box!.y + box!.height).toBeGreaterThan(vp.height - 80);
    expect(box!.x).toBeLessThan(vp.width / 2);
  });

  test("shows grid, zen, zoom, background and search", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Bottom bar" });
    await expect(bar.getByRole("button", { name: "Toggle grid" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Zen mode" })).toBeVisible();
    await expect(bar.getByRole("group", { name: "Zoom" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Canvas background" })).toBeVisible();
    await expect(bar.getByRole("searchbox", { name: "Search canvas" })).toBeVisible();
  });

  test("hides Excalidraw's native bottom-left footer (zoom relocated)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".excalidraw .App-menu_bottom")).toBeHidden();
  });

  test("toggling grid reflects the active state", async ({ page }) => {
    await page.goto("/");
    // Scope to the bottom bar — the quick-actions bar has a same-named toggle.
    const grid = page.getByRole("toolbar", { name: "Bottom bar" }).getByRole("button", { name: "Toggle grid" });
    await expect(grid).toHaveAttribute("aria-pressed", "false");
    await grid.click();
    await expect(grid).toHaveAttribute("aria-pressed", "true");
  });

  test("zoom cluster changes the percentage and resets", async ({ page }) => {
    await page.goto("/");
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    const reset = page.getByRole("button", { name: /Zoom \d+%/ });
    await expect(reset).toHaveText("100%");
    await zoomIn.click();
    await expect(reset).not.toHaveText("100%");
    await reset.click();
    await expect(reset).toHaveText("100%");
  });

  test("changing the canvas background updates the swatch", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Canvas background" }).click();
    // Pick a preset from the popover (ColorSwatch grid).
    await page.getByRole("button", { name: "#e03131" }).first().click();
    // Swatch reflects the chosen color.
    await expect(page.getByRole("button", { name: "Canvas background" })).toHaveAttribute(
      "title",
      "#e03131",
    );
  });

  test("executing a search opens the flow Search sub-panel with the query", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await page.getByRole("searchbox", { name: "Search canvas", exact: true }).fill("hello");
    await page.getByRole("button", { name: "Run search" }).click();

    // The flow-native Search sub-panel opens in the controls dock, pre-filled.
    const panel = page.locator(".flow-search-panel");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("searchbox", { name: "Search canvas text" })).toHaveValue("hello");
    // No canvas text → "No matches"; the native Excalidraw sidebar stays hidden.
    await expect(panel.getByText("No matches")).toBeVisible();
    await expect(page.locator(".excalidraw .default-sidebar")).toBeHidden();
  });

  test("View ▸ Show Bottom Bar hides the bar and persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Bottom bar" })).toBeVisible();

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Bottom Bar" }).click();
    await expect(page.getByRole("toolbar", { name: "Bottom bar" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Bottom bar" })).toHaveCount(0);
  });

  test("the config menu hides an item and the choice persists", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Bottom bar" });
    await expect(bar.getByRole("button", { name: "Zen mode" })).toBeVisible();

    await page.getByRole("button", { name: "Bottom bar options" }).click();
    await page.getByRole("checkbox", { name: "Zen mode" }).uncheck();
    await expect(bar.getByRole("button", { name: "Zen mode" })).toHaveCount(0);

    await page.reload();
    await expect(bar.getByRole("button", { name: "Zen mode" })).toHaveCount(0);
  });

  test("tearing off the handle floats the bar", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Bottom bar" });
    const before = await bar.boundingBox();

    const handle = page.locator(".flow-bottombar__grip");
    const h = await handle.boundingBox();
    await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
    await page.mouse.down();
    await page.mouse.move(h!.x + 40, h!.y - 200, { steps: 8 });
    await page.mouse.up();

    const after = await bar.boundingBox();
    expect(after!.y).toBeLessThan(before!.y - 100); // lifted up — now floating
  });
});
