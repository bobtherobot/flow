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

test("a fresh rectangle has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  // Excalidraw ships currentItemRoundness "round" → an adaptive 32px radius.
  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("a fresh diamond has square corners", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Diamond", 760, 480);

  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("0");
});

test("the Transform panel still rounds a shape on demand", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("16");
  await radius.blur();
  await expect(radius).toHaveValue("16");
});

test("the stroke width field spans 0 to 10px", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveAttribute("min", "0");
  await expect(width).toHaveAttribute("max", "10");
  await expect(page.getByRole("slider", { name: "Stroke width" })).toHaveCount(0);
});

test("a zero stroke width still floors the cross-hatch fill instead of leaving the shape empty", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  // A plain rectangle has a transparent background, so roughjs never invokes
  // a filler at all and the hachureGap floor below would never be exercised.
  // flow's Color panel has a Fill *color* control but no fill-*style* control
  // (DEFAULT_ELEMENT_PROPS.fillStyle is "solid"), so drive both through the
  // vendor's `window.h` test hook (wired up by createTestHook() in the fork's
  // App.tsx, active in dev/test builds) to force a real cross-hatch fill.
  await page.evaluate(() => {
    const w = window as unknown as { h: { elements: Array<Record<string, unknown>> } };
    w.h.elements = w.h.elements.map((el) =>
      el.type === "rectangle"
        ? { ...el, backgroundColor: "#e03131", fillStyle: "cross-hatch", roughness: 0 }
        : el,
    );
  });

  const width = page.getByLabel("Stroke width");
  await width.fill("0");
  await width.blur();
  await expect(width).toHaveValue("0");

  // Without the `fillBase = Math.max(strokeWidth, 1)` floor, `hachureGap:
  // strokeWidth * 4` collapses to 0 for a 0-width element. roughjs's default
  // (non-random-jitter) scan step draws a row only when `iteration % gap ===
  // 0`; for the resulting floating-point gap of 0.1 that integer modulo is
  // essentially never exactly 0, so the shape paints almost no fill lines at
  // all instead of a normal cross-hatch pattern. Sample a grid inside the
  // shape's interior and require a healthy fraction of hits on the fill
  // color, proving real fill lines painted rather than a near-empty box.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const { hits, total } = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")] as HTMLCanvasElement[];
    const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const rect = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    let hits = 0;
    let total = 0;
    for (let x = 570; x <= 750; x += 4) {
      for (let y = 350; y <= 470; y += 4) {
        const cx = Math.round((x - rect.left) * (c.width / rect.width));
        const cy = Math.round((y - rect.top) * (c.height / rect.height));
        const d = ctx.getImageData(cx, cy, 1, 1).data;
        total++;
        // fill color #e03131 -> rgb(224,49,49); the canvas background is white.
        if (d[0] > 180 && d[1] < 120 && d[2] < 120) hits++;
      }
    }
    return { hits, total };
  });

  expect(hits / total).toBeGreaterThan(0.05);
});
