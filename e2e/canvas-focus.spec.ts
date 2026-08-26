import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";
import { gotoApp } from "./helpers/app";

/**
 * Regression coverage for the canvas-focus-return fix (src/lib/focus-canvas.ts).
 *
 * Excalidraw binds keydown to its own container, not the document
 * (`handleKeyboardGlobally` is off — see .claude/memory/pending-followups.md),
 * and flow's chrome (toolbar/quickbar/bottombar/panels) is a DOM sibling. Before
 * this fix, clicking any chrome button — or committing a panel number field
 * with Enter — left keyboard focus stranded on that control, so the very next
 * Ctrl+Z (or Escape, Delete, an arrow-key nudge) silently did nothing until the
 * user happened to click the canvas again.
 *
 * These specs deliberately do NOT click the canvas between the chrome
 * interaction and the shortcut — that gap is exactly what the bug lived in,
 * and clicking around it would prove nothing.
 */

async function drawRect(page: Page, x2: number, y2: number) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

const elementCount = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          h?: { app?: { scene?: { getNonDeletedElements: () => unknown[] } } };
        }
      ).h?.app?.scene?.getNonDeletedElements().length ?? -1,
  );

const firstElementStrokeWidth = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          h?: { app?: { scene?: { getNonDeletedElements: () => { strokeWidth?: number }[] } } };
        }
      ).h?.app?.scene?.getNonDeletedElements()[0]?.strokeWidth,
  );

test("Ctrl+Z undoes a draw right after clicking the Selection tool", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  await drawRect(page, 760, 480);
  await expect.poll(() => elementCount(page)).toBe(1);

  // The regression: clicking a rail button used to strand keyboard focus on
  // the button itself, so the Ctrl+Z below reached nothing.
  await pickTool(page, "Selection");
  await page.keyboard.press("Control+z");

  await expect.poll(() => elementCount(page)).toBe(0);
});

test("Ctrl+Z undoes a panel number-field edit committed with Enter", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  await drawRect(page, 820, 500);
  const width = page.getByLabel("Stroke width");
  await expect(width).toHaveValue("2");
  expect(await firstElementStrokeWidth(page)).toBe(2);

  await width.fill("9");
  await width.press("Enter");
  await expect(width).toHaveValue("9");
  expect(await firstElementStrokeWidth(page)).toBe(9);

  // No Tab, no canvas click in between — Enter's own commit must have handed
  // focus back to the canvas for this to reach it.
  //
  // Asserted against the raw scene element, not the field's own display:
  // holding Ctrl also engages flow's temporary tool override (see
  // src/ui/toolbar/useToolOverride.ts), which restores the pre-Ctrl tool on
  // release and, as an unrelated side effect, deselects the element — after
  // which the field falls back to displaying the *default* stroke width. That
  // default happens to equal the pre-edit value here, which would make a
  // field-value assertion pass whether or not undo actually ran.
  await page.keyboard.press("Control+z");

  await expect.poll(() => firstElementStrokeWidth(page)).toBe(2);
});

test("Tab still moves focus between number fields instead of jumping to the canvas", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");

  await drawRect(page, 760, 480);
  const widthField = page.getByLabel("Width", { exact: true });
  const heightField = page.getByLabel("Height", { exact: true });

  await widthField.fill("150");
  await widthField.press("Tab");

  // Blur must never be treated like Enter: focus goes to the next field the
  // browser's own Tab order picks, not to the canvas.
  await expect(heightField).toBeFocused();
});
