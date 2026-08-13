import { test, expect, type Page } from "@playwright/test";
import { RECENT_PALETTE_ID, RECENT_PALETTE_NAME } from "../src/lib/color-palettes";
import { dragGrip } from "./helpers/rails";

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

/** The toolbar, specifically. The shapebar shares `.flow-toolbar`, so a bare
 *  class selector now matches two elements and trips Playwright's strict mode. */
const toolRail = (page: Page) => page.getByRole("toolbar", { name: "Tools" });

/**
 * Click the stroke box where a user actually clicks it: the exposed ring in
 * its lower-right.
 *
 * Its geometric centre is two unhelpful things at once — the ring's own hole,
 * and the fill box's bottom-right corner. Fill is stacked above stroke
 * whenever fill is active, so a default centre-click resolves to fill and
 * Playwright reports the fill path intercepting pointer events. That was
 * always true of the geometry; it merely used to squeak past by a single
 * pixel while the boxes were larger, which is not a target to rely on.
 */
async function clickStroke(page: Page, root: string) {
  const box = (await page
    .locator(root)
    .getByRole("radio", { name: /Stroke/ })
    .boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
}

const popup = '[role="dialog"][aria-label="Color picker"]';

/**
 * Drive the docked panel's palette dropdown by the option label the user reads.
 *
 * `exact: true` is load-bearing: `getByLabel("Palette")` also substring-matches
 * the "Palette actions" gear sitting beside the select, and Playwright rejects
 * the ambiguity under strict mode.
 */
async function selectPalette(page: Page, name: string) {
  await page.locator(panel).getByLabel("Palette", { exact: true }).selectOption({ label: name });
}

/**
 * Open the palette gear's dropdown.
 *
 * Only the trigger is scoped to the panel — the menu itself portals to
 * `<body>`, so every item lookup below is page-level on purpose.
 */
async function openPaletteMenu(page: Page) {
  await page.locator(panel).getByRole("button", { name: "Palette actions" }).click();
  await expect(page.getByRole("menu", { name: "Palette actions" })).toBeVisible();
}

/** The swatch tiles of whichever palette the docked panel currently shows.
 *  Scoped to `__tile`, so the grid's leading trash and [+] tiles don't count. */
const paletteTiles = (page: Page) => page.locator(panel).locator(".flow-clr-palette__tile");

/**
 * The last-drawn element's fill, reduced to the six-digit hex a palette stores.
 *
 * The scene value carries an alpha byte (`#rrggbbaa`): a fresh rectangle's fill
 * is "transparent", which `splitColorAlpha` reads as alpha 0, so every write
 * from the picker recombines to a zero-alpha color until someone touches
 * opacity. `scrubHex` drops that byte on the way into a palette, so swatch and
 * strip labels are always six digits. The regex asserts the shape rather than
 * assuming it — a change in either direction fails loudly here instead of
 * quietly mismatching a selector somewhere downstream. It also subsumes the
 * "not still transparent" check: "transparent" cannot match it.
 */
async function appliedFill(page: Page): Promise<string> {
  const raw: string = await page.evaluate(
    () => (window as any).h.elements.at(-1).backgroundColor,
  );
  expect(raw).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/);
  return raw.slice(0, 7);
}

/**
 * One whole rail-popup session: open it on the active box, click the saturation
 * area at the given fractions, close it. Returns the hex it left on the
 * selection — which is the hex closing should have recorded.
 */
async function pickInRailPopup(page: Page, fx: number, fy: number): Promise<string> {
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const dialog = page.locator(popup);
  await expect(dialog).toBeVisible();
  const box = (await dialog.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  const hex = await appliedFill(page);
  await dialog.getByRole("button", { name: /close color picker/i }).click();
  await expect(dialog).toHaveCount(0);
  return hex;
}

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
  await clickStroke(page, panel);
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
 * the previous undo entry instead of recording its own. `markDeferred` /
 * `consumeDeferred` only run during a drag gesture, so a sequence of three
 * discrete clicks can never touch that path — it proves ordinary edits don't
 * collapse, but says nothing about whether a drag's flag gets cleared rather
 * than leaking into whatever commits next. A single drag-then-undo (the test
 * above) doesn't close that either: "one gesture, one entry" and "a leaked
 * flag ate the next edit's entry" both look identical from one restore.
 *
 * The drag is deliberately one of the three edits: markDeferred/consumeDeferred
 * only run during a gesture, so a sequence of discrete clicks cannot detect a
 * leaked `pending` flag swallowing the following commit.
 */
test("a drag followed by two distinct edits produces three distinct undo steps", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  // Setup, not one of the three counted edits: seed real saturation so the
  // hue drag below is observable at all (see the note on the single-drag
  // test above — a hue-only change on an achromatic color is invisible).
  const satBox = (await page.locator(panel).getByRole("application").boundingBox())!;
  await page.mouse.click(satBox.x + satBox.width * 0.8, satBox.y + satBox.height * 0.3);

  const hueField = page.locator(panel).getByRole("spinbutton", { name: "Hue" });
  const lightness = page.locator(panel).getByLabel("Lightness");
  await expect(hueField).toHaveValue("0");
  const seededL = await lightness.inputValue();

  // Edit 1: a genuine pointer drag (down, several moves, up) — not a click
  // and not an arrow-key step, both of which commit immediately and never
  // call markDeferred. This is the only one of the three edits that passes
  // through the deferred-commit path at all.
  const hue = page.locator(panel).getByRole("slider", { name: "Hue" });
  const box = (await hue.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(hueField).not.toHaveValue("0");
  const draggedHue = await hueField.inputValue();

  // Edit 2: a discrete, non-transient commit.
  await page.locator(panel).getByRole("button", { name: "White" }).click();
  await expect(lightness).toHaveValue("100");

  // Edit 3: another discrete, non-transient commit.
  await page.locator(panel).getByRole("button", { name: "Grey" }).click();
  await expect(lightness).toHaveValue("50");

  // Undo 1 of 3: back to the state after edit 2 (White), not further.
  await page.keyboard.press("Control+z");
  await expect(lightness).toHaveValue("100");

  // Undo 2 of 3: back to the state after edit 1 (the drag) — the critical
  // check. If the drag's `pending` flag had leaked into edit 2's commit,
  // edit 2 would have absorbed edit 1's entry (commitDeferredChanges: true
  // skips the uncommitted-element filter for it too), and this single undo
  // would overshoot straight past the dragged hue to the pre-drag seeded
  // state instead of landing on it.
  await page.keyboard.press("Control+z");
  await expect(lightness).toHaveValue(seededL);
  await expect(hueField).toHaveValue(draggedHue);

  // Undo 3 of 3: back to the pre-drag seeded state, exactly — not the
  // original transparent fill from before the setup step.
  await page.keyboard.press("Control+z");
  await expect(hueField).toHaveValue("0");
  await expect(lightness).toHaveValue(seededL);
});

test("none on stroke zeroes the width and a color revives it", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await clickStroke(page, panel);
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

test("two popup sessions accumulate two colors", async ({ page }) => {
  // Was "recents accumulate and survive a reload", driven through the docked
  // panel's Hex field. That route no longer records anything: the six-slot
  // recents cache became the Recent palette, and the rail popup's close is the
  // only automatic way into it. The accumulation this test exists for is real
  // and unchanged; only the way a color gets there moved.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const first = await pickInRailPopup(page, 0.8, 0.3);
  const second = await pickInRailPopup(page, 0.25, 0.75);
  // Two genuinely different colors, or the "accumulate" in the title is a lie
  // and the second session is silently a no-op re-record of the first.
  expect(second).not.toBe(first);

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: `Recent color ${second}` })).toBeVisible();
  await expect(page.locator(popup).getByRole("button", { name: `Recent color ${first}` })).toBeVisible();
});

test("quickSet white/grey/black does not pollute recents", async ({ page }) => {
  // The quartet chips (`PartChooser`, shared by the rail popup and this
  // docked panel) sit outside any picker session and write straight through
  // `useColorTarget`, so no picker session ever captures them — the Recent
  // palette must stay untouched by all three, on either surface.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  await page.locator(panel).getByRole("button", { name: "White" }).click();
  await page.locator(panel).getByRole("button", { name: "Grey" }).click();

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #000000" })).toHaveCount(0);
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #ffffff" })).toHaveCount(0);
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #808080" })).toHaveCount(0);
  await expect(page.locator(popup).getByRole("button", { name: /Recent color slot 1, empty/ })).toBeVisible();
});

test("selecting text aims the chooser at text without dropping the other boxes", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // `exact: true`: without it, "Text" also substring-matches the Text
  // sub-panel's always-rendered "Close Text" collapse button, and Playwright
  // refuses the click as ambiguous.
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(600, 340);
  await page.keyboard.type("hello");
  await page.keyboard.press("Escape");

  // All three boxes stay on screen at every selection — the chooser is a fixed
  // object, and the saturation box beside it is sized off its height. What
  // changes is which boxes are live.
  await expect(page.locator(panel).getByRole("radio")).toHaveCount(3);
  await expect(
    page.locator(panel).locator('[role="radio"][aria-checked="true"]'),
  ).toHaveAccessibleName(/Text/);
  await expect(
    page.locator(panel).locator('[role="radio"][aria-disabled="true"]'),
  ).toHaveCount(2);
});

test("the chooser and the saturation box stay the same height as the panel resizes", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const heights = async () => {
    const chooser = (await page.locator(panel).locator(".flow-clr-chooser").boundingBox())!;
    const sat = (await page.locator(panel).getByRole("application").boundingBox())!;
    return { chooser: Math.round(chooser.height), sat: Math.round(sat.height), satW: Math.round(sat.width) };
  };

  const before = await heights();
  expect(before.sat).toBe(before.chooser);

  // The dock resizes from the LEFT edge of the right-docked panel, so dragging
  // left widens it (`resizeDocked` subtracts the delta).
  const grip = page.locator(".flow-pnl__resize--left").first();
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 120, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();

  const after = await heights();
  // The saturation box scales on one axis only: wider, same height, still
  // locked to the chooser. Before this, its aspect-ratio grew it downward and
  // the two sections drifted apart on every resize.
  expect(after.satW).toBeGreaterThan(before.satW);
  expect(after.sat).toBe(after.chooser);
  expect(after.sat).toBe(before.sat);
});

/**
 * Renaming is a dialog off the gear menu now — double-clicking the select
 * does nothing. Escape has to discard the edit, and only a real browser can
 * show the whole path: the dialog portals out of the docked panel, the key is
 * caught by a window listener rather than by the field being typed into, and
 * the field is a real focused input that a browser (unlike jsdom) blurs on
 * the way out. A blur that committed would look exactly like a working
 * Escape until it didn't.
 */
test("Escape abandons an in-progress palette rename", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const select = page.locator(panel).getByLabel("Palette", { exact: true });
  const originalName = (await select.locator("option:checked").textContent()) ?? "";

  await openPaletteMenu(page);
  await page.getByRole("menuitem", { name: "Rename palette…" }).click();
  const nameInput = page.getByLabel("Palette name");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("Changed Name XYZ");
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "Rename palette" })).toHaveCount(0);
  await expect(select.locator("option:checked")).toHaveText(originalName);
});

/**
 * The committing half of the rename path, which the Escape test above cannot
 * prove on its own: a rename that silently did nothing would leave the option
 * text unchanged and look identical to a working Escape.
 *
 * The assertion is keyed on the palette's *id*, read before the rename, so it
 * pins "this same palette's label changed" rather than "some option somewhere
 * now says the new name" — a rename that wrote to the wrong palette, or one
 * that created a new palette instead of renaming, both fail here.
 */
test("renaming a palette through the gear updates the dropdown", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const select = page.locator(panel).getByLabel("Palette", { exact: true });
  const id = await select.inputValue();
  const originalName = (await select.locator("option:checked").textContent()) ?? "";
  // Which palettes ship is a product decision, so the test asserts the rename
  // moved the label rather than assuming what it moved from — this only checks
  // there was somewhere to move from.
  expect(originalName).not.toBe("Renamed in a browser");

  await openPaletteMenu(page);
  await page.getByRole("menuitem", { name: "Rename palette…" }).click();
  const dialog = page.getByRole("dialog", { name: "Rename palette" });
  await dialog.getByLabel("Palette name").fill("Renamed in a browser");
  // Scoped and exact, like the Add dialog's OK below: an unqualified "OK"
  // substring-matches accessible names elsewhere on the page.
  await dialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(select).toHaveValue(id);
  await expect(select.locator(`option[value="${id}"]`)).toHaveText("Renamed in a browser");
  // One palette renamed, not one added: `addPalette` would also leave a new
  // option carrying the typed name.
  await expect(
    select.locator("option").filter({ hasText: /^Renamed in a browser$/ }),
  ).toHaveCount(1);
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
  // The toolbar's own right edge is 44px, but the reserved gutter is now the
  // sum of both rails — measure the outermost docked rail, the shapebar.
  const rail = (await page.getByRole("toolbar", { name: "Shapes" }).boundingBox())!;
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
  // bails out of any press that starts on a `button`). `dragGrip` drags to
  // an absolute point, so the target below is computed relative to the
  // grip's own current position rather than passed as a fixed offset.
  const start = (await toolRail(page).locator(".flow-toolbar__grip").boundingBox())!;
  await dragGrip(page, toolRail(page), start.x + 320, start.y + 160);
  await expect(toolRail(page)).toHaveClass(/flow-toolbar--floating/);

  await dragGrip(page, toolRail(page), 4, 120);
  await expect(toolRail(page)).toHaveClass(/flow-toolbar--docked/);
});

test("hiding the toolbar reclaims its share of the canvas gutter", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-toolbar");
  const reserved = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--flow-toolbar-reserved").trim(),
    );

  expect(await reserved()).toBe("124px");
  await page.getByRole("button", { name: "Toolbar options" }).click();
  await page.getByRole("menuitem", { name: /hide/i }).click();
  // Hiding the toolbar leaves the shapebar docked, so the gutter drops to the
  // shapebar's own width, not zero.
  await expect(toolRail(page)).toHaveCount(0);
  expect(await reserved()).toBe("80px");
});

test("dragging a swatch onto the trash deletes it", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const swatches = page.locator(panel).getByRole("button", { name: /^Swatch /i });
  const before = await swatches.count();
  const doomed = await swatches.first().getAttribute("aria-label");

  // Playwright's dragAndDrop drives real HTML5 DnD in Chromium, which is what
  // the grid uses (native `draggable`, not pointer events).
  await page.dragAndDrop(
    `${panel} [aria-label="${doomed}"]`,
    `${panel} [aria-label="Delete swatches"]`,
  );

  await expect(swatches).toHaveCount(before - 1);
  await expect(page.locator(panel).getByRole("button", { name: doomed!, exact: true })).toHaveCount(0);
});

test("the rail's color control fits the rail without overflowing", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-toolbar");

  // A labelled container is the tallest case: three parts, so the stack is
  // 2.25 part-sizes tall on top of a two-row quartet.
  await drawRect(page, 400, 300, 560, 400);
  await page.keyboard.press("Enter");
  await page.keyboard.type("hi");
  await page.keyboard.press("Escape");

  // NOT proven yet: tool-lock keeps the Rectangle tool active after drawing,
  // and Escape out of the bound-text edit clears selectedElementIds entirely
  // rather than leaving the container selected (the same selection loss
  // e2e/text-panel.spec.ts's addLabelledBox-based tests hit). A plain click
  // on the canvas right after Escape does not reselect anything either,
  // because clicks only select while the Selection tool is active. Switch
  // tools explicitly, then click the container's stroke edge — its interior
  // doesn't hit-test, since a fresh rectangle's fill is transparent.
  await page.getByRole("button", { name: "Selection" }).click();
  await page.mouse.click(400, 350);

  // Assert the tallest case was actually reached before measuring it, so a
  // Three boxes are now the only case — the chooser renders all of them at
  // every selection — so this no longer proves a state transition was reached.
  // It stays as a cheap guard that the rail's chooser is mounted and whole
  // before we measure it; the height it measures is the only height there is.
  await expect(toolRail(page).getByRole("radio")).toHaveCount(3);

  const overflow = await page.evaluate(() => {
    const rail = document.querySelector('[aria-label="Tools"]') as HTMLElement;
    return {
      v: rail.scrollHeight - rail.clientHeight,
      h: rail.scrollWidth - rail.clientWidth,
    };
  });
  expect(overflow.h).toBeLessThanOrEqual(0);
  expect(overflow.v).toBeLessThanOrEqual(0);
});

// --- the Recent palette: the rotating-color loop ---
//
// flow's six-slot recents cache became a real, editable palette (fixed id
// `flow-recent`, capacity 20) that appears in the dropdown like any other, and
// the rail popup's close is the ONLY automatic way a color enters it. Three of
// that design's risks are invisible to jsdom — `aria-disabled` instead of the
// native `disabled` attribute (Chrome delivers no mouse events at all to a
// disabled form control, and these tiles are HTML5 drop targets), the inert
// trash's CSS cascade, and the fact that the dropdown, the popup's strip and
// the scene are three surfaces that have to agree. Hence these live here.

test("a color picked in the rail popup joins the Recent palette on close", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  // A fresh profile starts with an empty Recent palette — nothing to confuse
  // the assertions with, and no hardcoded hex anywhere in this test.
  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(paletteTiles(page)).toHaveCount(0);

  // Open the rail's popup on the active box and give the fill a real color.
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const dialog = page.locator(popup);
  await expect(dialog).toBeVisible();
  const box = (await dialog.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);

  const applied = await appliedFill(page);

  // Still nothing: the color settles when the session ends, not before. A
  // forty-event hue drag has to contribute one color, not forty, and the only
  // way to know which one is to wait for the session to finish.
  await expect(paletteTiles(page)).toHaveCount(0);

  await dialog.getByRole("button", { name: /close color picker/i }).click();

  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` })).toBeVisible();
  await expect(paletteTiles(page)).toHaveCount(1);
});

test("the popup's strip shows what the Recent palette holds", async ({ page }) => {
  // The strip and the dropdown's Recent entry are one array, not two stores
  // kept in step — this is the assertion that would catch them drifting apart.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const applied = await pickInRailPopup(page, 0.8, 0.3);

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: `Recent color ${applied}` }))
    .toBeVisible();

  // Same color, other surface: the docked panel's Recent entry holds it too.
  await page.keyboard.press("Escape");
  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` })).toBeVisible();
});

test("a color set from the docked panel does NOT join the Recent palette", async ({ page }) => {
  // The core of the brief: the popup is the only automatic route in. This is
  // the assertion that fails if recording ever drifts back into the shared
  // useColorTarget write path — `setColor` is one method again, and the docked
  // panel's saturation box calls exactly the same one the popup does.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await seedSaturation(page);

  // Prove the edit actually landed before asserting that nothing recorded it.
  // Without this the test would pass just as happily if the click had missed
  // the saturation box entirely — an empty palette proves nothing on its own.
  await expect(page.locator(panel).getByLabel("Lightness")).not.toHaveValue("0");
  await appliedFill(page);

  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(paletteTiles(page)).toHaveCount(0);
});

test("the Recent palette cannot be deleted", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await selectPalette(page, RECENT_PALETTE_NAME);

  // `aria-disabled`, never the native `disabled` attribute: a disabled button
  // cannot take focus, so a keyboard user could never land on the item to find
  // out why it is unavailable. jsdom cannot tell the two apart at the level
  // that matters, so a unit test keeps passing with `disabled` swapped back in.
  await openPaletteMenu(page);
  const del = page.getByRole("menuitem", { name: "Delete palette…" });
  await expect(del).toHaveAttribute("aria-disabled", "true");
  await expect(del).not.toHaveAttribute("disabled", /.*/);

  // `force: true` is required, and is the point rather than a workaround:
  // Playwright's actionability check honours `aria-disabled` and would sit
  // there retrying "element is not enabled" until the test timed out, never
  // dispatching anything. Forcing it sends a real mouse click at the element —
  // which Chrome *does* deliver, because the element is not natively disabled —
  // so what this asserts is that the handler itself declines, not that the
  // browser swallowed the event.
  await del.click({ force: true });
  await expect(page.getByRole("dialog", { name: "Delete palette" })).toHaveCount(0);
  await expect(page.locator(panel).getByLabel("Palette", { exact: true }))
    .toHaveValue(RECENT_PALETTE_ID);

  // Control, so the assertions above can't pass against a menu item that had
  // quietly stopped working for every palette: a palette that CAN be deleted
  // still opens the confirmation from the same item. A new empty palette
  // rather than a named builtin — which palettes ship is a product decision.
  //
  // Escape first rather than clicking the gear again: a guarded item leaves
  // the menu open, and toggling a still-open menu would close it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Palette actions" })).toHaveCount(0);

  await openPaletteMenu(page);
  await page.getByRole("menuitem", { name: "Add palette…" }).click();
  // Scoped and exact: an unqualified "OK" substring-matches accessible names
  // like "Swap fill and stroke" and "Close Stroke" elsewhere on the page.
  const addDialog = page.getByRole("dialog", { name: "Add palette" });
  await addDialog.getByRole("button", { name: "OK", exact: true }).click(); // prefilled name
  await expect(addDialog).toHaveCount(0);

  await openPaletteMenu(page);
  await expect(del).toHaveAttribute("aria-disabled", "false");
  await del.click();
  await expect(page.getByRole("dialog", { name: "Delete palette" })).toBeVisible();
});

/**
 * Copy-to, end to end across the two gestures no unit test can drive together:
 * a real modifier-click to select a swatch, and a real `<select>` in a portaled
 * modal to choose where it goes.
 *
 * The destination is a palette this test creates rather than a shipped one.
 * That buys two things: which palettes ship is a product decision that has
 * changed before, and an empty destination makes "the swatch landed" a count
 * going 0 -> 1 instead of a `toBeVisible` that a preset already containing the
 * color would satisfy for free.
 */
test("copying a swatch from Recent lands it in another palette", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  // The rail popup's close is the only automatic route into Recent.
  const applied = await pickInRailPopup(page, 0.8, 0.3);

  // Make the destination: an empty palette, whose prefilled "color set N" name
  // is read back off the dropdown rather than predicted.
  const select = page.locator(panel).getByLabel("Palette", { exact: true });
  await openPaletteMenu(page);
  await page.getByRole("menuitem", { name: "Add palette…" }).click();
  const addDialog = page.getByRole("dialog", { name: "Add palette" });
  await addDialog.getByRole("button", { name: "OK", exact: true }).click();
  await expect(addDialog).toHaveCount(0);
  const target = (await select.locator("option:checked").textContent())!;
  await expect(paletteTiles(page)).toHaveCount(0);

  // Select the swatch in Recent. ⌘/Ctrl-click selects; a plain click would
  // apply the color instead and leave the menu's copy item inert, so assert
  // the selection landed before relying on it.
  await selectPalette(page, RECENT_PALETTE_NAME);
  const swatch = page.locator(panel).getByRole("button", { name: `Swatch ${applied}` });
  await swatch.click({ modifiers: ["ControlOrMeta"] });
  await expect(swatch).toHaveAttribute("aria-pressed", "true");

  await openPaletteMenu(page);
  await page.getByRole("menuitem", { name: "Copy selected swatches to…" }).click();
  const copyDialog = page.getByRole("dialog", { name: "Copy swatches to" });
  await copyDialog.getByLabel("Target palette").selectOption({ label: target });
  await copyDialog.getByRole("button", { name: "Copy", exact: true }).click();
  await expect(copyDialog).toHaveCount(0);

  await selectPalette(page, target);
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
  // Exactly one: `copySwatchesTo` commits the whole batch once, and a
  // re-introduced per-color `addSwatch` loop is the regression to catch.
  await expect(paletteTiles(page)).toHaveCount(1);

  // Copy, not move — the source keeps its swatch.
  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
});

test("the Recent palette survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const applied = await pickInRailPopup(page, 0.8, 0.3);

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await selectPalette(page, RECENT_PALETTE_NAME);
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` })).toBeVisible();
});
