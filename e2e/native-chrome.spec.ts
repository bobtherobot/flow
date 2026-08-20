import { test, expect } from "@playwright/test";
import { gotoApp } from "./helpers/app";

/** Excalidraw swaps to its mobile layout below ~1024px of editor width and
 *  renders a second bottom chrome (`.App-bottom-bar` wrapping
 *  `footer.App-toolbar`) that the desktop `.App-menu_bottom` hide never covered.
 *  flow owns the bottom bar, so neither layout may show the native one. */
test.describe("native Excalidraw chrome stays hidden", () => {
  for (const width of [1440, 900]) {
    test(`no native bottom bar at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await gotoApp(page);
      await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

      await expect(page.locator(".excalidraw .App-bottom-bar")).toBeHidden();
      await expect(page.locator(".excalidraw footer.App-toolbar")).toBeHidden();

      // flow's own bottom bar is unaffected.
      await expect(page.getByRole("button", { name: "Canvas background" })).toBeVisible();
    });
  }
});
