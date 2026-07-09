import { test, expect, type Page } from "@playwright/test";

/** Draw a shape with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: tool, exact: true })
    .click();
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

test.describe("Transform panel", () => {
  test("sits above the Color panel in the dock", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    const transform = page.getByText("Transform", { exact: true });
    const color = page.getByText("Color", { exact: true });
    const t = await transform.boundingBox();
    const c = await color.boundingBox();
    expect(t).not.toBeNull();
    expect(t!.y).toBeLessThan(c!.y);
  });

  test("fields are greyed with no selection", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await expect(page.getByLabel("Width", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("Rotation", { exact: true })).toBeDisabled();
  });

  test("editing width resizes the selected element", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 760, 480);

    const width = page.getByLabel("Width", { exact: true });
    await expect(width).toBeEnabled();

    await width.fill("300");
    await width.blur();
    // The field re-reads the element after blur, so 300 proves the resize stuck.
    await expect(width).toHaveValue("300");
  });

  test("editing X moves the selected element", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 760, 480);

    const x = page.getByLabel("X position", { exact: true });
    await x.fill("420");
    await x.blur();
    await expect(x).toHaveValue("420");
  });

  test("editing rotation rotates the selected element", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 760, 480);

    const rot = page.getByLabel("Rotation", { exact: true });
    await rot.fill("45");
    await rot.blur();
    await expect(rot).toHaveValue("45");
  });

  const OUT = "/tmp/claude-1000/-home-bob-projects-flow/e7e39caa-5e76-4fc7-ae6e-ad10574ecfb0/scratchpad";

  test("corner radius rounds a rectangle", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 820, 520);

    const radius = page.getByLabel("Corner radius", { exact: true });
    await expect(radius).toBeEnabled();
    await radius.fill("40");
    await radius.blur();
    await expect(radius).toHaveValue("40");
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/corner-radius-rect.png` });
  });

  test("corner radius applies to an elbow arrow", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Elbow arrow", 900, 560); // diagonal so the elbow bends

    const radius = page.getByLabel("Corner radius", { exact: true });
    await expect(radius).toBeEnabled();
    await radius.fill("2");
    await radius.blur();
    await expect(radius).toHaveValue("2");
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/corner-radius-elbow.png` });
  });

  test("corner radius is greyed for an ellipse", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Ellipse", 760, 480);
    await expect(page.getByLabel("Corner radius", { exact: true })).toBeDisabled();
  });

  test("padding is greyed for a container without text", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 760, 480);
    await expect(page.getByLabel("Padding", { exact: true })).toBeDisabled();
  });

  test("padding rewraps a container's bound text", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    await draw(page, "Rectangle", 900, 520);
    // The container is selected after drawing; Enter adds a bound-text label.
    await page.keyboard.press("Enter");
    await page.keyboard.type("The quick brown fox jumps over the lazy dog");
    await page.keyboard.press("Escape");

    const padding = page.getByLabel("Padding", { exact: true });
    await expect(padding).toBeEnabled();
    await padding.fill("70");
    await padding.blur();
    await expect(padding).toHaveValue("70");
    await page.waitForTimeout(150);
    await page.screenshot({ path: `${OUT}/padding-text.png` });
  });

  test("width is greyed for a text element", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".flow-pnl");
    // Draw a text element, then commit it with Escape so it stays selected.
    await page
      .getByRole("toolbar", { name: "Tools" })
      .getByRole("button", { name: "Text", exact: true })
      .click();
    await page.mouse.click(600, 360);
    await page.keyboard.type("hi");
    await page.keyboard.press("Escape");

    await expect(page.getByLabel("Width", { exact: true })).toBeDisabled();
    await expect(page.getByLabel("X position", { exact: true })).toBeEnabled();
  });
});
