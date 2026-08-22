import { test, expect, type Page } from "@playwright/test";
import { openMenu } from "./helpers/menu";
import { gotoApp, reloadApp } from "./helpers/app";
import { PASTE_OFFSET_STEP, PASTE_POSITION_LABELS } from "../src/lib/paste-position";

/**
 * Where a pasted element lands, per the `flow.pastePosition` preference.
 *
 * This spec is also the drift guard between flow's `PASTE_OFFSET_STEP` (used
 * only for the Preferences label) and the fork's own constant in
 * `packages/common/src/constants.ts` (the one the paste path actually applies).
 * The offset expectations below are derived from flow's copy and measured
 * against the fork's, so changing one without the other fails here.
 */

type Box = { x: number; y: number; width: number; height: number };

/** Every element currently in the scene, as plain boxes. */
function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(() =>
    (
      window as unknown as { h: { elements: Box[] } }
    ).h.elements.map(({ x, y, width, height }) => ({ x, y, width, height })),
  );
}

/** Scene coordinates of a viewport point, the same conversion the paste path
 *  uses (`viewportCoordsToSceneCoords`). */
function toScene(page: Page, clientX: number, clientY: number) {
  return page.evaluate(
    ({ clientX, clientY }) => {
      const s = (
        window as unknown as {
          h: {
            state: {
              scrollX: number;
              scrollY: number;
              offsetLeft: number;
              offsetTop: number;
              zoom: { value: number };
            };
          };
        }
      ).h.state;
      return {
        x: (clientX - s.offsetLeft) / s.zoom.value - s.scrollX,
        y: (clientY - s.offsetTop) / s.zoom.value - s.scrollY,
      };
    },
    { clientX, clientY },
  );
}

/** Center of the visible canvas, in scene coordinates. */
function viewportCenterScene(page: Page) {
  return page.evaluate(() => {
    const s = (
      window as unknown as {
        h: {
          state: {
            width: number;
            height: number;
            scrollX: number;
            scrollY: number;
            zoom: { value: number };
          };
        };
      }
    ).h.state;
    return {
      x: s.width / 2 / s.zoom.value - s.scrollX,
      y: s.height / 2 / s.zoom.value - s.scrollY,
    };
  });
}

async function setPastePosition(
  page: Page,
  position: keyof typeof PASTE_POSITION_LABELS,
) {
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await page.getByRole("radio", { name: PASTE_POSITION_LABELS[position] }).click();
  await page.getByRole("button", { name: "Done" }).click();
}

/** Draw a rectangle at a fixed spot; leaves it selected and the pointer on it. */
async function drawRectangle(page: Page) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 8 });
  await page.mouse.up();
}

/** Copy the selection and hand back the raw clipboard payload. */
async function copySelection(page: Page): Promise<string> {
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.waitForTimeout(250);
  return page.evaluate(() => navigator.clipboard.readText());
}

/**
 * Replay a clipboard payload through the `paste` event Excalidraw listens for.
 * Chromium's Ctrl+V under Playwright does not deliver clipboard contents, so
 * pressing it alone silently pastes nothing (same workaround as
 * `drawing-defaults.spec.ts`).
 *
 * Pasting the *same* payload twice is deliberate in the cascade test: the fork
 * keys its offset cascade on the pasted element ids, so a re-copy would look
 * like a different payload and reset the step.
 */
async function pastePayload(page: Page, payload: string) {
  await page.evaluate((text: string) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    document.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, payload);
  await page.waitForTimeout(400);
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
});

test("pastes in place by default", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await drawRectangle(page);

  const [original] = await boxes(page);
  const payload = await copySelection(page);
  // Park the pointer somewhere else entirely: "same position" must ignore it.
  await page.mouse.move(300, 620);
  await pastePayload(page, payload);

  const all = await boxes(page);
  expect(all).toHaveLength(2);
  expect(all[1].x).toBeCloseTo(original.x, 5);
  expect(all[1].y).toBeCloseTo(original.y, 5);
});

test("offset mode steps one PASTE_OFFSET_STEP further on each repeat", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await setPastePosition(page, "offset");
  await drawRectangle(page);

  const [original] = await boxes(page);
  const payload = await copySelection(page);
  await page.mouse.move(300, 620);

  await pastePayload(page, payload);
  await pastePayload(page, payload);
  await pastePayload(page, payload);

  const all = await boxes(page);
  expect(all).toHaveLength(4);
  // Cascading, not stacking: three pastes of one payload fan out.
  for (const step of [1, 2, 3]) {
    expect(all[step].x).toBeCloseTo(original.x + step * PASTE_OFFSET_STEP, 5);
    expect(all[step].y).toBeCloseTo(original.y + step * PASTE_OFFSET_STEP, 5);
  }
});

test("pointer mode centers the paste on the mouse", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await setPastePosition(page, "pointer");
  await drawRectangle(page);

  const [original] = await boxes(page);
  const payload = await copySelection(page);
  await page.mouse.move(400, 600);
  const target = await toScene(page, 400, 600);
  await pastePayload(page, payload);

  const all = await boxes(page);
  expect(all).toHaveLength(2);
  expect(all[1].x + all[1].width / 2).toBeCloseTo(target.x, 0);
  expect(all[1].y + all[1].height / 2).toBeCloseTo(target.y, 0);
  // ...and that is somewhere other than where it was copied from.
  expect(Math.abs(all[1].x - original.x)).toBeGreaterThan(1);
});

test("viewport mode centers the paste in the visible canvas", async ({ page }) => {
  await gotoApp(page);
  await page.waitForSelector(".flow-pnl");
  await setPastePosition(page, "viewport");
  await drawRectangle(page);

  const payload = await copySelection(page);
  // The pointer is deliberately off-center: viewport mode must ignore it.
  await page.mouse.move(300, 620);
  const center = await viewportCenterScene(page);
  await pastePayload(page, payload);

  const all = await boxes(page);
  expect(all).toHaveLength(2);
  expect(all[1].x + all[1].width / 2).toBeCloseTo(center.x, 0);
  expect(all[1].y + all[1].height / 2).toBeCloseTo(center.y, 0);
});

test("the preference survives a reload", async ({ page }) => {
  await gotoApp(page);
  await setPastePosition(page, "offset");

  await reloadApp(page);
  await openMenu(page, "File");
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  await expect(
    page.getByRole("radio", { name: PASTE_POSITION_LABELS.offset }),
  ).toBeChecked();
});
