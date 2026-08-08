import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function addText(page: Page, text: string) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 380);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

/**
 * Draw a rectangle and give it a bound-text label. Double-clicking a hollow
 * shape's interior would make a FREE text element instead, so the label goes on
 * with Enter while the freshly drawn container is still selected.
 */
async function addLabelledBox(
  page: Page,
  text: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

/** Every container's stored padding, in scene order. */
const containerPaddings = (page: Page) =>
  page.evaluate(() =>
    window.h.elements
      .filter((e: any) => e.type === "rectangle")
      .map((e: any) => e.padding as number | undefined),
  );

test("text controls are disabled without a text selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 6 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "Font family" })).toBeDisabled();
  await expect(page.getByRole("radio", { name: "Large", exact: true })).toBeDisabled();
});

test("edits font size, align and family on a text element", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await addText(page, "Flow");

  // Controls become enabled once a text element is selected.
  const fontTrigger = page.getByRole("button", { name: "Font family" });
  await expect(fontTrigger).toBeEnabled();

  await page.getByRole("radio", { name: "Extra large" }).click();
  await expect(page.getByRole("radio", { name: "Extra large" })).toBeChecked();

  await page.getByRole("radio", { name: "Align center" }).click();
  await expect(page.getByRole("radio", { name: "Align center" })).toBeChecked();

  await fontTrigger.click();
  await page.getByRole("option", { name: "Comic Shanns" }).click();
  await expect(fontTrigger).toHaveText(/Comic Shanns/);

  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/text-panel.png` });
});

test("font-size field reflects a preset, and a custom value deselects presets", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await addText(page, "Flow");

  const field = page.getByRole("spinbutton", { name: "Font size value" });
  const xl = page.getByRole("radio", { name: "Extra large" });

  // Clicking a preset drives the numeric field.
  await xl.click();
  await expect(xl).toBeChecked();
  await expect(field).toHaveValue("36");

  // Typing a custom (off-preset) value deselects every S/M/L/XL preset.
  await field.fill("24");
  await field.blur();
  await expect(field).toHaveValue("24");
  await expect(xl).not.toBeChecked();
  await expect(page.getByRole("radio", { name: "Medium", exact: true })).not.toBeChecked();
});

test("changing size recenters text bound to a container (no resize needed)", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // A rectangle with bound (container) text.
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(820, 460, { steps: 8 });
  await page.mouse.up();
  // flow keeps Rectangle active after the draw above (permanent tool lock),
  // but double-click-to-add-bound-text only fires when Selection is active
  // (the vendor's handleCanvasDoubleClick bails otherwise) — switch first.
  await page.getByRole("button", { name: "Selection" }).click();
  await page.mouse.dblclick(690, 380);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Selection" }).click();
  await page.mouse.click(690, 380);

  const read = () =>
    page.evaluate(() => {
      const t = window.h.elements.find((e: any) => e.type === "text" && e.containerId);
      const c = window.h.elements.find((e: any) => e.type === "rectangle");
      return {
        h: Math.round(t.height),
        textMid: Math.round(t.y + t.height / 2),
        boxMid: Math.round(c.y + c.height / 2),
      };
    });

  const before = await read();
  expect(before.textMid).toBe(before.boxMid); // centered to start

  await page.getByRole("spinbutton", { name: "Font size value" }).fill("36");
  await page.getByRole("spinbutton", { name: "Font size value" }).blur();
  await page.waitForTimeout(200);

  const after = await read();
  expect(after.h).toBeGreaterThan(before.h); // bounding box recomputed for the bigger font
  expect(after.textMid).toBe(after.boxMid); // still centered — the bug was it drifting off-center
});

test("changing font family recenters text bound to a container", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 300);
  await page.mouse.down();
  await page.mouse.move(820, 460, { steps: 8 });
  await page.mouse.up();
  // flow keeps Rectangle active after the draw above (permanent tool lock),
  // but double-click-to-add-bound-text only fires when Selection is active
  // (the vendor's handleCanvasDoubleClick bails otherwise) — switch first.
  await page.getByRole("button", { name: "Selection" }).click();
  await page.mouse.dblclick(690, 380);
  await page.keyboard.type("Hi");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Selection" }).click();
  await page.mouse.click(690, 380);

  const read = () =>
    page.evaluate(() => {
      const t = window.h.elements.find((e: any) => e.type === "text" && e.containerId);
      const c = window.h.elements.find((e: any) => e.type === "rectangle");
      return {
        lineHeight: t.lineHeight,
        textMid: Math.round(t.y + t.height / 2),
        boxMid: Math.round(c.y + c.height / 2),
      };
    });

  const before = await read();
  await page.getByRole("button", { name: "Font family" }).click();
  await page.getByRole("option", { name: "Lilita One" }).click();
  await page.waitForTimeout(500); // async font load + redraw

  const after = await read();
  expect(after.lineHeight).not.toBe(before.lineHeight); // metrics recomputed for the new font
  expect(after.textMid).toBe(after.boxMid); // still centered
});

test("padding is greyed without a labelled container", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await expect(page.getByLabel("Padding", { exact: true })).toBeDisabled();

  // A bare container has no bound text to pad…
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByLabel("Padding", { exact: true })).toBeDisabled();

  // …and free text has no container.
  await addText(page, "Flow");
  await expect(page.getByLabel("Padding", { exact: true })).toBeDisabled();
});

test("padding rewraps a container's bound text", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await addLabelledBox(page, "The quick brown fox jumps over the lazy dog", 560, 300, 900, 520);

  const height = () =>
    page.evaluate(
      () => window.h.elements.find((e: any) => e.type === "text" && e.containerId)!.height,
    );
  const before = await height();

  const padding = page.getByLabel("Padding", { exact: true });
  await expect(padding).toBeEnabled();
  await expect(padding).toHaveValue("5"); // the vendor default
  await padding.fill("70");
  await padding.blur();
  await expect(padding).toHaveValue("70");
  await page.waitForTimeout(150);

  // Narrower wrap width ⇒ more lines ⇒ a taller text element.
  expect(await height()).toBeGreaterThan(before);
  await page.screenshot({ path: `${OUT}/padding-text.png` });
});

test("padding applies to every labelled container in a multi-selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await addLabelledBox(page, "First label here", 340, 260, 620, 420);
  await addLabelledBox(page, "Second label here", 700, 260, 980, 420);
  await page.keyboard.press("Control+a");

  const padding = page.getByLabel("Padding", { exact: true });
  await expect(padding).toBeEnabled();
  await padding.fill("30");
  // Tab off rather than blur, so the undo shortcut lands on a control the dock
  // forwards from (see number-field.spec / lib/history-shortcuts.ts).
  await padding.press("Tab");
  await page.waitForTimeout(150);
  expect(await containerPaddings(page)).toEqual([30, 30]);

  await padding.fill("45");
  await padding.press("Tab");
  await page.waitForTimeout(150);
  expect(await containerPaddings(page)).toEqual([45, 45]);

  // One undo steps both containers back together — the multi-write is a single
  // history entry, not one per container. (It steps back to 30 rather than
  // clearing the property: Excalidraw's delta application ignores `undefined`
  // updates, so no flow-added optional prop can be undone back to never-set.)
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  expect(await containerPaddings(page)).toEqual([30, 30]);
});
