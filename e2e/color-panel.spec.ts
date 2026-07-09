import { test, expect, type Page } from "@playwright/test";

/** Draw a rectangle (right of the docked panel) — leaves it selected. Clicks
 *  flow's tool rail button (the native tool island is hidden via CSS). */
async function drawRectangle(page: Page) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 8 });
  await page.mouse.up();
}

/** Sample the on-canvas RGBA at a viewport point (largest canvas = the scene). */
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([px, py]) => {
      const canvases = [...document.querySelectorAll("canvas")] as HTMLCanvasElement[];
      const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      const rect = c.getBoundingClientRect();
      const cx = Math.round((px - rect.left) * (c.width / rect.width));
      const cy = Math.round((py - rect.top) * (c.height / rect.height));
      const d = c.getContext("2d")!.getImageData(cx, cy, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    },
    [x, y],
  );
}

test("edits the selected element's stroke color and opacity", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRectangle(page);

  const strokeSwatch = page.getByRole("button", { name: "Stroke color", exact: true });
  await expect(strokeSwatch).toHaveAttribute("title", "#1e1e1e");

  await strokeSwatch.click();
  await page.getByRole("button", { name: "#e03131" }).click();
  await expect(strokeSwatch).toHaveAttribute("title", "#e03131");

  await page.locator(".flow-pnl__title").click(); // close the picker
  const opacity = page.getByLabel("Stroke opacity value");
  await opacity.fill("50");
  await opacity.blur();
  await expect(opacity).toHaveValue("50");
});

test("per-swatch opacity renders as a semi-transparent fill", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRectangle(page);

  await page.getByRole("button", { name: "Fill color", exact: true }).click();
  await page.getByRole("button", { name: "#e03131" }).click();
  await page.locator(".flow-pnl__title").click();
  await page.getByLabel("Fill opacity value").fill("50");
  await page.getByLabel("Fill opacity value").blur();
  await page.waitForTimeout(250);

  // #e03131 (224,49,49) at 50% over white ≈ (239,152,152). Full opacity would
  // leave green/blue near 49, so a mid-range green proves the alpha blend.
  const [r, g, b] = await pixelAt(page, 690, 410);
  expect(r).toBeGreaterThan(200);
  expect(g).toBeGreaterThan(110);
  expect(g).toBeLessThan(200);
  expect(Math.abs(g - b)).toBeLessThan(30);
});

test("text color is disabled without text in the selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRectangle(page); // a rectangle, no text
  await expect(page.getByRole("button", { name: "Text color", exact: true })).toBeDisabled();
});

test("a color edit is undoable via Excalidraw's history", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRectangle(page);

  const strokeSwatch = page.getByRole("button", { name: "Stroke color", exact: true });
  await strokeSwatch.click();
  await page.getByRole("button", { name: "#2f9e44" }).click();
  await expect(strokeSwatch).toHaveAttribute("title", "#2f9e44");
  await page.locator(".flow-pnl__title").click(); // close the picker

  // The Undo button is no longer covered by the panel; the rect stays selected so
  // the swatch reflects the reverted element (proving the write recorded history).
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(strokeSwatch).toHaveAttribute("title", "#1e1e1e");
});

test("laser color round-trips through the global swatch", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const laserSwatch = page.getByRole("button", { name: "Laser color", exact: true });
  await expect(laserSwatch).toHaveAttribute("title", "#ff0000"); // default

  await laserSwatch.click();
  await page.getByRole("button", { name: "#e03131" }).click();
  await page.locator(".flow-pnl__title").click(); // close the picker
  await expect(laserSwatch).toHaveAttribute("title", "#e03131");
});

test("the laser trail renders in the chosen color", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // Pick a laser color.
  await page.getByRole("button", { name: "Laser color", exact: true }).click();
  await page.getByRole("button", { name: "#2f9e44" }).click();
  await page.locator(".flow-pnl__title").click();

  // Activate the laser tool and drag (right of the docked panel).
  await page.getByRole("button", { name: "Laser pointer" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 12 });

  // While the trail is live, its SVG path fill is the chosen color.
  await page.waitForFunction(() => {
    const p = document.querySelector(".SVGLayer svg path");
    return p?.getAttribute("fill") === "#2f9e44";
  }, { timeout: 2000 });

  await page.mouse.up();
});
