import { test, expect, type Page } from "@playwright/test";

/**
 * The shared panel number field (src/ui/panels/controls/NumberInput.tsx), driven
 * through its browser-native half: the spin buttons. They are shadow DOM that
 * jsdom does not render at all, so a real browser is the only place these can be
 * pressed — and the engines differ enough that this spec runs on Firefox too
 * (see playwright.config.ts). Firefox reports a spin step as an InputEvent with
 * inputType "insertReplacementText", indistinguishable from typing to the check
 * that originally shipped, which left Firefox's buttons moving the digits and
 * nothing else.
 */

async function drawWith(page: Page, toolLabel: string, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: toolLabel, exact: true })
    .click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** A point on the spin buttons. Measured from the field's right edge, they span
 *  7-21px in Chromium and 7-24px in Firefox, so 14 is comfortably inside both. */
async function spinnerAt(page: Page, field: ReturnType<Page["getByLabel"]>, dir: "up" | "down") {
  await field.scrollIntoViewIfNeeded();
  const box = (await field.boundingBox())!;
  // Firefox only paints the buttons while the field is hovered; hover first so
  // the press lands on a control that is actually there.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  return { x: box.x + box.width - 14, y: box.y + box.height * (dir === "up" ? 0.25 : 0.75) };
}

/** The drawn element's stroke width, read from the live scene through
 *  Excalidraw's test hook — the field's own digits can't prove the element
 *  changed, since a spinner that only moved the digits would look identical. */
function elementStrokeWidth(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { h?: { elements?: { strokeWidth?: number }[] } }).h
        ?.elements?.[0]?.strokeWidth,
  );
}

test("a spin-button click writes through to the selected element", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");
  expect(await elementStrokeWidth(page)).toBe(2);

  const up = await spinnerAt(page, width, "up");
  await page.mouse.click(up.x, up.y);

  // The element itself moved, with no blur or Enter in between — this is what
  // the native buttons used to fail to do.
  await expect(width).toHaveValue("3");
  await expect.poll(() => elementStrokeWidth(page)).toBe(3);
});

test("holding a spin button batches its auto-repeat into one undo entry", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");

  const up = await spinnerAt(page, width, "up");
  await page.mouse.move(up.x, up.y);
  await page.mouse.down();
  await page.waitForTimeout(1200); // the browser auto-repeats while held
  await page.mouse.up();

  const held = await elementStrokeWidth(page);
  expect(held).toBeGreaterThan(3); // several steps landed, not just one

  // Tab off the field before undoing: a focused number input keeps the
  // browser's own text-undo stack (lib/history-shortcuts.ts `isTextEntry`), so
  // the shortcut only reaches the canvas from a non-text control. Blurring
  // re-commits the same value, which is a no-op and adds no history entry.
  await width.press("Tab");
  await page.keyboard.press("Control+z");

  // One undo restores the pre-gesture value: had each repeat been captured,
  // this would step back a single 1px increment instead.
  await expect(width).toHaveValue("2");
  await expect.poll(() => elementStrokeWidth(page)).toBe(2);
});

test("the field body still scrubs beside the spin buttons", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawWith(page, "Rectangle", 820, 500);

  const width = page.getByLabel("Stroke width");
  await width.scrollIntoViewIfNeeded();
  const box = (await width.boundingBox())!;

  // Press at the field's left end, clear of the buttons, and drag up.
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 8, box.y + box.height / 2 - 60, { steps: 12 });
  await page.mouse.up();

  await expect(width).toHaveValue("6");
});
