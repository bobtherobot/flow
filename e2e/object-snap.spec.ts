import { test, expect, type Page } from "@playwright/test";

// flow overrides Excalidraw's stock default (object-snapping off) to ON, seeded
// via initialData.appState.objectsSnapModeEnabled. Read the live value through
// Excalidraw's test hook; optional-chain so a read before the App's
// componentDidMount defines the getter returns undefined (poll retries) instead
// of throwing — same mount-race guard as the grid-size spec.
function readObjectsSnap(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
        .h?.state?.objectsSnapModeEnabled,
  );
}

test("object-snapping is enabled by default", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await expect.poll(() => readObjectsSnap(page)).toBe(true);
});
