import { test, expect, type Page } from "@playwright/test";

/** Draw a rectangle by dragging; leaves it selected. */
async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

/**
 * Give the fill a real saturation/value before touching hue.
 *
 * A fresh rectangle's fill is "transparent", which the draft seeds as
 * HSV {h:0, s:0, v:0} — fully achromatic. HSL lightness is `v * (1 - s/2)`,
 * which has no hue term at all, and HSL hue is conventionally reported as 0
 * whenever saturation is 0. So a hue-only edit on an achromatic color is
 * invisible in *every* downstream field (Lightness never moves, and the Hue
 * number doesn't even round-trip) — not just the "black" edge case, but any
 * color with s=0. Every test below that drags the hue slider seeds a real
 * saturation first so the edit has somewhere to show up.
 */
async function seedSaturation(page: Page) {
  const box = (await page.locator(panel).getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
}

const panel = ".flow-clr-panel";
const popup = '[role="dialog"][aria-label="Color picker"]';

test("the dock has exactly one color panel", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await expect(page.getByRole("radiogroup", { name: "Color target" }).first()).toBeVisible();
  await expect(page.locator(".flow-clr-panel")).toHaveCount(1);
  await expect(page.getByText("Color Swatches")).toHaveCount(0);
});

test("the panel follows the selection and writes back", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const lightness = page.locator(panel).getByLabel("Lightness");
  await expect(lightness).toHaveValue("0"); // transparent fill seeds achromatic black

  await seedSaturation(page);
  await expect(lightness).not.toHaveValue("0");

  // The picker's own draft state moving is not proof the write landed on the
  // selected element — confirm the scene actually received it.
  const bg = await page.evaluate(() => (window as any).h.elements.at(-1).backgroundColor);
  expect(bg).not.toBe("transparent");
});

test("switching part retargets the picker", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const fillL = await page.locator(panel).getByLabel("Lightness").inputValue();
  await page.locator(panel).getByRole("radio", { name: /Stroke/ }).click();
  await expect(page.locator(panel).getByLabel("Lightness")).not.toHaveValue(fillL);
});

test("a hue slider drag is a single undo step", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);
  await seedSaturation(page);

  const hueField = page.locator(panel).getByRole("spinbutton", { name: "Hue" });
  await expect(hueField).toHaveValue("0");

  const hue = page.locator(panel).getByRole("slider", { name: "Hue" });
  const box = (await hue.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(hueField).not.toHaveValue("0");

  await page.keyboard.press("Control+z");
  await expect(hueField).toHaveValue("0");
});

/**
 * Carry-forward from the plan: flow's own `deferred-commit.ts` keeps a
 * module-global `pending` flag that can strand `true` and let a later,
 * unrelated write skip the uncommitted-element filter — which merges it into
 * the previous undo entry instead of recording its own. A single
 * drag-then-undo (the test above) cannot tell "one gesture, one entry" apart
 * from "a leaked flag ate one of two entries" — both look like one restore.
 * This asserts step counts across a sequence of ordinary, non-transient
 * edits instead: three distinct color picks must take three distinct
 * undos to unwind, each landing on the exact intermediate color, not a
 * neighbour.
 */
test("a sequence of distinct edits produces the same number of undo steps", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const lightness = page.locator(panel).getByLabel("Lightness");
  const fillRadio = page.locator(panel).getByRole("radio", { name: /^Fill/ });
  await expect(fillRadio).toHaveAttribute("aria-label", "Fill, none");

  await page.locator(panel).getByRole("button", { name: "White" }).click();
  await expect(lightness).toHaveValue("100");

  await page.locator(panel).getByRole("button", { name: "Grey" }).click();
  await expect(lightness).toHaveValue("50");

  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  await expect(lightness).toHaveValue("0");
  // Black (#000000) and the original transparent fill both read Lightness 0,
  // so the aria-label's ", none" suffix is what tells "reverted all the way"
  // apart from "stopped one edit short" in the final assertion below.
  await expect(fillRadio).toHaveAttribute("aria-label", "Fill");

  await page.keyboard.press("Control+z");
  await expect(lightness).toHaveValue("50"); // back to Grey, not further

  await page.keyboard.press("Control+z");
  await expect(lightness).toHaveValue("100"); // back to White, not further

  await page.keyboard.press("Control+z");
  await expect(fillRadio).toHaveAttribute("aria-label", "Fill, none"); // back to the original, exactly
});

test("none on stroke zeroes the width and a color revives it", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("radio", { name: /Stroke/ }).click();
  await page.locator(panel).getByRole("button", { name: "None" }).click();
  await expect(page.getByLabel("Stroke width")).toHaveValue("0");

  await page.locator(panel).getByRole("button", { name: "Grey" }).click();
  await expect(page.getByLabel("Stroke width")).toHaveValue("1");
});

test("swap exchanges fill and stroke", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const lightness = page.locator(panel).getByLabel("Lightness");
  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  await expect(lightness).toHaveValue("0");
  const fillL = await lightness.inputValue();

  await page.locator(panel).getByRole("button", { name: "Swap fill and stroke" }).click();
  await expect(lightness).not.toHaveValue(fillL);
});

test("the rail popup and the panel stay in step", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);
  await seedSaturation(page);

  const hueField = page.locator(panel).getByRole("spinbutton", { name: "Hue" });
  await expect(hueField).toHaveValue("0");

  const railFill = page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ });
  await railFill.click();
  await expect(page.locator(popup)).toBeVisible();

  await page.locator(popup).getByRole("slider", { name: "Hue" }).click({ position: { x: 150, y: 7 } });
  await expect(hueField).not.toHaveValue("0");

  await page.keyboard.press("Escape");
  await expect(page.locator(popup)).toHaveCount(0);
});

test("recents accumulate and survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  await page.locator(panel).getByRole("button", { name: "White" }).click();

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #ffffff" })).toBeVisible();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #000000" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #ffffff" })).toBeVisible();
});

test("selecting text collapses the chooser to the text part", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // `exact: true`: without it, "Text" also substring-matches the Text
  // sub-panel's always-rendered "Close Text" collapse button, and Playwright
  // refuses the click as ambiguous.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 340);
  await page.keyboard.type("hello");
  await page.keyboard.press("Escape");

  const radios = page.locator(panel).getByRole("radio");
  await expect(radios).toHaveCount(1);
  await expect(radios.first()).toHaveAccessibleName(/Text/);
});

/**
 * Carry-forward from the plan: jsdom never fires `blur` on unmount, so
 * `PaletteSection`'s `abandonRename` guard (color.tsx / PaletteSection.tsx)
 * has no unit test that can fail — Escape sets the flag, the input unmounts,
 * and jsdom simply never raises the blur that would (wrongly) commit the
 * edit if the flag were ignored. Real Chromium does fire it, so this is the
 * only place this behaviour can actually be exercised.
 */
test("Escape abandons an in-progress palette rename", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const select = page.locator(panel).getByLabel("Palette", { exact: true });
  const originalName = (await select.locator("option:checked").textContent()) ?? "";

  await select.dblclick();
  const nameInput = page.locator(panel).getByLabel("Palette name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Changed Name XYZ");
  await page.keyboard.press("Escape");

  await expect(select).toBeVisible();
  await expect(select.locator("option:checked")).toHaveText(originalName);
});

test("adding the current color to a palette persists", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);
  await page.locator(panel).getByRole("button", { name: "Black" }).click();

  await page.locator(panel).getByRole("button", { name: "Add current color to palette" }).click();
  await expect(page.locator(panel).getByRole("button", { name: "Swatch #000000" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await expect(page.locator(panel).getByRole("button", { name: "Swatch #000000" })).toBeVisible();
});

// --- rail geometry, transferred from Task 15 ---
//
// Task 15 widened the rail 48 -> 88px. Two of its four required running-app
// checks were never performed as browser interactions (unit-level assertions
// on `shouldRedock` were substituted twice), so they land here instead, where
// Playwright makes them durable and re-runnable rather than a one-shot
// measurement. These exercise PRE-EXISTING rail behavior at the new width.

test("the rail's outer edge meets the canvas with no overlap or gap", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  const rail = (await page.locator(".flow-toolbar").boundingBox())!;
  const canvasLeft = await page.evaluate(
    () => getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved"),
  );
  // The rail carries a 1px border; without box-sizing: border-box its outer
  // box was 89 against an 88px reserved gutter, and it painted over the
  // canvas's leftmost pixel.
  expect(Math.round(rail.x + rail.width)).toBe(parseInt(canvasLeft, 10));
});

test("the rail tears off and redocks at the new width", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-toolbar");
  // The grip glyph, not the whole `.flow-toolbar__topbar` header: the topbar
  // is a vertical flex column with the hamburger button directly beneath the
  // grip, and the header's own bounding-box centre falls inside that button
  // — a drag started there is silently rejected (`useDrag`'s `onStart`
  // bails out of any press that starts on a `button`).
  const grip = page.locator(".flow-toolbar__grip");

  const start = (await grip.boundingBox())!;
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + 320, start.y + 160, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".flow-toolbar--floating")).toBeVisible();

  const floated = (await grip.boundingBox())!;
  await page.mouse.move(floated.x + floated.width / 2, floated.y + floated.height / 2);
  await page.mouse.down();
  await page.mouse.move(4, 120, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator(".flow-toolbar--docked")).toBeVisible();
});

test("hiding the rail reclaims the canvas gutter", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-toolbar");
  const reserved = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved").trim(),
    );

  expect(await reserved()).toBe("88px");
  await page.getByRole("button", { name: "Toolbar options" }).click();
  await page.getByRole("menuitem", { name: /hide/i }).click();
  await expect(page.locator(".flow-toolbar")).toHaveCount(0);
  expect(await reserved()).toBe("0px");
});
