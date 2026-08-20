import { test, expect, type Page } from "@playwright/test";
import { pickTool } from "./helpers/rails";
import { openMenu } from "./helpers/menu";

/** Draw a rectangle at a fixed spot (bounds ≈ x[560,820] y[320,500]); leaves it
 *  selected. Mirrors the color-panel helper (native tool island is CSS-hidden). */
async function drawRectangle(page: Page) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 8 });
  await page.mouse.up();
}

/** Drag a marquee (selection rectangle) between two empty-canvas points. */
async function marquee(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Switch to the Selection tool. flow keeps the drawing tool active after a
 *  draw (permanent tool lock), so a subsequent click/drag meant to select or
 *  deselect — rather than draw another shape — must switch tools explicitly. */
async function pickSelection(page: Page) {
  await pickTool(page, "Selection");
}

async function setSelectionMode(page: Page, label: "marquee touch" | "marquee enclose") {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await page.getByRole("radio", { name: label }).click();
  await page.getByRole("button", { name: "Done" }).click();
}

// The Transform panel's Width field is enabled only when a single element is
// selected — a clean DOM signal for "did the marquee select the rectangle?".
test("marquee touch selects an element the rectangle only intersects", async ({ page }) => {
  await page.goto("/");
  await setSelectionMode(page, "marquee touch");

  await drawRectangle(page);
  // flow keeps Rectangle active after the draw (permanent tool lock), so
  // reaching Selection for the click/marquee below must be explicit.
  await pickSelection(page);
  await page.mouse.click(300, 250); // click empty canvas to deselect
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toBeDisabled();

  // Marquee clips only the rect's top-left corner (intersect, not enclose).
  await marquee(page, 480, 260, 620, 380);
  await expect(width).toBeEnabled();
});

test("marquee enclose ignores a mere intersect but selects a full enclosure", async ({ page }) => {
  await page.goto("/"); // default mode = enclose

  await drawRectangle(page);
  // flow keeps Rectangle active after the draw (permanent tool lock); without
  // this, the "empty canvas" click/marquees below would draw more rectangles
  // instead of selecting or deselecting.
  await pickSelection(page);
  await page.mouse.click(300, 250); // click empty canvas to deselect
  const width = page.getByRole("spinbutton", { name: "Width", exact: true });
  await expect(width).toBeDisabled();

  // Same corner-clipping marquee: enclose must NOT select.
  await marquee(page, 480, 260, 620, 380);
  await expect(width).toBeDisabled();

  // A marquee that fully contains the rect selects in every mode (sanity).
  await marquee(page, 480, 260, 900, 560);
  await expect(width).toBeEnabled();
});
