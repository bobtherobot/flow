import { test, expect } from "@playwright/test";
import { railButton, dragGrip } from "./helpers/rails";
import { openMenu } from "./helpers/menu";

test.describe("vertical tool bar", () => {
  test("renders docked on the left, below the menu bar", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(5); // flush to the left edge
    expect(box!.y).toBeGreaterThanOrEqual(30); // below the 36px menu bar
  });

  test("selecting a tool marks it active", async ({ page }) => {
    await page.goto("/");
    const line = page.getByRole("toolbar", { name: "Tools" }).getByRole("button", {
      name: "Line",
      exact: true,
    });
    await line.click();
    await expect(line).toHaveAttribute("aria-pressed", "true");
  });

  test("each of the three arrow-shape tools activates the arrow tool", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Shapes" });
    for (const name of ["Arrow", "Curved arrow", "Elbow arrow"]) {
      const btn = rail.getByRole("button", { name, exact: true });
      await btn.click();
      // Only the clicked shape is highlighted (they share the "arrow" tool).
      await expect(btn).toHaveAttribute("aria-pressed", "true");
    }
  });

  test("pressing A repeatedly cycles the highlighted arrow shape and wraps", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Shapes" });
    const sharp = rail.getByRole("button", { name: "Arrow", exact: true });
    const curved = rail.getByRole("button", { name: "Curved arrow", exact: true });
    const elbow = rail.getByRole("button", { name: "Elbow arrow", exact: true });

    // Excalidraw's shortcut handler is bound to the canvas container, so focus it
    // with a harmless selection-tool click before driving the keyboard cycle.
    await page.locator("canvas.interactive").first().click({ position: { x: 200, y: 200 } });

    // First A selects the arrow tool (default shape is round); each further A
    // advances round → elbow → sharp → round (native Excalidraw cycle).
    await page.keyboard.press("a");
    await expect(curved).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(elbow).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(sharp).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("a");
    await expect(curved).toHaveAttribute("aria-pressed", "true"); // wrapped back
  });

  test("View ▸ Show Toolbar hides the rail and persists across reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();

    await openMenu(page, "View");
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
  });

  test("the hamburger hides a tool and the choice persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Frame" })).toBeVisible();

    await page.getByRole("button", { name: "Toolbar options" }).click();
    await page.getByRole("checkbox", { name: "Frame" }).uncheck();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);
  });

  test("the Tools rail's open hamburger menu paints above the docked Shapes rail", async ({
    page,
  }) => {
    // A click-success assertion alone can pass for the wrong reason (e.g. a
    // click landing through an overlapping element by luck of hit-testing
    // order). Assert paint order directly: the menu's own centre point must
    // resolve to something inside .flow-pnl-config, not inside the Shapes
    // rail sitting on top of it.
    await page.goto("/");
    await page.getByRole("button", { name: "Toolbar options" }).click();
    const menu = page.locator(".flow-pnl-config");
    await expect(menu).toBeVisible();
    const box = (await menu.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const topmostIsMenu = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest(".flow-pnl-config") !== null,
      [cx, cy],
    );
    expect(topmostIsMenu).toBe(true);
  });

  test("tearing off the top bar floats the rail", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const before = await rail.boundingBox();

    // Drag from the grip at the top of the header (above the hamburger button).
    const grip = rail.locator(".flow-toolbar__grip");
    const g = await grip.boundingBox();
    await page.mouse.move(g!.x + g!.width / 2, g!.y + g!.height / 2);
    await page.mouse.down();
    await page.mouse.move(g!.x + 220, g!.y + 160, { steps: 8 });
    await page.mouse.up();

    const after = await rail.boundingBox();
    expect(after!.x).toBeGreaterThan(before!.x + 100); // moved right, now floating
  });

  test("View ▸ Reset Layout re-docks the rail and wipes its drag memory", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });

    // Detach and drag the rail far to the right.
    const grip = rail.locator(".flow-toolbar__grip");
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + 400, g.y + 200, { steps: 10 });
    await page.mouse.up();
    expect((await rail.boundingBox())!.x).toBeGreaterThan(300);

    // Reset Layout → docked back at the left edge.
    await openMenu(page, "View");
    await page.getByRole("menuitem", { name: "Reset Layout" }).click();
    expect((await rail.boundingBox())!.x).toBeLessThan(10);

    // Detaching again starts from the default spot, not the old far-right one.
    await page.getByRole("button", { name: "Toolbar options" }).click();
    await page.getByRole("menuitem", { name: "Detach toolbar" }).click();
    expect((await rail.boundingBox())!.x).toBeLessThan(50);
  });

  test("is 44px wide", async ({ page }) => {
    await page.goto("/");
    const box = await page.getByRole("toolbar", { name: "Tools" }).boundingBox();
    expect(Math.round(box!.width)).toBe(44);
  });

  test("lays its tools out identically docked and floating", async ({ page }) => {
    // The regression this refactor exists to prevent: the docked shell is
    // viewport-tall, and the tool grid used to absorb that height while the
    // color footer rode it to the bottom of the screen.
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const grid = rail.locator(".flow-toolbar__tools");
    const color = rail.locator(".flow-toolbar__color");

    const dockedRail = (await rail.boundingBox())!;
    const dockedGrid = (await grid.boundingBox())!;
    const dockedColor = (await color.boundingBox())!;

    // Tear off by the grip, scoped to this rail — the shapebar has a grip of
    // its own (see dragGrip's own comment for why this isn't a plain `.hover()`).
    await dragGrip(page, rail, 400, 300);
    await expect(rail).toHaveCSS("position", "fixed");

    const floatRail = (await rail.boundingBox())!;
    const floatGrid = (await grid.boundingBox())!;
    const floatColor = (await color.boundingBox())!;

    // `.flow-toolbar--docked` carries only a right border; `.flow-toolbar--floating`
    // carries all four (a floating panel legitimately gets a full border). Both
    // shells are box-sizing: border-box with their width/height set inline, so
    // that alone does NOT move the docked outer box relative to
    // `--flow-toolbar-reserved` (border-box makes the declared width authoritative
    // regardless of border count — see toolbar.css's comment on `.flow-toolbar`).
    // What the extra borders DO shift is the top-left origin: a floating shell
    // has a top and a left border where a docked one has neither, so the floating
    // content box starts 1px lower and 1px narrower than the docked one. That 1px
    // is permanent and correct; do not "fix" it by equalising the borders — doing
    // so would paint hairlines against the viewport edges themselves (the docked
    // rail sits flush at x=0/y=36, and its bottom at the viewport floor) with
    // nothing to visually separate them from. Height is the axis the actual bug
    // lived on (534.5 docked vs 196 floating pre-fix), so it is asserted exactly;
    // width and the y-offsets get a ±1px tolerance for the border-origin shift.
    expect(Math.abs(floatGrid.width - dockedGrid.width)).toBeLessThanOrEqual(1);
    expect(Math.round(floatGrid.height)).toBe(Math.round(dockedGrid.height));
    expect(
      Math.abs((floatGrid.y - floatRail.y) - (dockedGrid.y - dockedRail.y)),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs((floatColor.y - floatRail.y) - (dockedColor.y - dockedRail.y)),
    ).toBeLessThanOrEqual(1);
  });

  test("the rail color popup does not blanket the docked shapebar", async ({ page }) => {
    // Regression test: the popup used to anchor off the color control's own
    // (~43px) right edge, which docked put its 280px-wide body squarely over
    // the docked shapebar's entire x=44..124 span, leaving only a ~4px sliver
    // of it clickable. Prove a shape tool is actually reachable through it —
    // a click landing "successfully" by luck of hit-testing order would not
    // catch this, so assert the tool actually activates.
    await page.goto("/");
    await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
    await expect(page.locator(".flow-clr-popup")).toBeVisible();

    const rect = railButton(page, "Rectangle");
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
  });
});
