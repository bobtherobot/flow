# Cmd/Ctrl Modifier Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Cmd/Ctrl mean exactly one thing on flow's canvas — the temporary selection tool — so shift-click extends a selection during the override, and a held modifier no longer flips object or grid snapping.

**Architecture:** flow reserves Cmd/Ctrl for a temporary selection tool, but upstream Excalidraw reserves the same modifier for a deep-select/group-drill gesture and for two independent snap overrides. Because flow's override means the modifier is held for the whole interaction, those upstream behaviours are permanently on during selection work. This plan removes the three colliding canvas-gesture meanings across **17 sites in 2 vendor files**. There are **no flow-side source changes** — flow's behaviour changes because the fork stops fighting it.

**Tech Stack:** TypeScript, Excalidraw fork as a git submodule at `vendor/excalidraw` (branch `flow-next`), Playwright for e2e. No unit-testable surface: every change is inside vendor canvas pointer paths.

**Spec:** [docs/superpowers/specs/2026-08-15-cmd-modifier-semantics-design.md](../specs/2026-08-15-cmd-modifier-semantics-design.md)

## Global Constraints

- **On the canvas, Cmd/Ctrl means only "temporary selection tool."** Every Cmd/Ctrl *keyboard shortcut* (`Cmd+Z`, `Cmd+V`, `Cmd+A`, …) is untouched.
- **Group drilling on Cmd-click is KEPT**, not removed. This was an explicit product decision with "remove it, drill via double-click" on the table.
- **Deselection on Cmd+Shift+click must NOT be implemented at pointerdown.** Upstream owns it at pointerup (`App.tsx:12222-12226`), gated on `!drag.hasOccurred` so shift+drag moves instead of deselecting. Implementing it twice double-toggles.
- **The frame invariant must hold:** a frame and its children are never selected together. Reuse the exported `excludeElementsInFramesFromSelection`; do not duplicate the normal path's ~40 lines.
- **Every one of the 17 edited sites carries a `flow:` comment**, so a future upstream replay can `grep -n "flow:"` and find them all.
- **`App.tsx:9174` is a compound guard** — remove only the `event[KEYS.CTRL_OR_CMD] ||` term. Elbow arrows keep their own grid bypass.
- **Out of scope, do not touch:** marquee select-through (`withCmdOrCtrl` at `App.tsx:9169`), the `Cmd+Alt` lasso gesture, Cmd-on-dblclick text binding (`App.tsx:7189`), the snapping UI/toggles/`Alt+S`, and `objectsSnapModeEnabled`'s persistence.
- Line numbers are as of fork commit `1831bf76` — a starting point for search, **not a contract**. Match each site by its surrounding code.

## Vendor Build Mechanics (applies to every fork task)

After **any** `vendor/excalidraw` edit, in this order:

```bash
npm run build:excalidraw
rm -rf node_modules/.vite
pkill -f "vite" || true
```

- `rm -rf node_modules/.vite` is **mandatory**, not hygiene. Playwright's `webServer.reuseExistingServer` plus an uninvalidated Vite pre-bundle cache for the `file:`-linked fork package will keep serving a **stale bundle** after a rebuild, making a correct fix look broken. This is recorded in the [[tool-override]] memory as having already burned this feature once.
- Run `pkill` as its **own** command, never in a compound with the test run — the pattern `vite` matches the invoking shell's own command line and kills it (exit 144).
- The [[tool-override]] memory claims `npm run build:excalidraw` exits 1 on a pre-existing `restore.ts` type error. **That note is stale** — the fork moved 382 commits in the 2026-08-11 upgrade and the build has exited 0 on every recent run. If it exits non-zero, stop and report rather than assuming it is the known-stale failure.

Submodule and parent are separate repos. Commit inside `vendor/excalidraw` first, then `git add vendor/excalidraw` in the parent to advance the gitlink. Verify with `git ls-tree HEAD vendor/excalidraw` against `git -C vendor/excalidraw rev-parse HEAD` — a stale gitlink is the classic failure here.

---

### Task 1: Shift-aware Cmd-click (Part A)

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/components/App.tsx:9548-9573`
- Test: `e2e/tool-override.spec.ts` (append 3 tests)

**Interfaces:**
- Consumes: `excludeElementsInFramesFromSelection` and `makeNextSelectedElementIds`, both **already imported** by `App.tsx` (lines 219 and 221 respectively). `editGroupForSelectedElement` is imported at line 210 and stays in use for the non-shift path.
- Produces: no new exports. Behaviour only.

**Signatures you will need:**
- `excludeElementsInFramesFromSelection<T extends ExcalidrawElement>(selectedElements: readonly T[]): T[]` — "given selected elements, if there are frames and their containing elements, keep only the frames" (`packages/element/src/selection.ts:54`).
- `makeNextSelectedElementIds(nextSelectedElementIds, prevState)` — see existing uses at `App.tsx:4241`, `4405`, `4419`.
- `this.scene.getElement(id)` returns `ExcalidrawElement | null`.

- [ ] **Step 1: Write the failing e2e tests**

Append to `e2e/tool-override.spec.ts`. The file already provides `BOX`, `BOX_EDGE`, `readState`, `selectedCount`, `drawBox`, and a `beforeEach` that navigates and waits for the Tools toolbar.

```ts
/** A second box, clear of BOX, drawn the same way. Its left edge is the hit
 *  target for the same transparent-fill reason BOX_EDGE exists. */
const BOX2 = [700, 300, 820, 380] as const;
const BOX2_EDGE = [700, 340] as const;

async function drawSecondBox(page: Page) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(BOX2[0], BOX2[1]);
  await page.mouse.down();
  await page.mouse.move(BOX2[2], BOX2[3], { steps: 8 });
  await page.mouse.up();
}

test("modifier + shift-click adds a second element to the selection", async ({ page }) => {
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);

  await page.keyboard.down("Shift");
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(() => selectedCount(page)).toBe(2);
});

test("modifier + shift-click on an already-selected element removes it", async ({ page }) => {
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await page.keyboard.down("Shift");
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(2);

  // Clicking the second one again with shift still held takes it back out.
  // This proves the pointerup deselect path still owns deselection and that
  // pointerdown did not also toggle (which would net out to no change).
  await page.mouse.click(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(() => selectedCount(page)).toBe(1);
});

test("modifier + shift-drag moves the selection instead of deselecting", async ({ page }) => {
  await drawBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);

  const before = await page.evaluate(
    () => (window as unknown as { h: { elements: { x: number }[] } }).h.elements[0].x,
  );

  await page.keyboard.down("Shift");
  await page.mouse.move(BOX_EDGE[0], BOX_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 60, BOX_EDGE[1], { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  await page.keyboard.up("ControlOrMeta");

  // Still selected (not deselected by the shift), and actually moved.
  await expect.poll(() => selectedCount(page)).toBe(1);
  const after = await page.evaluate(
    () => (window as unknown as { h: { elements: { x: number }[] } }).h.elements[0].x,
  );
  expect(after).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run the tests to verify the first one FAILS**

```bash
pkill -f "vite" || true
```

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list
```

Expected: **"modifier + shift-click adds a second element to the selection" FAILS** with `selectedCount` of 1 rather than 2 — the deep-select branch replaced the selection instead of extending it. The other two may pass or fail; only the first is the guaranteed RED. **If the first test passes, stop and report** — the premise of this task is wrong and must be re-diagnosed before editing the fork.

- [ ] **Step 3: Make the fork edit**

In `vendor/excalidraw/packages/excalidraw/components/App.tsx`, inside the `if (event[KEYS.CTRL_OR_CMD]) {` block, **after** the `event.altKey` lasso sub-branch and **after** the existing `wasAddedToSelection` assignment, insert the shift sub-branch **before** the existing unconditional `this.setState(...)`:

```ts
            if (!this.state.selectedElementIds[hitElement.id]) {
              pointerDownState.hit.wasAddedToSelection = true;
            }
            // flow: honour shift here so the modifier-held selection tool
            // extends a selection the way the real selection tool does.
            // Upstream replaced the selection unconditionally at this point,
            // which swallowed shift entirely (the branch returns before the
            // shift-aware path below is ever reached).
            //
            // Deselection is deliberately NOT handled here: the pointerup path
            // further down owns it, gated on !drag.hasOccurred so that
            // shift+DRAG moves the selection instead of deselecting it.
            // Toggling here as well would double-toggle.
            if (event.shiftKey) {
              if (!this.state.selectedElementIds[hitElement.id]) {
                this.setState((prevState) => {
                  const nextIds: Record<string, true> = {
                    ...prevState.selectedElementIds,
                    [hitElement.id]: true,
                  };
                  const nextElements: ExcalidrawElement[] = [];
                  Object.keys(nextIds).forEach((id) => {
                    const el = this.scene.getElement(id);
                    if (el) {
                      nextElements.push(el);
                    }
                  });
                  // Keep the "a frame and its children are never selected
                  // together" invariant the normal selection path maintains.
                  const kept =
                    excludeElementsInFramesFromSelection(nextElements);
                  return {
                    editingGroupId: hitElement.groupIds.length
                      ? hitElement.groupIds[0]
                      : null,
                    selectedGroupIds: {},
                    selectedElementIds: makeNextSelectedElementIds(
                      kept.reduce(
                        (acc: Record<string, true>, element) => {
                          acc[element.id] = true;
                          return acc;
                        },
                        {} as Record<string, true>,
                      ),
                      prevState,
                    ),
                    previousSelectedElementIds: this.state.selectedElementIds,
                  };
                });
              }
              // mark as not completely handled so as to allow dragging etc.
              return false;
            }
            this.setState((prevState) => ({
              ...editGroupForSelectedElement(prevState, hitElement),
              previousSelectedElementIds: this.state.selectedElementIds,
            }));
            // mark as not completely handled so as to allow dragging etc.
            return false;
```

The `event.altKey` lasso sub-branch above and the final two statements are byte-identical to upstream. `ExcalidrawElement` is already an imported type in this file — verify before adding an import; do not add a duplicate.

- [ ] **Step 4: Rebuild the vendor package and clear the stale bundle cache**

```bash
npm run build:excalidraw
```

Expected: exit 0.

```bash
rm -rf node_modules/.vite
```

```bash
pkill -f "vite" || true
```

- [ ] **Step 5: Run the spec to verify all three pass**

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list
```

Expected: PASS, all tests in the file including the 6 pre-existing ones.

- [ ] **Step 6: Prove non-flakiness**

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --repeat-each=3 --reporter=list
```

Expected: all PASS.

- [ ] **Step 7: Commit both repos**

```bash
git -C vendor/excalidraw add packages/excalidraw/components/App.tsx
git -C vendor/excalidraw commit -m "flow: honour shift in the cmd/ctrl deep-select branch"
git add vendor/excalidraw e2e/tool-override.spec.ts
git commit -m "fix(selection): let shift extend the selection during the cmd/ctrl override"
```

Verify the gitlink advanced:

```bash
git ls-tree HEAD vendor/excalidraw && git -C vendor/excalidraw rev-parse HEAD
```

Expected: the two SHAs match.

---

### Task 2: Cmd/Ctrl stops inverting object snapping (Part B1)

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/snapping.ts:162-192`
- Test: `e2e/tool-override.spec.ts` (append 1 test)

**Interfaces:**
- Consumes: `BOX2`, `BOX2_EDGE`, and `drawSecondBox(page)` — **added to `e2e/tool-override.spec.ts` by Task 1**. Task 1 must land first; do not redefine them.
- Produces: `snapLineCount(page)` and `ensureObjectSnapOff(page)` in the same spec file, both reusable by later tests.

Today `isSnappingEnabled` **inverts** `objectsSnapModeEnabled` while the modifier is held — it does not merely enable it. With flow's override the modifier is held for every selection interaction, so snapping is permanently the opposite of what the toggle says.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/tool-override.spec.ts`:

```ts
/** Read how many object-snap guide lines the canvas is currently showing. */
const snapLineCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { snapLines?: unknown[] } } }).h
        ?.state?.snapLines?.length ?? 0,
  );

/** Turn "Snap to Objects" off via the real View menu if it is currently on. */
async function ensureObjectSnapOff(page: Page) {
  const enabled = await page.evaluate(
    () =>
      (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
        .h?.state?.objectsSnapModeEnabled ?? false,
  );
  if (!enabled) {
    return;
  }
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Snap to Objects" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { h?: { state?: { objectsSnapModeEnabled?: boolean } } })
            .h?.state?.objectsSnapModeEnabled ?? false,
      ),
    )
    .toBe(false);
}

test("holding the modifier does not turn object snapping on", async ({ page }) => {
  await ensureObjectSnapOff(page);
  await drawBox(page);
  await drawSecondBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  // Grab the second box with the modifier held and drag it until its edges are
  // near the first box's — the alignment that would produce snap guides.
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.move(BOX2_EDGE[0], BOX2_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 2, BOX_EDGE[1] + 2, { steps: 12 });

  // Snap mode is OFF, so no guides may appear regardless of the held modifier.
  expect(await snapLineCount(page)).toBe(0);

  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");
});
```

- [ ] **Step 2: Run it to verify it FAILS**

```bash
pkill -f "vite" || true
```

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list -g "does not turn object snapping on"
```

Expected: **FAIL** — `snapLineCount` is greater than 0, because the held modifier inverted the off toggle into on. **If it passes, stop and report** rather than editing the fork.

- [ ] **Step 3: Make the fork edit**

In `vendor/excalidraw/packages/excalidraw/snapping.ts`, inside `isSnappingEnabled`, replace the `if (event)` block's return expression:

```ts
  if (event) {
    // Allow snapping for lasso tool when dragging selected elements
    // but not during lasso selection phase
    const isLassoDragging =
      app.state.activeTool.type === "lasso" &&
      app.state.selectedElementsAreBeingDragged;

    // flow: upstream inverted objectsSnapModeEnabled while cmd/ctrl was held.
    // flow reserves that modifier for its temporary selection tool, so the
    // modifier is held for whole interactions and the inversion made snapping
    // permanently the opposite of what the toggle said. Snapping now follows
    // the explicit toggles only (View ▸ Snap to Objects, the quickbar toggle,
    // Alt+S). The lasso guard is upstream's and is kept.
    return (
      (app.state.activeTool.type !== "lasso" || isLassoDragging) &&
      app.state.objectsSnapModeEnabled
    );
  }
```

Leave everything else in the function untouched, including the arrow-binding early return and the final `return app.state.objectsSnapModeEnabled;` — that tail now agrees with this branch rather than contradicting it. `isGridModeEnabled` may become unused **in this function** but is exported and used elsewhere in the file; do not delete it. If `tsc` reports it as an unused *import*, stop and report rather than deleting a shared export.

- [ ] **Step 4: Rebuild and clear the cache**

```bash
npm run build:excalidraw
```

Expected: exit 0.

```bash
rm -rf node_modules/.vite
```

```bash
pkill -f "vite" || true
```

- [ ] **Step 5: Run the spec to verify it passes**

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list
```

Expected: PASS, whole file.

- [ ] **Step 6: Manually confirm the toggle still works**

Snapping must still be reachable — this task removes the modifier override, not the feature.

```bash
npx playwright test e2e/quickbar.spec.ts --workers=1 --reporter=list
```

Expected: PASS. This spec exercises the quickbar toggles including snap. If it has no snap coverage, additionally verify by hand that View ▸ Snap to Objects turns guides back on.

- [ ] **Step 7: Commit both repos**

```bash
git -C vendor/excalidraw add packages/excalidraw/snapping.ts
git -C vendor/excalidraw commit -m "flow: stop cmd/ctrl inverting object snap mode"
git add vendor/excalidraw e2e/tool-override.spec.ts
git commit -m "fix(snapping): object snap follows its toggle, not the held modifier"
```

```bash
git ls-tree HEAD vendor/excalidraw && git -C vendor/excalidraw rev-parse HEAD
```

Expected: the two SHAs match.

---

### Task 3: Cmd/Ctrl stops bypassing grid snapping (Part B2)

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/components/App.tsx` — 15 sites
- Test: `e2e/tool-override.spec.ts` (append 1 test)

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: no new exports. Behaviour only.

All 15 sites express "while cmd/ctrl is held, do not snap to the grid", in three syntactic shapes. Line numbers are as of fork commit `1831bf76` and will have shifted by Task 1's insertion — **match by surrounding code, not by line number.**

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/tool-override.spec.ts`:

```ts
/** Turn grid mode on via the real View menu. */
async function enableGridMode(page: Page) {
  await page.getByRole("menuitem", { name: "View" }).click();
  await page.getByRole("menuitemcheckbox", { name: "Grid", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { h?: { state?: { gridModeEnabled?: boolean } } }).h
            ?.state?.gridModeEnabled ?? false,
      ),
    )
    .toBe(true);
}

test("holding the modifier does not bypass grid snapping", async ({ page }) => {
  await enableGridMode(page);
  await drawBox(page);
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  // Drag by a deliberately non-grid-multiple offset with the modifier held.
  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);
  await page.mouse.move(BOX_EDGE[0], BOX_EDGE[1]);
  await page.mouse.down();
  await page.mouse.move(BOX_EDGE[0] + 47, BOX_EDGE[1] + 33, { steps: 10 });
  await page.mouse.up();
  await page.keyboard.up("ControlOrMeta");

  const { x, y, gridSize } = await page.evaluate(() => {
    const h = (
      window as unknown as {
        h: { elements: { x: number; y: number }[]; state: { gridSize: number } };
      }
    ).h;
    return { x: h.elements[0].x, y: h.elements[0].y, gridSize: h.state.gridSize };
  });

  // The drop position must land on the grid despite the held modifier.
  expect(x % gridSize).toBe(0);
  expect(y % gridSize).toBe(0);
});
```

- [ ] **Step 2: Run it to verify it FAILS**

```bash
pkill -f "vite" || true
```

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list -g "does not bypass grid snapping"
```

Expected: **FAIL** — `x % gridSize` is non-zero because the held modifier passed `null` as the grid size. **If it passes, stop and report.**

- [ ] **Step 3: Edit the 9 inline sites**

Each currently reads exactly:

```ts
        event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize(),
```

Give the **first** one the full rationale:

```ts
        // flow: cmd/ctrl no longer bypasses grid snap (it is flow's selection-
        // tool modifier, held for whole interactions, so the bypass was always
        // on while selecting). Grid snap follows View ▸ Grid alone. Same edit at
        // every other getEffectiveGridSize call site in this file.
        this.getEffectiveGridSize(),
```

and the remaining **eight** a one-liner, so the file does not carry nine copies of the same paragraph:

```ts
        // flow: cmd/ctrl no longer bypasses grid snap.
        this.getEffectiveGridSize(),
```

They were at lines 10167, 10596, 10682, 11079, 13362, 13455, 13484, 13565, 13596 before Task 1. Find them all with:

```bash
grep -n "KEYS.CTRL_OR_CMD\] ? null" vendor/excalidraw/packages/excalidraw/components/App.tsx
```

Expected before the edit: 9 matches. Expected after: 0.

- [ ] **Step 4: Edit the 5 multiline `lastPointerDownEvent` sites**

Each currently reads:

```ts
      this.lastPointerDownEvent?.[KEYS.CTRL_OR_CMD]
        ? null
        : this.getEffectiveGridSize(),
```

Replace each with:

```ts
      // flow: cmd/ctrl no longer bypasses grid snap.
      this.getEffectiveGridSize(),
```

They were at lines 9905, 9945, 9998, 10391, 10475 before Task 1. Find them with:

```bash
grep -n "lastPointerDownEvent?.\[KEYS.CTRL_OR_CMD\]" vendor/excalidraw/packages/excalidraw/components/App.tsx
```

Expected before the edit: 5 matches. Expected after: 0.

- [ ] **Step 5: Edit the 1 compound site**

This one is different — **do not collapse it fully.** It currently reads:

```ts
          event[KEYS.CTRL_OR_CMD] || isElbowArrowOnly
            ? null
            : this.getEffectiveGridSize(),
```

Replace with:

```ts
          // flow: dropped the `event[KEYS.CTRL_OR_CMD] ||` term — cmd/ctrl no
          // longer bypasses grid snap. Elbow arrows keep their own bypass.
          isElbowArrowOnly ? null : this.getEffectiveGridSize(),
```

It was at line 9174 before Task 1, inside the object literal that also sets `withCmdOrCtrl: event[KEYS.CTRL_OR_CMD]`. **Leave `withCmdOrCtrl` alone** — it feeds marquee select-through on pointerup and is explicitly out of scope.

- [ ] **Step 6: Verify no grid-bypass site was missed**

```bash
grep -n "getEffectiveGridSize" vendor/excalidraw/packages/excalidraw/components/App.tsx
```

Expected: every remaining occurrence is either an unguarded call or the `isElbowArrowOnly` ternary from Step 5. **No occurrence may still be guarded by `CTRL_OR_CMD`.** Confirm with:

```bash
grep -n -B2 "getEffectiveGridSize" vendor/excalidraw/packages/excalidraw/components/App.tsx | grep "CTRL_OR_CMD"
```

Expected: no output.

- [ ] **Step 7: Rebuild and clear the cache**

```bash
npm run build:excalidraw
```

Expected: exit 0.

```bash
rm -rf node_modules/.vite
```

```bash
pkill -f "vite" || true
```

- [ ] **Step 8: Run the spec to verify it passes**

```bash
npx playwright test e2e/tool-override.spec.ts --workers=1 --reporter=list
```

Expected: PASS, whole file.

- [ ] **Step 9: Run the grid specs, which are the most likely collateral**

```bash
npx playwright test e2e/grid-size.spec.ts e2e/grid-color.spec.ts e2e/shapes.spec.ts --workers=1 --reporter=list
```

Expected: PASS.

- [ ] **Step 10: Commit both repos**

```bash
git -C vendor/excalidraw add packages/excalidraw/components/App.tsx
git -C vendor/excalidraw commit -m "flow: stop cmd/ctrl bypassing grid snap (15 sites)"
git add vendor/excalidraw e2e/tool-override.spec.ts
git commit -m "fix(snapping): grid snap follows its toggle, not the held modifier"
```

```bash
git ls-tree HEAD vendor/excalidraw && git -C vendor/excalidraw rev-parse HEAD
```

Expected: the two SHAs match.

---

### Task 4: Full-suite verification

**Files:** none modified — this task is a gate.

The [[tool-override]] memory records that changing selection semantics on this exact feature previously took down **29 e2e tests across 9 spec files**, because many specs' draw helpers encode selection assumptions. Tasks 1-3 change both selection and snapping behaviour, so this gate is required, not a formality.

- [ ] **Step 1: Confirm no stale bundle**

```bash
rm -rf node_modules/.vite
```

```bash
pkill -f "vite" || true
```

- [ ] **Step 2: Typecheck and unit suite**

```bash
npm run typecheck && npx vitest run
```

Expected: typecheck clean (zero errors); all unit suites green. No unit test should have changed — these are vendor canvas paths.

- [ ] **Step 3: Full e2e serially**

```bash
npx playwright test --workers=1 --reporter=list
```

Expected: the **only** failures are the 2 documented pre-existing `e2e/text-panel.spec.ts` padding failures. Do not run at the default 8 workers for this gate — this machine produces environmental flakes in unrelated specs at that concurrency, which will obscure real regressions.

- [ ] **Step 4: If anything else failed, triage before proceeding**

For each unexpected failure, determine whether it is:
- a **real regression** from Tasks 1-3 (fix it, then re-run this task), or
- a **flake** — prove it by running that spec alone (`npx playwright test <spec> --workers=1`) and re-running the full suite once. A failure that does not reproduce in either is a flake; record which spec and move on.

Do not proceed to Task 5 with an untriaged failure.

- [ ] **Step 5: Commit if any fixes were needed**

```bash
git add -A
git commit -m "test(e2e): update specs for the cmd/ctrl modifier semantics change"
```

If no fixes were needed, skip this step.

---

### Task 5: Record it in project memory

**Files:**
- Modify: `.claude/memory/tool-override.md`
- Modify: `.claude/memory/MEMORY.md`

This change belongs in the existing [[tool-override]] memory rather than a new file — it is the third edit in the same collision family and its value is in the pattern, not the individual fix.

- [ ] **Step 1: Append a new section to `.claude/memory/tool-override.md`**

Add a section titled `## Cmd/Ctrl means one thing (2026-08-15)` covering:

- **The pattern, stated once and plainly:** flow reserves Cmd/Ctrl for a temporary selection tool, so the modifier is held for whole interactions. Every upstream behaviour gated on that modifier is therefore permanently on during selection work rather than being an opt-in gesture. Three have now been found and removed — drag suppression (2026-08-14), deep-select swallowing shift, and the two snap overrides. **Anyone finding a fourth should expect it to look like "feature X is always on while selecting."**
- The exact fix in each of the three parts, with file and function names.
- **That deselection stays at pointerup on purpose** (`App.tsx`, gated on `!drag.hasOccurred`), and that implementing it at pointerdown too would double-toggle. This is the single most likely thing for a future editor to "tidy" into a bug.
- **That group drilling on Cmd-click was deliberately kept**, with double-click drilling available as the alternative that was considered and not taken.
- **The fork footprint change:** this is the first deletion-shaped work on this feature, 17 sites across `App.tsx` and `snapping.ts`, all `flow:`-commented so a replay can `grep -n "flow:"` them. Note the diff roughly doubled and that the cost was accepted knowingly.
- **The `App.tsx:9174` compound-guard exception** — `isElbowArrowOnly` keeps its own grid bypass; only the Cmd term was dropped.
- Anything that actually went wrong during implementation.

Update the memory's `**Status:**` line at the top so a future reader knows this section exists.

- [ ] **Step 2: Update the index line in `.claude/memory/MEMORY.md`**

The existing `- [Tool override](tool-override.md) — …` line ends with the 2026-08-07 work. Extend it, in the style of the other multi-pass entries in that file (see the Color system and Parametric shapes lines), with a sentence noting the 2026-08-15 pass: Cmd/Ctrl reduced to one canvas meaning, shift-select fixed during the override, snap overrides removed, 17-site deletion-shaped fork edit.

- [ ] **Step 3: Commit**

```bash
git add .claude/memory/tool-override.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record the cmd/ctrl modifier semantics change"
```

---

## Verification Checklist

Before calling this done:

- [ ] `npm run typecheck` clean
- [ ] `npx vitest run` — all unit suites green, none changed
- [ ] `npx playwright test --workers=1` — only the 2 pre-existing `text-panel.spec.ts` failures
- [ ] `grep -n -B2 "getEffectiveGridSize" vendor/excalidraw/packages/excalidraw/components/App.tsx | grep "CTRL_OR_CMD"` — no output
- [ ] `git ls-tree HEAD vendor/excalidraw` matches `git -C vendor/excalidraw rev-parse HEAD`
- [ ] Manual: hold Cmd/Ctrl, shift-click two shapes — both selected; shift-drag them — they move together
- [ ] Manual: with Snap to Objects OFF, hold Cmd/Ctrl and drag — no align guides appear
- [ ] Manual: with Grid ON, hold Cmd/Ctrl and drag — the element still lands on the grid
- [ ] Manual: `Cmd+Z`, `Cmd+A`, `Cmd+V` all still work
