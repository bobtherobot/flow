import type { Locator, Page } from "@playwright/test";

/**
 * Drag a rail's tear-off grip by mouse, from wherever it currently is to
 * `(toX, toY)`.
 *
 * Takes the rail's own locator, not the grip directly — each rail (toolbar,
 * shapebar) has its own grip, so resolving `.flow-toolbar__grip` in here once
 * keeps every call site from re-deriving it.
 *
 * Moves to the grip's bounding-box centre and drags by raw mouse events
 * rather than Playwright's `.hover()` + drag pattern: the grip glyph is
 * `pointer-events: none` (a drag started on it falls through to the topbar's
 * own drag surface), which makes `.hover()`'s actionability check spin
 * forever waiting for the grip itself to receive pointer events.
 */
export async function dragGrip(page: Page, rail: Locator, toX: number, toY: number): Promise<void> {
  const grip = rail.locator(".flow-toolbar__grip");
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(toX, toY, { steps: 10 });
  await page.mouse.up();
}

/**
 * A tool button in either of flow's rails, by exact accessible name.
 *
 * Scoped to `.flow-toolbar` rather than to a rail's aria-label: the toolbar
 * ("Tools") and the shapebar ("Shapes") share the class, so one locator spans
 * both and callers don't have to know which rail a tool lives in. Scoping at
 * all matters because quick-actions labels substring-collide with tool labels
 * ("Arrow" is inside "Arrow binding").
 *
 * `exact` matters because the arrow tool is three buttons — "Arrow",
 * "Curved arrow", "Elbow arrow" — and a substring match on "Arrow" hits all
 * three.
 */
export function railButton(page: Page, label: string): Locator {
  return page.locator(".flow-toolbar").getByRole("button", { name: label, exact: true });
}

/** Click a tool in either rail. */
export async function pickTool(page: Page, label: string): Promise<void> {
  await railButton(page, label).click();
}
