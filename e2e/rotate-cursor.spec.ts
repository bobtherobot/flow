import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./helpers/app";

/**
 * The rotation transform handle shows flow's circular-arrow cursor instead of
 * Excalidraw's grabber hand.
 *
 * The mechanism spans two halves that can only be tested together: vendor's
 * `getCursorForResizingElement` returns `var(--flow-rotate-cursor, grab)` for
 * the "rotation" handle (a one-line fork edit), and flow's `index.css` defines
 * that variable as an inlined SVG. Reading the *computed* cursor proves the
 * whole chain resolved — the inline style alone would only show the `var()`.
 */

const canvasCursor = (page: Page) =>
  page.evaluate(
    () =>
      getComputedStyle(
        document.querySelector(".excalidraw__canvas.interactive") as HTMLElement,
      ).cursor,
  );

/** A rectangle from (500,300) to (800,460), left selected under the Selection tool. */
async function drawBox(page: Page) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(500, 300);
  await page.mouse.down();
  await page.mouse.move(800, 460, { steps: 8 });
  await page.mouse.up();
  // flow's permanent tool lock keeps Rectangle armed after a draw, so the next
  // press would start a second box rather than grab a handle.
  await page.getByRole("button", { name: "Selection" }).click();
}

// flow moved the rotation handle off the top edge and out past the NE corner,
// so quick-arrow affordances can hug the bounds without fighting it for the
// same pixels (see docs/superpowers/specs/2026-08-25-quick-arrows-design.md).
// For a box of (500,300)-(800,460) at zoom 1 the handle rect is
// [808, 284, 8, 8], so its centre is (812, 288).
const ROTATE_HANDLE = { x: 812, y: 288 };

// The exact centre of where the rotation handle used to be: the pre-fix rect
// was [646,280]-[654,288]. Revert the fork edit and this point gets the rotate
// cursor again, so this assertion genuinely catches a lost rebase — unlike a
// point merely "somewhere above the top edge", which passes either way.
//
// This point is ALSO where Task 4's top quick arrow will sit ([641,274]-[659,286]),
// and that collision is the whole reason the handle moved. Task 4 owns
// converting this assertion when the overlay lands and starts intercepting the
// pointermove that sets the canvas cursor.
const OLD_ROTATE_SPOT = { x: 650, y: 284 };

test("the rotation handle sits outside the NE corner, not above the top edge", async ({
  page,
}) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawBox(page);

  await page.mouse.move(ROTATE_HANDLE.x, ROTATE_HANDLE.y);
  await expect.poll(() => canvasCursor(page)).toContain("data:image/svg+xml");

  await page.mouse.move(OLD_ROTATE_SPOT.x, OLD_ROTATE_SPOT.y);
  await expect.poll(() => canvasCursor(page)).not.toContain("data:image/svg+xml");
});

test("the rotation handle shows a circular-arrow cursor, and keeps it while rotating", async ({
  page,
}) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawBox(page);

  // The neighbouring bands are the vendor's own, so a pass here can't come from
  // the cursor having been globally replaced.
  await page.mouse.move(650, 380); // inside the box
  await expect.poll(() => canvasCursor(page)).toBe("move");
  await page.mouse.move(650, 296); // the n-resize band just above the edge
  await expect.poll(() => canvasCursor(page)).toBe("ns-resize");

  await page.mouse.move(ROTATE_HANDLE.x, ROTATE_HANDLE.y);
  await expect.poll(() => canvasCursor(page)).toContain("data:image/svg+xml");

  // It must survive the drag too — the cursor set on hover is the one the whole
  // rotation gesture keeps, and reverting to a hand mid-rotate would be worse
  // than never changing it.
  await page.mouse.down();
  await page.mouse.move(860, 320, { steps: 6 });
  expect(await canvasCursor(page)).toContain("data:image/svg+xml");
  await page.mouse.up();
  expect(await page.evaluate(() => window.h.elements[0].angle)).not.toBe(0);
});

test("the inlined cursor SVG actually decodes", async ({ page }) => {
  await gotoApp(page);
  // A computed `url(...)` only proves the variable resolved; a malformed or
  // under-encoded data URI would still read back fine here and then silently
  // leave the browser with no cursor image at all.
  const decoded = await page.evaluate(async () => {
    const url = getComputedStyle(document.documentElement)
      .getPropertyValue("--flow-rotate-cursor")
      .match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!url) return { ok: false as const, reason: "variable not defined" };
    const img = new Image();
    img.src = url;
    await img.decode();
    return { ok: true as const, width: img.naturalWidth, height: img.naturalHeight };
  });
  expect(decoded).toEqual({ ok: true, width: 32, height: 32 });
});

test("panning still uses the vendor grabber hand", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawBox(page);

  // This is why the cursor could not be swapped from CSS alone. App writes the
  // cursor as an INLINE style, so the only stylesheet hook is an attribute
  // substring match — and `[style*="cursor: grab"]` also matches `grabbing`,
  // which is what a middle-button pan sets. A CSS-only override would have
  // replaced the pan cursor too.
  await page.mouse.move(650, 600);
  await page.mouse.down({ button: "middle" });
  await page.mouse.move(700, 620, { steps: 4 });
  const panning = await canvasCursor(page);
  await page.mouse.up({ button: "middle" });

  expect(panning).toBe("grabbing");
  expect(panning).not.toContain("data:image/svg+xml");
});
