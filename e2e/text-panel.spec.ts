import { test, expect, type Page } from "@playwright/test";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function addText(page: Page, text: string) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 380);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
}

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
