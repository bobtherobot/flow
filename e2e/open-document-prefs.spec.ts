import { test, expect, type Page } from "@playwright/test";

/** A `.excalidraw` authored elsewhere: every flow-owned global differs from
 *  flow's defaults, plus one genuinely document-owned field. */
const FOREIGN_DOC = JSON.stringify({
  type: "excalidraw",
  version: 2,
  source: "e2e",
  elements: [],
  appState: {
    gridSize: 20,
    selectionMode: "touch",
    laserColor: "#00ff00",
    bindingMode: "off",
    viewBackgroundColor: "#ffe4e1",
  },
  files: {},
});

interface FlowGlobals {
  gridSize?: number;
  selectionMode?: string;
  laserColor?: string;
  bindingMode?: string;
  viewBackgroundColor?: string;
}

function readAppState(page: Page): Promise<FlowGlobals> {
  return page.evaluate(() => {
    const state = (window as unknown as { h?: { state?: FlowGlobals } }).h?.state ?? {};
    return {
      gridSize: state.gridSize,
      selectionMode: state.selectionMode,
      laserColor: state.laserColor,
      bindingMode: state.bindingMode,
      viewBackgroundColor: state.viewBackgroundColor,
    };
  });
}

async function setGridSize(page: Page, value: number) {
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Preferences…" }).click();
  const input = page.getByLabel("Grid size");
  await input.fill(String(value));
  await input.blur();
  await page.getByRole("button", { name: "Done" }).click();
}

async function openLocalDoc(page: Page, contents: string) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("menuitem", { name: "File" }).click();
  await page.getByRole("menuitem", { name: "Open…" }).click();
  await page.getByRole("radio", { name: "Local system" }).check();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: "foreign.excalidraw",
    mimeType: "application/json",
    buffer: Buffer.from(contents),
  });
}

test("opening a foreign document does not override flow's global preferences", async ({
  page,
}) => {
  await page.goto("/");
  // Wait for the app to be interactive before touching window.h (mount race).
  await expect(page.getByRole("menuitem", { name: "File" })).toBeVisible();

  // Move grid size off both the flow default and the doc's value.
  await setGridSize(page, 40);
  await expect.poll(() => readAppState(page).then((s) => s.gridSize)).toBe(40);
  const before = await readAppState(page);

  await openLocalDoc(page, FOREIGN_DOC);

  // The doc's own canvas state lands — proves the open actually happened.
  await expect
    .poll(() => readAppState(page).then((s) => s.viewBackgroundColor))
    .toBe("#ffe4e1");

  const after = await readAppState(page);
  expect(after.gridSize).toBe(before.gridSize);
  expect(after.selectionMode).toBe(before.selectionMode);
  expect(after.laserColor).toBe(before.laserColor);
  expect(after.bindingMode).toBe(before.bindingMode);
});
