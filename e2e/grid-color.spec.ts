import { test, expect, type Page } from "@playwright/test";

/** Open the File dropdown. Radix's menubar can occasionally leave a
 *  just-closed dropdown's own trigger "active" so an immediate click on a
 *  *different* top-level trigger only highlights it instead of opening its
 *  dropdown — seen when File is opened right after toggling an item in the
 *  View menu (see the pixel test below). Retry once if that happens; a
 *  second click reliably opens it. */
async function openFileMenu(page: Page) {
  const fileMenu = page.getByRole("menuitem", { name: "File" });
  await fileMenu.click();
  if (!(await page.getByRole("menuitem", { name: "Preferences…" }).isVisible())) {
    await fileMenu.click();
  }
}

/** `closeDialog: false` leaves the Preferences dialog open after committing
 *  the hex value — needed by the pixel test below, since clicking "Done"
 *  changes `appState.openDialog`, which the static canvas's memo comparator
 *  *does* track, and that alone would force a fresh repaint that masks the
 *  exact bug the test exists to catch (see that test for the full story). */
async function setGridColor(
  page: Page,
  hex: string,
  { closeDialog = true }: { closeDialog?: boolean } = {},
) {
  await openFileMenu(page);
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await page.getByRole("button", { name: "Grid color" }).click();
  const field = page.getByLabel("Grid color hex");
  await field.fill(hex);
  await field.press("Enter");
  if (closeDialog) {
    await page.getByRole("button", { name: "Done" }).click();
  }
}

function readGridColors(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          h?: { state?: { gridColor?: string; gridColorBold?: string } };
        }
      ).h?.state,
  );
}

test("grid-color preference updates the live appState colors", async ({ page }) => {
  await page.goto("/");
  // Wait for the app to be interactive before touching window.h (mount race).
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  // flow's default pair: thin #dddddd, bold derived 8 lighter.
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#dddddd");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#e5e5e5");

  await setGridColor(page, "#001020");
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#001020");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#081828");
});

test("grid-color preference persists across reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  await setGridColor(page, "#3366aa");
  await page.reload();
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#3366aa");
  await expect
    .poll(async () => (await readGridColors(page))?.gridColorBold)
    .toBe("#3b6eb2");
});

/**
 * Pixel-level regression coverage.
 *
 * Both tests above only read `window.h.state` — they would have passed even
 * with the bug an earlier review caught: `updateScene({ appState: { gridColor
 * } })` updated appState, but StaticCanvas's `React.memo` comparator
 * (`getRelevantAppStateProps`) didn't list the new fields, so the canvas kept
 * its *old* pixels until something else forced a repaint. This test proves
 * the repaint itself happens, by sampling real canvas pixels.
 *
 * Getting a test that is actually sensitive to that bug takes care on two
 * fronts, both load-bearing:
 *  1. Enable the grid BEFORE changing the color, so the canvas has already
 *     painted the *old* color and the color-only update is what's on trial.
 *  2. Sample while the Preferences dialog is still open (`closeDialog:
 *     false`), before anything else changes. Any other appState field the
 *     memo comparator *does* track — including `openDialog` itself, which
 *     flips when the dialog closes — forces a fresh repaint that would
 *     paint the correct color regardless of whether `gridColor` is tracked,
 *     silently masking the exact bug this test exists to catch. Panning,
 *     zooming, or editing an element would do the same, which is why none
 *     of those happen here either.
 */
function readGridModeEnabled(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { gridModeEnabled?: boolean } } }).h
        ?.state?.gridModeEnabled,
  );
}

test("grid-color preference repaints the static canvas, not just appState", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  // Turn grid mode on FIRST, through the real View menu control (not a
  // window.h shortcut), so the static canvas already has grid lines painted
  // in the *old* color before the color change below. Setting the color
  // before enabling the grid would let the first grid paint pick up the new
  // color for free (gridModeEnabled itself forces a repaint), which would
  // pass even with the memo-comparator bug this test exists to catch.
  await expect.poll(() => readGridModeEnabled(page)).toBe(false);
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Grid", exact: true }).click();
  await expect.poll(() => readGridModeEnabled(page)).toBe(true);

  // A strongly saturated, unmistakable grid color, committed while the
  // Preferences dialog stays open (see the comment above the test).
  await setGridColor(page, "#ff0000", { closeDialog: false });
  await expect.poll(async () => (await readGridColors(page))?.gridColor).toBe("#ff0000");

  // Sample the STATIC canvas (where grid lines are drawn) immediately, with
  // no pan/zoom/edit/dialog-close in between — those are exactly the
  // actions that would force the repaint the bug depended on skipping.
  const { hits, total } = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.static");
    if (!canvas) {
      return { hits: 0, total: 0 };
    }
    const ctx = canvas.getContext("2d")!;
    const { width, height } = canvas;
    const regionWidth = Math.min(width, 900);
    const regionHeight = Math.min(height, 700);
    // Single getImageData over the whole region, then stride the returned
    // buffer in JS — one GPU→CPU sync instead of one per sampled pixel
    // (~157,500 individual calls previously). Same region and same stride
    // over x/y as before; only the read mechanism changed.
    const { data } = ctx.getImageData(0, 0, regionWidth, regionHeight);
    let hits = 0;
    let total = 0;
    // Scan a broad swath of the canvas at a fine step so both the dashed
    // regular lines (every 20px) and the solid bold lines (every 100px) get
    // crossed multiple times regardless of the scroll offset.
    for (let x = 0; x < regionWidth; x += 2) {
      for (let y = 0; y < regionHeight; y += 2) {
        const idx = (y * regionWidth + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        total++;
        // Red-dominant: high red channel, low green/blue.
        if (r > 180 && g < 100 && b < 100) {
          hits++;
        }
      }
    }
    return { hits, total };
  });

  expect(total).toBeGreaterThan(0);
  expect(hits).toBeGreaterThan(0);
});
