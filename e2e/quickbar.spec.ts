import { test, expect } from "@playwright/test";

test.describe("quick-actions bar", () => {
  test("renders docked in the top strip, right of the main menu", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(40); // within the top strip
    // Right of the Help menu trigger.
    const help = await page.getByRole("menuitem", { name: "Help" }).boundingBox();
    expect(box!.x).toBeGreaterThan(help!.x);
  });

  test("shows actions/toggles but hides tools by default", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button", { name: "Bring to front" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Snap to objects" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Arrow binding" })).toBeVisible();
    // Tools are opt-in — scoped to the bar (the left tool rail has its own Rectangle).
    await expect(bar.getByRole("button", { name: "Rectangle" })).toHaveCount(0);
  });

  test("toggling snap-to-objects reflects the active state and persists", async ({ page }) => {
    await page.goto("/");
    const snap = page.getByRole("button", { name: "Snap to objects" });
    await expect(snap).toHaveAttribute("aria-pressed", "false");
    await snap.click();
    await expect(snap).toHaveAttribute("aria-pressed", "true");
  });

  test("arrow binding is on by default and toggles off, persisting across reload", async ({ page }) => {
    await page.goto("/");
    const binding = page.getByRole("button", { name: "Arrow binding" });
    await expect(binding).toHaveAttribute("aria-pressed", "true");
    await binding.click();
    await expect(binding).toHaveAttribute("aria-pressed", "false");

    await page.reload();
    await expect(page.getByRole("button", { name: "Arrow binding" })).toHaveAttribute("aria-pressed", "false");
  });

  test("View ▸ Show Quick Actions hides the bar and persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible();

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Quick Actions" }).click();
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toHaveCount(0);
  });

  test("the config menu adds a tool and the choice persists", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button", { name: "Rectangle" })).toHaveCount(0);

    await page.getByRole("button", { name: "Quick actions options" }).click();
    await bar.getByRole("checkbox", { name: "Rectangle" }).check();
    await expect(bar.getByRole("button", { name: "Rectangle" })).toBeVisible();

    await page.reload();
    await expect(bar.getByRole("button", { name: "Rectangle" })).toBeVisible();
  });

  test("tearing off the handle floats the bar", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    const before = await bar.boundingBox();

    const handle = page.locator(".flow-quickbar__grip");
    const h = await handle.boundingBox();
    await page.mouse.move(h!.x + h!.width / 2, h!.y + h!.height / 2);
    await page.mouse.down();
    await page.mouse.move(h!.x + 60, h!.y + 200, { steps: 8 });
    await page.mouse.up();

    const after = await bar.boundingBox();
    expect(after!.y).toBeGreaterThan(before!.y + 100); // dropped lower — now floating
  });
});
