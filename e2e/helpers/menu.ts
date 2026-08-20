import { expect, type Page } from "@playwright/test";

/** Any open menubar menu. Radix renders one `[role="menu"]` per open menu, and
 *  the menubar only ever has one open at a time. */
const OPEN_MENU = '[role="menu"]';

export type MenuName = "File" | "Edit" | "View" | "Help";

/**
 * Open a menubar menu and wait until it is really open.
 *
 * Why this exists rather than `getByRole("menuitem", { name }).click()`:
 * **a click on the trigger while the previously-opened menu is still mounted
 * is swallowed** — the menu toggles open and shut within the same gesture and
 * you are left with no menu at all, after which the test waits for an item
 * that will never appear and dies on the test timeout.
 *
 * That was the single biggest source of "flaky e2e" in this suite. It was
 * misfiled for two weeks as parallel-load flakiness because it surfaced in a
 * different spec each run; it is not load-related at all. A reproduction that
 * opens the View menu four times in a row failed 8/12 at `--workers=8` **and
 * 5/12 at `--workers=1`**, which is what ruled load out. Passing tests in the
 * same runs sat at p99 2.7s against a 30s timeout, so there was never a
 * starvation problem to fix.
 *
 * Two things make it reliable, and both are needed:
 *  - wait for the previous menu to be gone before clicking the trigger, so the
 *    click cannot land during the close;
 *  - assert the menu actually opened and click again if it did not, because
 *    the swallow is a race and losing it once does not mean losing it twice.
 */
export async function openMenu(page: Page, name: MenuName): Promise<void> {
  await expect(page.locator(OPEN_MENU)).toHaveCount(0);
  await expect(async () => {
    await page.getByRole("menuitem", { name, exact: true }).click();
    await expect(page.locator(OPEN_MENU)).toHaveCount(1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
}

/** Close whatever menubar menu is open, and wait until it is gone. */
export async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.locator(OPEN_MENU)).toHaveCount(0);
}
