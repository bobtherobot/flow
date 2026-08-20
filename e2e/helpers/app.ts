import { expect, type Page } from "@playwright/test";

/**
 * Wait until the app is actually usable — not merely painted.
 *
 * flow mounts in **two phases**, and that gap is the root cause of a whole
 * family of "flaky" e2e failures. Measured on this machine, right after
 * `page.goto("/")` resolves:
 *
 * | milestone                        | t     |
 * | -------------------------------- | ----- |
 * | flow's `toolbar[name="Tools"]`   | ~0ms  |
 * | `window.h` exists                | ~0ms  |
 * | `h.state` / `h.app.scene`        | ~160ms|
 * | `canvas.interactive`             | ~160ms|
 *
 * So flow's own chrome — rails, menubar, panels — is up immediately, while
 * Excalidraw mounts ~160ms later. Two traps follow, and the suite hit both:
 *
 *  - **`window.h` is truthy long before it is useful.** It exists as an empty
 *    shell at t=0, so `window.h?.state?.x` yields `undefined` rather than
 *    throwing, and an assertion reads a silent wrong answer. This is what made
 *    `tool-override`'s "tool lock is on from the first paint" fail with
 *    `expected true, received undefined`.
 *  - **Waiting for flow's toolbar proves nothing about Excalidraw.** It is
 *    satisfied at t=0. A spec that gates on it and then draws on the canvas is
 *    racing a ~160ms window; the pointer events land before Excalidraw is
 *    listening, no element is created, and a later
 *    `scene.getNonDeletedElements().at(-1)` is `undefined`. That is exactly
 *    how `shapes.spec.ts` failed.
 *
 * Gating on `h.app.scene` covers both, because it is the last of the three to
 * arrive and it is the object the specs actually read.
 */
export async function waitForApp(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { h?: { app?: { scene?: unknown } } }).h?.app?.scene),
    null,
    { timeout: 30_000 },
  );
  await expect(page.locator("canvas.interactive")).toBeVisible();
}

/** `page.goto("/")` plus the readiness wait above. Use this, not a bare goto. */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
  await waitForApp(page);
}

/** `page.reload()` plus the readiness wait. A reload re-runs both mount phases,
 *  so it reopens the same window a fresh `goto` does. */
export async function reloadApp(page: Page): Promise<void> {
  await page.reload();
  await waitForApp(page);
}
