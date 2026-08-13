import type { Locator, Page } from "@playwright/test";

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
