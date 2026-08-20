import { test, expect } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";

test.describe("quick-actions bar", () => {
  test("renders docked in the top strip, right of the main menu", async ({ page }) => {
    await gotoApp(page);
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
    await gotoApp(page);
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button", { name: "Bring to front" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Snap to objects" })).toBeVisible();
    await expect(bar.getByRole("button", { name: "Arrow binding" })).toBeVisible();
    // Tools are opt-in — scoped to the bar (the left tool rail has its own Rectangle).
    await expect(bar.getByRole("button", { name: "Rectangle" })).toHaveCount(0);
  });

  test("snap-to-objects is on by default and toggles off", async ({ page }) => {
    await gotoApp(page);
    // flow defaults object-snapping ON (seeded via initialData.appState).
    const snap = page.getByRole("button", { name: "Snap to objects" });
    await expect(snap).toHaveAttribute("aria-pressed", "true");
    await snap.click();
    await expect(snap).toHaveAttribute("aria-pressed", "false");
  });

  test("arrow binding is on by default and toggles off, persisting across reload", async ({ page }) => {
    await gotoApp(page);
    const binding = page.getByRole("button", { name: "Arrow binding" });
    await expect(binding).toHaveAttribute("aria-pressed", "true");
    await binding.click();
    await expect(binding).toHaveAttribute("aria-pressed", "false");

    await reloadApp(page);
    await expect(page.getByRole("button", { name: "Arrow binding" })).toHaveAttribute("aria-pressed", "false");
  });

  test("View ▸ Show Quick Actions hides the bar and persists", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toBeVisible();

    await openMenu(page, "View");
    await page.getByRole("menuitemcheckbox", { name: "Show Quick Actions" }).click();
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toHaveCount(0);

    await reloadApp(page);
    await expect(page.getByRole("toolbar", { name: "Quick actions" })).toHaveCount(0);
  });

  test("the config menu adds a tool and the choice persists", async ({ page }) => {
    await gotoApp(page);
    const bar = page.getByRole("toolbar", { name: "Quick actions" });
    await expect(bar.getByRole("button", { name: "Rectangle" })).toHaveCount(0);

    await page.getByRole("button", { name: "Quick actions options" }).click();
    await bar.getByRole("checkbox", { name: "Rectangle" }).check();
    await expect(bar.getByRole("button", { name: "Rectangle" })).toBeVisible();

    await reloadApp(page);
    await expect(bar.getByRole("button", { name: "Rectangle" })).toBeVisible();
  });

  // Finding 6 of the final review: TOOL_ITEMS (actions.ts) used to drop
  // `toolType`/`flowShape` when deriving quickbar items from ALL_TOOLS, so
  // triggering a flow shape's quickbar button called
  // `setActiveTool({ type: "triangle" })` -- not a real Excalidraw tool type,
  // since every flow shape shares the vendor's "rectangle" tool and differs
  // only by the `currentItemFlowShape` kind stamped into appState -- which
  // armed an inert tool that drew nothing. Enabling "Triangle" from the
  // config menu and drawing with it must produce a real, stamped rectangle,
  // the same as picking it from the shapebar would.
  test("enabling a flow shape from the config menu draws the real shape", async ({ page }) => {
    await gotoApp(page);
    const bar = page.getByRole("toolbar", { name: "Quick actions" });

    await page.getByRole("button", { name: "Quick actions options" }).click();
    await bar.getByRole("checkbox", { name: "Triangle" }).check();
    const triangleBtn = bar.getByRole("button", { name: "Triangle" });
    await expect(triangleBtn).toBeVisible();

    await triangleBtn.click();
    await page.mouse.move(400, 200);
    await page.mouse.down();
    await page.mouse.move(700, 400, { steps: 8 });
    await page.mouse.up();

    const stamped = await page.evaluate(() => {
      const el = (window as any).h.app.scene.getNonDeletedElements().at(-1);
      return { type: el.type, kind: el.customData?.flowShape?.kind };
    });
    expect(stamped).toEqual({ type: "rectangle", kind: "triangle" });
  });

  test("tearing off the handle floats the bar", async ({ page }) => {
    await gotoApp(page);
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
