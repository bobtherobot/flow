import { test, expect, type Page, type Locator } from "@playwright/test";

// Each Playwright test gets a fresh browser context, so localStorage starts
// empty — no manual clearing needed (and clearing on reload would defeat the
// persistence test below).

/** The Color Swatches panel scope, expanded if the dock started collapsed. */
async function swPanel(page: Page) {
  const panel = page
    .locator(".flow-pnl-sub", { has: page.locator(".flow-pnl-sub__title", { hasText: "Color Swatches" }) });
  if (!(await panel.locator(".flow-pnl-sub__content").isVisible())) {
    await panel.locator(".flow-pnl-sub__title").click();
  }
  await expect(panel.locator(".flow-pnl-sub__content")).toBeVisible();
  return panel;
}

/** The Color panel scope, expanded if the dock started collapsed. */
async function colorPanel(page: Page) {
  const panel = page
    .locator(".flow-pnl-sub", { has: page.locator(".flow-pnl-sub__title", { hasText: /^Color$/ }) });
  if (!(await panel.locator(".flow-pnl-sub__content").isVisible())) {
    await panel.locator(".flow-pnl-sub__title").click();
  }
  await expect(panel.locator(".flow-pnl-sub__content")).toBeVisible();
  return panel;
}

async function addSwatch(page: Page, panel: Locator, hex: string) {
  await panel.getByRole("button", { name: "Add swatch" }).click();
  const field = page.getByLabel("Swatch hex");
  await field.fill(hex);
  await field.press("Enter");
}

test("a new palette + swatch persists across reload", async ({ page }) => {
  await page.goto("/");
  const panel = await swPanel(page);
  await panel.getByRole("button", { name: "Add palette" }).click();
  await addSwatch(page, panel, "#0a0b0c");
  await expect(panel.getByRole("button", { name: "Swatch #0a0b0c" })).toBeVisible();

  await page.reload();
  // The panel's palette *selection* is local UI state (resets to the default
  // palette on mount) — it is not what's being tested here. Re-select the
  // created palette by name ("color set 1", the first auto-generated name in
  // a fresh session) to verify its swatch data survived the reload.
  const panelAfterReload = await swPanel(page);
  await panelAfterReload.getByLabel("Palette", { exact: true }).selectOption({ label: "color set 1" });
  await expect(panelAfterReload.getByRole("button", { name: "Swatch #0a0b0c" })).toBeVisible();
});

test("setting a palette default updates a color picker live", async ({ page }) => {
  await page.goto("/");
  const panel = await swPanel(page);

  // Build a distinctive palette and make it the default.
  await panel.getByRole("button", { name: "Add palette" }).click();
  await addSwatch(page, panel, "#0a0b0c");
  await panel.getByRole("button", { name: "Set as default" }).click();

  // Open the Stroke color swatch in the Color panel and check its preset grid.
  const colors = await colorPanel(page);
  await colors.getByRole("button", { name: "Stroke color", exact: true }).click();
  await expect(page.getByRole("button", { name: "#0a0b0c", exact: true })).toBeVisible();
});

test("upgrading an older install refreshes the builtins and keeps custom palettes", async ({
  page,
}) => {
  // A pre-seed-version install: stale builtins plus a palette the user made,
  // with the default pointing at the old "Default" set.
  await page.addInitScript(() => {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "d1", name: "Default", colors: ["#000000"] },
        { id: "p1", name: "Pastel", colors: ["#ffd6e0"] },
        { id: "u1", name: "Mine", colors: ["#123456"] },
      ]),
    );
    localStorage.setItem("flow.defaultPaletteId", "d1");
  });

  await page.goto("/");
  const panel = await swPanel(page);
  const select = panel.getByRole("combobox", { name: "Palette" });

  // Builtins in seed order, the user's palette carried over at the end.
  await expect(select.locator("option")).toHaveText([
    "Pastel", "Vibrant", "Pastel & Vibrant", "Earth", "Ocean", "Sunset",
    "Grayscale", "Default", "Mine",
  ]);

  // The panel opens on the default palette — now Pastel, refreshed to 20.
  await expect(
    select.locator("option:checked"),
  ).toHaveText("Pastel");
  await expect(panel.getByRole("button", { name: /^Swatch #/ })).toHaveCount(20);

  // The user's own palette is untouched.
  await select.selectOption({ label: "Mine" });
  await expect(panel.getByRole("button", { name: "Swatch #123456" })).toBeVisible();
  await expect(panel.getByRole("button", { name: /^Swatch #/ })).toHaveCount(1);
});
