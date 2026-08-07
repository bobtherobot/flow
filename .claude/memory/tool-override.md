# Tool override (hold Cmd/Ctrl for selection)

Illustrator-style temporary tool override plus a permanently-on tool lock.
Spec/plan: `docs/superpowers/specs/2026-08-07-tool-override-design.md`,
`docs/superpowers/plans/2026-08-07-tool-override.md`. Branch `feat/tool-override`.

**Status: shipped.** Unit suite green (631/631), e2e fully green. A regression
was found mid-branch (forcing the tool lock on silently killed auto-select-on-
draw app-wide), root-caused, fixed with a deliberate two-site fork edit, and
the four e2e tests it took down were updated to the new workflow. See "The
regression and its fix" below — this is the highest-value section for anyone
touching this feature again.

## Shipped
- `src/ui/toolbar/tool-override.ts` — pure: `overrideKeyFor(platform)` (Meta on
  Apple, Control elsewhere — mirrors the vendor's `KEYS.CTRL_OR_CMD` at
  `vendor/excalidraw/packages/excalidraw/keys.ts:38`, and its `isDarwin`
  platform test at `constants.ts:5`; deliberately NOT "either key" because
  macOS Control is right-click emulation) and `canEngage(state, target)`.
- `src/ui/toolbar/useToolOverride.ts` — two effects: (1) capture-phase
  keydown/keyup on `window` + blur/visibilitychange, engaging the selection
  tool and restoring on release; (2) an `onChange` normalizer re-asserting
  `activeTool.locked === true`. Mounted from `App.tsx` (`useToolOverride(excalidrawApi)`);
  `initialData.appState` seeds `activeTool: {type:"selection", customType:null,
  locked:true, lastActiveTool:null}`.
- Tool-lock UI removed from all three surfaces: rail padlock (`ToolBar.tsx`,
  `LOCK_ID` gone from `tools.ts`), quick-actions toggle (`quickbar/actions.ts`),
  View ▸ Tool Lock (`MenuBar.tsx`, `useViewToggles.ts`). Native `Q` still fires
  and the normalizer undoes it.
- `TOOL_ICONS` narrowed from a partial map to `Record<ToolId, ReactNode>` in
  `src/ui/toolbar/icons.tsx` once `LOCK_ID` was gone — see task-order note below.

## Key facts / gotchas
- **ZERO fork edits for the override mechanism itself.** Everything routes
  through `setActiveTool` / `getAppState` / `updateScene` / `onChange`. (The
  *lock decoupling* below did need a fork edit — see next section.)
- **The restore is two calls, in this order.** `setActiveTool` gives the right
  cursor but clears the selection for any non-selection tool (vendor
  `App.tsx`, the `nextActiveTool.type !== "selection"` guard inside
  `setActiveTool`'s state updater); the follow-up `updateScene({appState:
  {selectedElementIds, selectedGroupIds, editingGroupId}})` puts it back.
  Selection is read FRESH at release — an engage-time snapshot would clobber
  an undo made mid-hold.
- **Never `setActiveTool({type:"image"})` from this feature** — it re-fires
  `onImageAction` and re-opens the OS file picker (vendor `App.tsx:4741`,
  inside `setActiveTool`'s `if (nextActiveTool.type === "image")` branch).
  Both the engage guard (`canEngage`) and the lock normalizer skip the image
  tool for this reason.
- **Don't engage mid-gesture.** The vendor reads Cmd during a drag to bypass
  grid snapping and to close elbow arrows, so `canEngage` bails on
  `cursorButton === "down"`, `newElement`, and `multiElement`.
- Related: [[vertical-toolbar]] (the rail this padlock left),
  [[quick-actions-bar]], [[view-menu-toggles]].

## The regression, and its fix

Forcing `activeTool.locked` permanently true (the whole point of this feature)
turned out to gate **two** independent upstream behaviours behind one flag,
not one:

1. "Revert the tool to Selection after drawing" — the behaviour flow wanted
   off.
2. "Auto-select the element you just drew" — a behaviour nobody had noticed
   was bundled in, and flow did **not** want off.

Read directly from `vendor/excalidraw/packages/excalidraw/components/App.tsx`
before the fix: the generic-element pointerup path only added the drawn
element to `selectedElementIds` inside an `if (!activeTool.locked && ...)`
block, and the linear-element path had the identical split — locked skipped
straight to `{ newElement: null }` with no selection update at all. Locking
the tool permanently silently killed auto-select app-wide. This surfaced as
**29 e2e failures across 9 spec files** in Task 8's full-suite run (every
affected spec's own draw helper carried a comment stating the now-false "ends
up selected" assumption) — not caught by the feature's own e2e coverage,
which never draws-then-asserts-selected through a panel.

**Fixed with a deliberate two-site fork edit** in that same `App.tsx`,
decoupling "stay locked" from "get selected":
- **Shape site**: dropped the `!activeTool.locked &&` clause from the
  auto-select `if`, so a drawn shape is now selected regardless of lock state.
- **Linear-element site**: the `if (!activeTool.locked)` branch (revert to
  Selection + open the point editor) was left **byte-identical to upstream**;
  only the `else` branch gained a `selectedElementIds` update. Deliberately
  does **not** set `selectedLinearElement` there — that would open the linear
  point editor while the arrow tool is still active, which is only correct
  once the tool has actually reverted to Selection.

Submodule commit `vendor/excalidraw@a9dcdb6f` ("fix: decouple
auto-select-on-draw from the tool lock"); flow pointer bump `ca1ab3e`.

**Second, deeper consequence — by design, not a bug:** because the tool no
longer reverts after a draw, a plain click while a drawing tool is active no
longer selects anything — it starts a new shape. Reaching the selection tool
is now an explicit act (the rail button, or the Cmd/Ctrl hold itself). Four
e2e tests had encoded the old auto-revert workflow and needed updating, not
just the 29 from the direct regression:
- `e2e/selection-mode.spec.ts` — a plain click after drawing no longer
  deselects; a marquee drag while a drawing tool is still active draws a new
  shape instead of marquee-selecting.
- `e2e/style-memory.spec.ts` — same click-while-a-drawing-tool-is-active
  issue.
- `e2e/text-panel.spec.ts` (2 tests) — a downstream symptom of the same
  cause: vendor's `handleCanvasDoubleClick` only adds bound text when
  `activeTool.type === "selection"`, so with Rectangle still locked active,
  the double-click silently no-op'd and a later test helper crashed reading
  properties off the nonexistent text element.

All four were fixed in `3637fdd` by inserting an explicit switch to the
Selection tool at the point that used to rely on auto-revert, with no
assertion weakened — verified by diffing that zero `expect(...)` lines
changed, only setup/mechanics. A fifth test in the same file,
`selection-mode.spec.ts`'s `"marquee touch selects an element the rectangle
only intersects"` (not on the original failing list), turned out to be
passing by coincidence under the old assumption and was fixed alongside the
other four for the same reason.

**On the historical record:** commit `ca1ab3e`'s message claims the four
residual failures at that point were "confirmed pre-existing and orthogonal
... untouched by this change." That framing is misleading if read as "these
predate the whole branch" — they don't; they were themselves regressions
introduced earlier in this branch (by Task 3's permanent-lock change), just
not ones `ca1ab3e`'s own fork edit could have caused or fixed. The A/B behind
that claim only stashed the fork edit while keeping the rest of the branch
(including the permanent lock) in place, so it could only rule out "did
Task 9 cause these" — it could not detect that they were branch regressions
at all, because the baseline it compared against still had the permanent lock
on. `3637fdd` is the commit that actually fixed them.

## Tests
- Unit: `src/ui/toolbar/tool-override.test.ts` (12 tests, covers every
  `canEngage` guard, including "does not engage when the selection tool is
  already active" — this is the ONLY coverage of that guard; see gotcha
  below), `src/ui/toolbar/useToolOverride.test.tsx` (16 tests: engage/restore/
  blur/visibilitychange/lock-normalizer). Full unit suite after this branch:
  **631 tests / 69 files, all green.**
- e2e: `e2e/tool-override.spec.ts`, **4 tests** (not 5 — see gotcha below).
  Full e2e suite (111 tests) fully green as of `3637fdd`, including the flake
  noted below.

## Gotchas for anyone touching this again

- **The `locked` flag gates two behaviours upstream — auto-revert AND
  auto-select.** Anyone re-locking, unlocking, or otherwise touching
  `activeTool.locked` semantics must check both. This is the trap that cost
  this branch a full rework (Tasks 9–10) after Task 8's full-suite
  verification caught it.
- **After any vendor rebuild, `rm -rf node_modules/.vite`.** Playwright's
  `webServer.reuseExistingServer` (true outside CI) plus an uninvalidated Vite
  dependency pre-bundle cache for the `file:`-linked fork package can keep
  serving a stale bundle after a rebuild, making a correct fix look broken.
  Confirmed during this branch's own verification — a first post-fix e2e run
  showed extra failures that vanished once the dev server was killed and
  `node_modules/.vite` cleared before rerunning.
- **`npm run build:excalidraw` currently exits 1** on a pre-existing, unrelated
  `tsc` type error in the fork's `packages/excalidraw/data/restore.ts` (a
  `cornerRadius` field colliding with a generic constraint, from the earlier
  `bcfbfff6` fork commit) — while the esbuild half still succeeds and `tsc`
  still emits every `.d.ts` it can despite the error, so `dist/` output is
  correct. Confirmed by reproducing the same failure with this branch's own
  fork edit `git stash`ed. `npm run typecheck` in flow (which consumes the
  emitted `.d.ts`) is clean. Worth a follow-up to fix the `restore.ts` typing
  so the build script's exit code is trustworthy again.
- **`.at(-1)` does not typecheck here** — `tsconfig.json` pins `target`/`lib`
  to ES2020 and a prior commit (`9c1f515`, on this same branch) deliberately
  reverted an ES2022 `lib` bump that had been added only to support `.at(-1)`
  in tests, on review grounds that widening `lib` project-wide is an
  unreviewed side effect a test change shouldn't cause. Use index arithmetic
  (`arr[arr.length - 1]`) instead.
- **A planned e2e test that passed with the feature deleted was dropped, not
  added.** The plan called for "the modifier does nothing when the selection
  tool is already active" as an e2e test; it asserted `activeTool.type` stayed
  `"selection"` across a held modifier, which is true whether or not
  `useToolOverride` is mounted at all — deleting the hook from `App.tsx`
  entirely would not have failed it. Deleted in `bf5ce4f`. The real guard
  (`canEngage` rejecting an already-selection active tool) is covered at the
  unit level instead, as noted above. Do not re-add an e2e version of this
  without first proving it can fail — mutate the guard away and confirm red
  before trusting a new assertion here.
- **Task order was swapped from the plan**: quickbar-toggle removal (`ca3cb1d`)
  landed *before* rail-padlock removal (`d969a01`), reversing the plan's Task
  5/6 order. Narrowing `TOOL_ICONS` to `Record<ToolId, ReactNode>` (part of the
  rail removal) breaks `src/ui/quickbar/icons.tsx`'s `TOOL_ICONS[LOCK_ID]`
  lookup until the quickbar's own `LOCK_ID` entry is gone too — the two files
  share that one coupling point despite `LOCK_ID` being two independent
  constants in two different modules.
- **Known e2e flake, not caused by this branch:** `e2e/color-swatches.spec.ts:36`
  ("a new palette + swatch persists across reload") fails occasionally under
  8-worker parallel load and passes reliably on `--workers=1` — the same
  parallel-load persistence flake class `playwright.config.ts` already
  documents for `e2e/quickbar.spec.ts`'s arrow-binding persistence test.
- Accepted trade-offs (from the spec, all still true): Cmd+drag with a
  *shape* tool no longer draws snap-free; Cmd-hold + click always drills into
  groups (vendor `App.tsx:7223`, `if (event[KEYS.CTRL_OR_CMD])` inside the
  pointerdown hit-test handler — drilling into groups regardless of a normal
  click's group-respecting behavior); every Cmd shortcut flaps the tool
  through selection and back.
