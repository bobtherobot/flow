import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./helpers/app";

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
  await gotoApp(page);
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
  await gotoApp(page);
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
  await gotoApp(page);
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
  await gotoApp(page);
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
  // Escape now leaves the container selected (vendor App.tsx: flow decoupled
  // "keep the edited object selected" from the permanent tool lock). This used
  // to need a Selection-tool click plus a canvas click to get the container
  // selected again; both are not just redundant now but harmful — clicking the
  // bound text of an ALREADY-selected container opens the text editor, which
  // greys out every panel control this test then reads.

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
  await gotoApp(page);
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
  // Escape now leaves the container selected (vendor App.tsx: flow decoupled
  // "keep the edited object selected" from the permanent tool lock). This used
  // to need a Selection-tool click plus a canvas click to get the container
  // selected again; both are not just redundant now but harmful — clicking the
  // bound text of an ALREADY-selected container opens the text editor, which
  // greys out every panel control this test then reads.

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
  await gotoApp(page);
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
  await gotoApp(page);
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
  await gotoApp(page);
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

test("vertical align is greyed unless the text sits inside a shape", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  const top = page.getByRole("radio", { name: "Align text top" });
  await expect(top).toBeDisabled();

  // A bare container holds no text to align… (drawn clear of where `addText`
  // clicks, so the text below lands as a FREE element rather than its label)
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(340, 240);
  await page.mouse.down();
  await page.mouse.move(500, 340, { steps: 6 });
  await page.mouse.up();
  await expect(top).toBeDisabled();

  // …and free text has no box to align within, even though the horizontal
  // align control right above it is live.
  await addText(page, "Flow");
  await expect(page.getByRole("radio", { name: "Align center" })).toBeEnabled();
  await expect(top).toBeDisabled();
});

test("vertical align moves a container's label within its box", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await addLabelledBox(page, "Hi", 560, 300, 900, 520);

  const read = () =>
    page.evaluate(() => {
      const t = window.h.elements.find((e: any) => e.type === "text" && e.containerId)!;
      const c = window.h.elements.find((e: any) => e.type === "rectangle")!;
      return {
        align: t.verticalAlign as string,
        textTop: Math.round(t.y),
        textMid: Math.round(t.y + t.height / 2),
        boxTop: Math.round(c.y),
        boxMid: Math.round(c.y + c.height / 2),
        boxBottom: Math.round(c.y + c.height),
      };
    });

  const middle = page.getByRole("radio", { name: "Align text middle" });
  const top = page.getByRole("radio", { name: "Align text top" });
  const bottom = page.getByRole("radio", { name: "Align text bottom" });

  // A label starts centred, and the control reflects that.
  await expect(middle).toBeChecked();
  const before = await read();
  expect(before.textMid).toBe(before.boxMid);

  await top.click();
  await expect(top).toBeChecked();
  await page.waitForTimeout(150);
  const atTop = await read();
  expect(atTop.align).toBe("top");
  expect(atTop.textMid).toBeLessThan(atTop.boxMid);
  expect(atTop.textTop).toBeGreaterThanOrEqual(atTop.boxTop);

  await bottom.click();
  await expect(bottom).toBeChecked();
  await page.waitForTimeout(150);
  const atBottom = await read();
  expect(atBottom.align).toBe("bottom");
  expect(atBottom.textMid).toBeGreaterThan(atBottom.boxMid);
  expect(atBottom.textMid).toBeLessThan(atBottom.boxBottom);

  // Undo returns the label to where it was, i.e. the write was captured.
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  expect((await read()).align).toBe("top");
});

test("line height respaces a free text element and resizes its box", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 380);
  await page.keyboard.type("one\ntwo\nthree");
  await page.keyboard.press("Escape");

  const read = () =>
    page.evaluate(() => {
      const t = window.h.elements.find((e: any) => e.type === "text")!;
      return { lineHeight: t.lineHeight as number, height: t.height as number, width: t.width as number };
    });

  const field = page.getByRole("spinbutton", { name: "Line height value" });
  const before = await read();
  // The font's own line height is the starting value, and it is off-preset.
  expect(before.lineHeight).toBeGreaterThan(1);
  await expect(page.getByRole("radio", { name: "Double spacing" })).not.toBeChecked();
  await expect(field).toHaveValue(String(before.lineHeight));

  await page.getByRole("radio", { name: "Double spacing" }).click();
  await expect(page.getByRole("radio", { name: "Double spacing" })).toBeChecked();
  await expect(field).toHaveValue("2");
  await page.waitForTimeout(150);

  const after = await read();
  expect(after.lineHeight).toBe(2);
  // 3 lines × 20px × 2 — vendor's own getTextHeight, and the width is untouched
  // because line height cannot change where the text wraps.
  expect(Math.round(after.height)).toBe(Math.round(3 * 20 * 2));
  expect(after.width).toBe(before.width);

  // A typed off-preset value commits and unlights the preset.
  await field.fill("1.35");
  await field.blur();
  await page.waitForTimeout(150);
  expect((await read()).lineHeight).toBeCloseTo(1.35, 5);
  await expect(page.getByRole("radio", { name: "Double spacing" })).not.toBeChecked();

  // One undo per commit — the preset click and the typed value are separate.
  //
  // Focus first: flow forwards Ctrl+Z from a keydown raised INSIDE the dock
  // (PanelsRoot's onKeyDown), and committing a field blurs it to <body>, which
  // is a sibling of both the dock and Excalidraw's container — so a bare
  // Ctrl+Z straight after a typed commit reaches no handler at all. That gap is
  // pre-existing and affects every panel number field (verified on Padding),
  // not something line height introduced; this focus() is what a user's next
  // click would do anyway.
  await page.getByRole("radio", { name: "Single spacing" }).focus();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(150);
  expect((await read()).lineHeight).toBe(2);
});

test("line height reflows a container's label and grows the box to fit", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  // Deliberately short: at the font's default spacing the wrapped label just
  // fits, so doubling it MUST push the container taller.
  await addLabelledBox(page, "The quick brown fox jumps over the lazy dog", 560, 300, 900, 370);

  const read = () =>
    page.evaluate(() => {
      const t = window.h.elements.find((e: any) => e.type === "text" && e.containerId)!;
      const c = window.h.elements.find((e: any) => e.type === "rectangle")!;
      return {
        lineHeight: t.lineHeight as number,
        lines: (t.text as string).split("\n").length,
        textHeight: t.height as number,
        boxHeight: c.height as number,
        textMid: Math.round(t.y + t.height / 2),
        boxMid: Math.round(c.y + c.height / 2),
      };
    });

  const before = await read();
  expect(before.lines).toBeGreaterThan(1); // it wraps, so spacing is visible

  await page.getByRole("radio", { name: "Double spacing" }).click();
  await page.waitForTimeout(200);

  const after = await read();
  expect(after.lineHeight).toBe(2);
  expect(after.lines).toBe(before.lines); // wrap width is unchanged
  expect(after.textHeight).toBeGreaterThan(before.textHeight);
  // The label no longer fits, so the container grew — and it stays centred.
  expect(after.boxHeight).toBeGreaterThan(before.boxHeight);
  expect(after.boxHeight).toBeGreaterThanOrEqual(after.textHeight);
  expect(after.textMid).toBe(after.boxMid);
});

test("line height applies to every selected text element in one undo step", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await addLabelledBox(page, "First label here", 340, 260, 620, 400);
  await addLabelledBox(page, "Second label here", 700, 260, 980, 400);
  await page.keyboard.press("Control+a");

  const lineHeights = () =>
    page.evaluate(() =>
      window.h.elements
        .filter((e: any) => e.type === "text")
        .map((e: any) => e.lineHeight as number),
    );

  await page.getByRole("radio", { name: "Single spacing" }).click();
  await page.waitForTimeout(200);
  expect(await lineHeights()).toEqual([1, 1]);

  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const undone = await lineHeights();
  expect(undone.every((lh) => lh !== 1)).toBe(true);
});

/** A three-line free text element, selected, plus a reader for its metrics. */
async function addThreeLineText(page: Page) {
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 380);
  await page.keyboard.type("one\ntwo\nthree");
  await page.keyboard.press("Escape");
}

const textMetrics = (page: Page) =>
  page.evaluate(() => {
    const t = window.h.elements.find((e: any) => e.type === "text")!;
    return {
      fontFamily: t.fontFamily as number,
      lineHeight: t.lineHeight as number,
      height: Math.round(t.height as number),
    };
  });

test("a chosen line height survives a font change, in one undo step", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await addThreeLineText(page);

  await page.getByRole("radio", { name: "Double spacing" }).click();
  await page.waitForTimeout(150);
  const chosen = await textMetrics(page);
  expect(chosen.lineHeight).toBe(2);

  // Lilita One's own line height is 1.15 — so if vendor's reset went through
  // unopposed, this would land on 1.15 rather than the 2 the user picked.
  await page.getByRole("button", { name: "Font family" }).click();
  await page.getByRole("option", { name: "Lilita One" }).click();
  await page.waitForTimeout(600); // async font load + vendor's deferred redraw

  const after = await textMetrics(page);
  expect(after.fontFamily).not.toBe(chosen.fontFamily);
  expect(after.lineHeight).toBe(2);
  // The geometry agrees with the restored value, not the reset one: the async
  // redraw re-reads the element from the scene, so it measures 2, not 1.15.
  expect(after.height).toBe(3 * 20 * 2);
  await expect(page.getByRole("radio", { name: "Double spacing" })).toBeChecked();

  // The restore rides along in the font change's own history entry, so a single
  // undo returns both — measured, not assumed.
  await page.getByRole("radio", { name: "Single spacing" }).focus();
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(250);
  const undone = await textMetrics(page);
  expect(undone.fontFamily).toBe(chosen.fontFamily);
  expect(undone.lineHeight).toBe(2);
});

test("text that never had a chosen line height still adopts the new font's", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await addThreeLineText(page);

  const before = await textMetrics(page);
  expect(before.lineHeight).toBe(1.25); // Nunito's own

  await page.getByRole("button", { name: "Font family" }).click();
  await page.getByRole("option", { name: "Lilita One" }).click();
  await page.waitForTimeout(600);

  // Lilita One's metric, untouched by flow — preserving 1.25 here would mean
  // flow had overridden vendor's per-font spacing for everyone, not just for
  // users who chose a line height.
  const after = await textMetrics(page);
  expect(after.lineHeight).toBe(1.15);
  expect(after.height).toBe(Math.round(3 * 20 * 1.15));
  await expect(page.getByRole("spinbutton", { name: "Line height value" })).toHaveValue("1.15");
});
