import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";

/** Draw a shape with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x2: number, y2: number) {
  await pickTool(page, tool);
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Force the scene's elements to a 0 stroke width while leaving the tool
 *  default alone, via the vendor's `window.h` test hook. Setting 0 through the
 *  panel would drift `currentItemStrokeWidth` to 0 as well, and then a paste
 *  that wrongly re-applied the default would still land on 0 and prove nothing. */
async function forceZeroStrokeWidth(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { h: { elements: Array<Record<string, unknown>> } };
    w.h.elements = w.h.elements.map((el) => ({ ...el, strokeWidth: 0 }));
  });
  await page.waitForTimeout(150);
}

/** Copy the selection, then replay the exact payload through the `paste` event
 *  Excalidraw listens for. Chromium's Ctrl+V under Playwright does not deliver
 *  clipboard contents, so pressing it alone silently pastes nothing. */
async function copyAndPaste(page: Page) {
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(250);
  const payload = await page.evaluate(() => navigator.clipboard.readText());
  await page.evaluate((text: string) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, payload);
  await page.waitForTimeout(400);
  return payload;
}

function strokeWidths(page: Page) {
  return page.evaluate(() =>
    (window as unknown as { h: { elements: Array<{ strokeWidth: number }> } }).h.elements.map(
      (el) => el.strokeWidth,
    ),
  );
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

test("a zero stroke width paints no outline at all", async ({ page }) => {
  // The other half of the same fork edit: canvas ignores a non-positive
  // lineWidth and keeps the previous draw's value, so a 0-width element would
  // paint a stray hairline in whatever width the last element used. Drawing a
  // 10px shape first makes that failure loud.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 700, 420);
  const width = page.getByLabel("Stroke width");
  await width.fill("10");
  await width.blur();

  await draw(page, "Ellipse", 1000, 620);
  await width.fill("0");
  await width.blur();
  await page.keyboard.press("Escape");
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );

  // Sample down the middle of the 0-width ellipse, crossing where its top and
  // bottom outline would be. Every pixel must be canvas background.
  const painted = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll("canvas")] as HTMLCanvasElement[];
    const c = canvases.sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const rect = c.getBoundingClientRect();
    const ctx = c.getContext("2d")!;
    const hits: string[] = [];
    for (let y = 430; y <= 620; y += 5) {
      const cx = Math.round((780 - rect.left) * (c.width / rect.width));
      const cy = Math.round((y - rect.top) * (c.height / rect.height));
      const d = ctx.getImageData(cx, cy, 1, 1).data;
      if (d[0] < 240 || d[1] < 240 || d[2] < 240) hits.push(`y=${y} rgb(${d[0]},${d[1]},${d[2]})`);
    }
    return hits;
  });
  expect(painted).toEqual([]);
});

test("a zero stroke width does not break a curved arrow", async ({ page }) => {
  // Regression: flow maps a 0 stroke width to roughjs's `stroke: "none"` (so
  // canvas doesn't keep the previous draw's lineWidth and paint a hairline).
  // roughjs's `curve()` — unlike `linearPath()` — pushes NO path set at all
  // when the stroke is "none", so a curved arrow's Drawable came back with an
  // empty `sets`. `getCurvePathOps` reads `shape.sets[0].ops` unguarded, so
  // drawing one threw "Cannot read properties of undefined (reading 'ops')"
  // out of the render loop, and every bounds/hit-test path that derives its
  // geometry from that Drawable would have collapsed to Infinity.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await draw(page, "Rectangle", 760, 480);

  const width = page.getByLabel("Stroke width");
  await width.fill("0");
  await width.blur();
  await expect(width).toHaveValue("0");

  // The 0 width drifts into the tool defaults, so the arrow inherits it.
  await pickTool(page, "Curved arrow");
  await page.mouse.move(300, 250);
  await page.mouse.down();
  await page.mouse.move(460, 420, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  expect(errors).toEqual([]);

  // The throw is the observable here — it aborts the render loop, so the
  // downstream geometry damage never gets a chance to show. Assert the arrow
  // was really created at the drawn extent, so a future regression that
  // silently drops the element instead of throwing still fails this test.
  const arrow = await page.evaluate(() => {
    const w = window as unknown as {
      h: { elements: Array<{ type: string; width: number; height: number }> };
    };
    const el = w.h.elements.find((e) => e.type === "arrow");
    return el && { width: Math.round(el.width), height: Math.round(el.height) };
  });
  expect(arrow).toEqual({ width: 160, height: 170 });
});

/** A flow-authored document carrying a 0-width shape. */
const ZERO_WIDTH_DOC = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "flow-e2e",
  elements: [
    {
      id: "zero-width-rect",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 140,
      angle: 0,
      strokeColor: "#1e1e1e",
      backgroundColor: "#e03131",
      fillStyle: "solid",
      strokeWidth: 0,
      strokeStyle: "solid",
      roughness: 0,
      opacity: 100,
      groupIds: [],
      frameId: null,
      index: "a0",
      roundness: null,
      seed: 1,
      version: 10,
      versionNonce: 1,
      isDeleted: false,
      boundElements: null,
      updated: 1,
      link: null,
      locked: false,
    },
  ],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
});

test("copy/paste preserves a 0 stroke width", async ({ page, context }) => {
  // Regression: `restoreElement` used `element.strokeWidth || DEFAULT_ELEMENT_PROPS
  // .strokeWidth`, and 0 is falsy — so a legitimate 0 was read as "missing" and
  // replaced by 2. Unreachable upstream (Excalidraw's own picker offers 1/2/4),
  // but flow's slider starts at 0. Every sibling field on that object uses `??`.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", 760, 480);
  await forceZeroStrokeWidth(page);
  expect(await strokeWidths(page)).toEqual([0]);

  const payload = await copyAndPaste(page);

  // The copy side was never at fault — prove it stays that way.
  expect(payload).toContain('"strokeWidth":0');
  expect(await strokeWidths(page)).toEqual([0, 0]);
});

test("opening a document preserves a 0 stroke width", async ({ page }) => {
  // Same `restoreElement` line, reached through the file-open path: a saved flow
  // document with a 0-width shape silently came back at 2.
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Open…" }).click();
  await page.getByRole("radio", { name: "Local system" }).check();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (await chooser).setFiles({
    name: "zero.excalidraw",
    mimeType: "application/json",
    buffer: Buffer.from(ZERO_WIDTH_DOC),
  });

  await expect.poll(() => strokeWidths(page)).toEqual([0]);
});
