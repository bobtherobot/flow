import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";
import { gotoApp } from "./helpers/app";

const OUT = "/tmp/claude-1000/-home-bob-projects-flow/5e8db4eb-bcda-424a-aaeb-fe2bb7d655e1/scratchpad";

async function drawWith(page: Page, toolLabel: string, x2: number, y2: number) {
  await pickTool(page, toolLabel);
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Same, but from an explicit origin — for scenes with two shapes side by side. */
async function drawFrom(
  page: Page,
  toolLabel: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  await pickTool(page, toolLabel);
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Every element's corner radius, keyed by type, straight off the live scene. */
const radiiByType = (page: Page) =>
  page.evaluate(() =>
    window.h.elements.map((e: any) => [e.type, e.cornerRadius] as [string, number | undefined]),
  );

test("arrow controls are disabled for a non-linear selection", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  await expect(page.getByRole("radio", { name: "Sharp" })).toBeDisabled();
  await expect(
    page.getByRole("radiogroup", { name: "End arrowhead" }).getByRole("radio", { name: "Triangle" }),
  ).toBeDisabled();
});

test("edits stroke width and dash style on the selected element", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await width.fill("8");
  await width.blur();
  await expect(width).toHaveValue("8");

  await page.getByRole("radio", { name: "Dashed" }).click();
  await expect(page.getByRole("radio", { name: "Dashed" })).toBeChecked();

  await page.screenshot({ path: `${OUT}/stroke-width-dash.png` });
});

test("arrowhead controls apply to an arrow", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const sharp = page.getByRole("radio", { name: "Sharp" });
  await expect(sharp).toBeEnabled();

  const endGroup = page.getByRole("radiogroup", { name: "End arrowhead" });
  await endGroup.getByRole("radio", { name: "Triangle" }).click();
  await expect(endGroup.getByRole("radio", { name: "Triangle" })).toBeChecked();

  await page.screenshot({ path: `${OUT}/arrow-triangle.png` });
});

test("arrowhead size sliders track the arrowhead state", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const startSize = page.getByRole("slider", { name: "Start arrowhead size" });
  const endSize = page.getByRole("slider", { name: "End arrowhead size" });

  // A fresh arrow has an end head but no start head.
  await expect(endSize).toBeEnabled();
  await expect(startSize).toBeDisabled();

  // Resizing the end head commits the new factor.
  await endSize.fill("10");
  await expect(endSize).toHaveValue("10");

  // Removing the end head disables its size slider…
  const endGroup = page.getByRole("radiogroup", { name: "End arrowhead" });
  await endGroup.getByRole("radio", { name: "None" }).click();
  await expect(endSize).toBeDisabled();

  // …and adding a start head enables that one.
  const startGroup = page.getByRole("radiogroup", { name: "Start arrowhead" });
  await startGroup.getByRole("radio", { name: "Triangle" }).click();
  await expect(startSize).toBeEnabled();
});

test("arrowhead size is a new-arrow tool default", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  // With nothing selected, the End size slider edits the tool default.
  await page.keyboard.press("Escape");
  const endSize = page.getByRole("slider", { name: "End arrowhead size" });
  await expect(endSize).toBeEnabled();
  await endSize.fill("10");

  // A freshly drawn arrow inherits that default.
  await drawWith(page, "Arrow", 860, 320);
  await expect(page.getByRole("slider", { name: "End arrowhead size" })).toHaveValue("10");
});

test("an arrowhead-size drag records exactly one undo entry", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Arrow", 860, 320);

  const size = page.getByRole("slider", { name: "End arrowhead size" });
  await expect(size).toBeEnabled();
  const before = await size.inputValue();

  // Drag the thumb across the track in steps, so the gesture emits many
  // intermediate values rather than a single jump. Raw page.mouse events
  // (unlike locator actions such as .click()/.fill()) don't auto-scroll, so
  // bring the slider into view before reading its box.
  await size.scrollIntoViewIfNeeded();
  const box = (await size.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.95, box.y + box.height / 2, { steps: 20 });
  await page.mouse.up();

  const after = await size.inputValue();
  expect(Number(after)).toBeGreaterThan(Number(before));

  // One undo must restore the pre-drag value: if the intermediates were each
  // captured, this would step back a single increment instead.
  await page.keyboard.press("Control+z");
  await expect(size).toHaveValue(before);
});

test("corner radius rounds a rectangle", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const radius = page.getByLabel("Corner radius", { exact: true });
  await expect(radius).toBeEnabled();
  await radius.fill("40");
  await radius.blur();
  // The field re-reads the element after blur, so 40 proves the write stuck.
  await expect(radius).toHaveValue("40");
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/corner-radius-rect.png` });
});

test("corner radius sharpens an elbow arrow's bends", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Elbow arrow", 900, 540); // diagonal so the elbow bends

  const radius = page.getByLabel("Corner radius", { exact: true });
  await expect(radius).toBeEnabled();
  await expect(radius).toHaveValue("16"); // the vendor's default elbow radius
  await radius.fill("2");
  await radius.blur();
  await expect(radius).toHaveValue("2");
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${OUT}/corner-radius-elbow.png` });
});

test("corner radius is greyed for an ellipse and with no selection", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await expect(page.getByLabel("Corner radius", { exact: true })).toBeDisabled();

  await drawWith(page, "Ellipse", 760, 480);
  await expect(page.getByLabel("Corner radius", { exact: true })).toBeDisabled();
});

test("corner radius applies across a multi-selection, skipping what it can't round", async ({
  page,
}) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawFrom(page, "Rectangle", 380, 260, 560, 380);
  await drawFrom(page, "Ellipse", 620, 260, 800, 380);
  await drawFrom(page, "Elbow arrow", 380, 460, 620, 600);
  await page.keyboard.press("Control+a");

  const radius = page.getByLabel("Corner radius", { exact: true });
  await expect(radius).toBeEnabled();
  // The three disagree (rect 0, elbow 16), so the field starts blank.
  await expect(radius).toHaveValue("");

  await radius.fill("6");
  // Tab off rather than blur: a focused number input keeps the browser's own
  // text-undo stack (lib/history-shortcuts.ts `isTextEntry`), and blurring to
  // <body> leaves the shortcut with nothing to forward it. See number-field.spec.
  await radius.press("Tab");
  await page.waitForTimeout(150);

  // Both roundable shapes took the radius; the ellipse was left alone.
  const radii = await radiiByType(page);
  expect(radii.find(([type]) => type === "rectangle")?.[1]).toBe(6);
  expect(radii.find(([type]) => type === "arrow")?.[1]).toBe(6);
  expect(radii.find(([type]) => type === "ellipse")?.[1]).toBeUndefined();

  // A second edit, so undo has a defined previous value to step back to: the
  // vendor's delta application ignores `undefined` updates, so a flow-added
  // optional prop can never be undone back to never-set.
  await radius.fill("12");
  await radius.press("Tab");
  await page.waitForTimeout(150);

  // One undo steps both shapes back together — the multi-write is a single
  // history entry, not one per element.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const undone = await radiiByType(page);
  expect(undone.find(([type]) => type === "rectangle")?.[1]).toBe(6);
  expect(undone.find(([type]) => type === "arrow")?.[1]).toBe(6);
});

test("scrubbing the stroke width field changes the value in one undo entry", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");

  // Drag up over the field: span is the 0-10 range, so 150px sweeps the lot.
  // Raw page.mouse events don't auto-scroll like locator actions do, so bring
  // the field into view before reading its box (it sits at the viewport's
  // bottom edge by default).
  await width.scrollIntoViewIfNeeded();
  const box = (await width.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 12 });
  await page.mouse.up();

  await expect(width).toHaveValue("6");
  await page.keyboard.press("Control+z");
  await expect(width).toHaveValue("2");
});
