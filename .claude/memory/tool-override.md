# Tool override (hold Cmd/Ctrl for selection)

Illustrator-style temporary tool override plus a permanently-on tool lock.
Spec/plan: `docs/superpowers/specs/2026-08-07-tool-override-design.md`,
`docs/superpowers/plans/2026-08-07-tool-override.md`. Branch `feat/tool-override`.

**Status: shipped, including a final-review fix wave and a corrective pass on
top of that.** Unit suite green (640/640), e2e fully green (113/113). A
regression was found mid-branch (forcing the tool lock on silently killed
auto-select-on-draw app-wide), root-caused, fixed with a deliberate two-site
fork edit, and the four e2e tests it took down were updated to the new
workflow. See "The regression and its fix" below — this is the highest-value
section for anyone touching this feature again. A later whole-branch review
then found a **third** site with the same conflation, a `Q`-shortcut escape
hatch, and a style-memory interaction the override made newly reachable — see
"Final-review fix wave" below. A **re-review of that wave** then found the
`Q` swallow still ate the letter in flow's own search boxes, and — more
seriously — that the style-memory fix in that wave did not work and opened a
second corruption path; see "Corrective pass" below, which supersedes the
"One known, accepted residual" paragraph in the final-review section.

## Shipped
- `src/ui/toolbar/tool-override.ts` — pure: `overrideKeyFor(platform)` (Meta on
  Apple, Control elsewhere — mirrors the vendor's `KEYS.CTRL_OR_CMD` at
  `vendor/excalidraw/packages/excalidraw/keys.ts:38`, and its `isDarwin`
  platform test at `constants.ts:5`; deliberately NOT "either key" because
  macOS Control is right-click emulation) and `canEngage(state, target)`.
- `src/ui/toolbar/useToolOverride.ts` — two effects: (1) capture-phase
  keydown/keyup on `window` + blur/visibilitychange, engaging the selection
  tool and restoring on release; (2) an `onChange` normalizer re-asserting
  `activeTool.locked === true`. Mounted from `App.tsx` as
  `useToolOverride(excalidrawApi, styleMemory)` — the second, optional arg is
  `useStyleMemory`'s returned `StyleMemoryHandle` (added in the corrective
  pass, see below); `initialData.appState` seeds `activeTool:
  {type:"selection", customType:null, locked:true, lastActiveTool:null}`.
- Tool-lock UI removed from all three surfaces: rail padlock (`ToolBar.tsx`,
  `LOCK_ID` gone from `tools.ts`), quick-actions toggle (`quickbar/actions.ts`),
  View ▸ Tool Lock (`MenuBar.tsx`, `useViewToggles.ts`). Native `Q` is now
  swallowed outright (final-review wave, below) rather than left to fire and
  be cleaned up after — see "Final-review fix wave" for why the original
  fire-then-undo approach was itself buggy.
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

## Final-review fix wave (2026-08-07)

A whole-branch review after the twelve feature commits landed found three
more issues the task-scoped reviews couldn't see, plus two smaller doc/test
fixes. Findings doc:
`.superpowers/sdd/2026-08-07-tool-override/final-review-findings.md`.

**The third auto-select/lock-conflation site.** `App.tsx`'s two sites (above)
cover drag-created shapes and drag- or click-continued linear elements. There
is a third: a click-committed multi-point line/arrow finished via
`actionManager.executeAction(actionFinalize)` — vendor
`actions/actionFinalize.tsx`'s own `selectedElementIds` computation, gated on
the identical `!appState.activeTool.locked` clause. Missed in the original
two-site fix because every existing spec drag-creates or click-continues
(which route through the already-patched `App.tsx` sites); nothing exercised
a creation path that reaches `actionFinalize` *without* first passing through
one of those two. **The concrete, verified repro is an elbow arrow, two
clicks** (start, end) — `handleLinearElementOnPointerDown`'s
`isElbowArrow(multiElement) && multiElement.points.length > 1` branch
auto-finalizes an elbow arrow on its second point by calling
`actionManager.executeAction(actionFinalize)` directly, which is the *one*
reachable path that never touches the click-continuation code that
unconditionally selects every other in-progress multi-point element as you
draw it. Confirmed by instrumenting `actionFinalize.perform` directly: it ran
with `appState.selectedElementIds: {}` when locked. A plain multi-point
*line*, finished via repeated single clicks then Enter/Escape, does **not**
reproduce this — every click after the first already runs
`App.tsx`'s always-unconditional click-continuation select
(`handleLinearElementOnPointerDown`'s non-early-return branch), so the
element is already selected by the time `actionFinalize` runs regardless of
its own gate. (The final-review findings doc's suggested repro described this
literal line/Enter sequence; it does not reproduce as written — the
underlying diagnosis, that `actionFinalize`'s condition is a dead-branch twin
of the two already-patched sites, is correct and independently proven by the
elbow-arrow repro.) Fix: drop `!appState.activeTool.locked &&` from
`actionFinalize.tsx`'s `selectedElementIds` ternary, `flow:`-commented,
leaving the `multiPointElement &&` / `!== "freedraw"` clauses and everything
else byte-identical to upstream. e2e regression:
`e2e/tool-override.spec.ts` — "a two-click elbow arrow ends up selected once
it auto-finishes".

**`Q` now silently dropped the user to Selection.** `App.tsx`'s `toggleLock`
branches on the *current* lock state: with it permanently true, `Q` sets
`{type: "selection", locked: false}`, not just `{locked: false}`. The
lock-normalizer effect (second effect in `useToolOverride.ts`) restores
`locked` but has no way to know what tool to restore, so it stayed on
Selection — a real, silent tool change in an app whose whole premise is that
the tool stays put. Fixed by swallowing `q` in the same capture-phase
`keydown` listener the modifier override already uses, guarded by
`isTextEntry` (verified against vendor's actual text editor —
`element/textWysiwyg.tsx` creates a real `<textarea>`, which `isTextEntry`
matches — so typing "q" into canvas text is unaffected). This reverses the
original spec's explicit rejection of swallowing `Q`; the `isTextEntry` guard
is exactly what resolves the concern that rejection was based on. The vendor
`HelpDialog.tsx` row advertising the `Q` shortcut (`toolBar.lock`) is removed
too, one line, `flow:`-commented — it described a shortcut that no longer
does what it says. Unit regression: `useToolOverride.test.tsx` — "swallowing
native Q" (canvas swallowed, text field not swallowed).

**Style memory can learn a foreign category's value across an override
cycle.** The override's restore path is the first place in the app where a
drawing tool becomes active *while elements stay selected* —
`setActiveTool` clears the selection for every non-selection tool, and before
this branch a tool pick always preceded every draw, so this combination was
previously unreachable. `useStyleMemory`'s adopt-on-select cannot tell "the
override just restored a selection that was already there" apart from a
genuine new selection, so restoring the selection re-fires adopt-on-select and
leaves `currentItem*` holding the reselected element's own style — from
whatever category *that* element belongs to — instead of the restored tool's
bucket. If the user then edits a contended key with that element still
selected, the edit folds into the wrong bucket, and the next same-tool draw
picks it up. This wave's fix (**superseded — see "Corrective pass" below**)
tried to do this inside `useToolOverride.ts`'s `restore()` alone: look up
`categoryOfTool` for the restored tool and, if it has one, `setActiveCategory`
+ write `resolveLoad`'s patch via a hand-rolled `updateScene` with
`CaptureUpdateAction.NEVER`. It called the possibility of that write being
re-folded into the still-selected element's foreign bucket a harmless,
accepted residual. **That residual claim was wrong** — see below.

**Also fixed, no design decisions:** `useToolOverride.ts`'s header comment
claimed "no fork edits" while the very edit it points at (`actionFinalize.tsx`)
proves otherwise — corrected. `.claude/memory/flow-fork-strategy.md` didn't
record this branch's fork work at all — added. `MenuBar.test.tsx`'s "shows
the five canvas toggles" test title said five when the array it asserts over
has four — retitled, no assertion changed.

## Corrective pass (2026-08-07)

A scoped re-review of the final-review fix wave above found two more
problems, both now fixed. Full report:
`.superpowers/sdd/2026-08-07-tool-override/corrective-pass-report.md`.

**`isTextEntry` didn't recognize `type="search"`.** The `Q` swallow above
guards on `isTextEntry` (`src/lib/history-shortcuts.ts`), which only matched
`text` / `number` / `password` (plus textarea/contenteditable) — a list
scoped to the vendor's own writable-element check. Both of flow's own search
boxes (`SearchControl.tsx`, `SearchPanel.tsx`) are `type="search"`, so a bare
"q" typed into either was silently eaten. Widened `isTextEntry` to also match
`search`, `email`, `url` and `tel`, and corrected its doc comment, which had
made the same "covers the input types that can actually occur in flow's own
panels" claim `Q`'s swallow just proved false. A unit test on `isTextEntry`
alone would not have caught the original bug (it's specifically about a real
per-key `keydown`, which a `.fill()`-based test bypasses) — added
`e2e/tool-override.spec.ts`'s "typing into the canvas search box reaches the
field, letter q included", which types through a real search box via
`page.keyboard.type`.

**The final-review wave's style-memory fix didn't work, and added a second
corruption path.** The human's ruling (treat the release like a tool change,
reload the restored category) was correct; the previous wave's
implementation of it was not. Root cause: the hand-rolled `updateScene` write
bypassed `useStyleMemory`'s own `applyPatch` — the *only* thing that advances
`prevContended` (`src/ui/useStyleMemory.ts`), which is what tells the drift
watcher "this write already happened, don't re-fold it." Skip that
bookkeeping and the very next `onChange` — fired by the reload's own write —
reads the write as an unexplained edit and folds it into
`categoriesInSelection`, which at that moment is the still-selected *foreign*
element's category. Concretely: shape holds width 7, the user Cmd-clicks an
arrow (linear, its own remembered width say 2), release — the reload
correctly sets `currentItemStrokeWidth` back to 7 in `appState` (so it
*looked* fixed), but the very next `onChange` folds that same 7 into the
**linear** bucket, clobbering its own remembered width. No user edit needed.
A later, unrelated draw of an arrow then loads the corrupted linear bucket —
not self-healing, reinforcing the wrong value instead of correcting it.

**Fix:** `useStyleMemory.ts` now returns a `StyleMemoryHandle` — `{
reloadCategory(category, toolType, arrowType) }` — a stable-identity object
(held in a `useRef`) whose method is (re)assigned inside the hook's effect to
close over the *same* `applyPatch` the "load on tool change" branch of
`sync()` already used; that branch was refactored to call `reloadCategory`
too, so there is exactly one implementation of "run a load," used both for a
genuine tool change and for `useToolOverride`'s imperative one.
`App.tsx` passes `useStyleMemory`'s return value straight into
`useToolOverride` as its new, optional second argument; `useToolOverride.ts`'s
`restore()` calls `styleMemory.reloadCategory(category, type, arrowType)`
instead of hand-rolling the write, and no longer imports
`resolveLoad`/`setActiveCategory` from `style-memory-store.ts` at all — it
only knows `categoryOfTool` (to decide *whether* to ask) and the handle (to
ask). The hook stays usable with no handle supplied (skips the reload
entirely), so its own pre-existing standalone unit tests are unaffected.
`useStyleMemory`'s drift-capture logic itself was NOT touched, per the
original ruling's constraint.

Regression tests, both verified RED against the previous wave's
implementation and GREEN after, in
`src/ui/style-memory-tool-override.test.tsx` (mounts both real hooks against
one fake canvas, unlike the wiring-only fake-handle tests in
`useToolOverride.test.tsx`):
- "does not overwrite the foreign element's own bucket" — the no-edit
  opposite-corruption case above.
- "closes the original repro: a later draw of the arrow's own category still
  uses its own remembered value" — proves the fix is not just cosmetically
  correct in `appState` right after release, but that the *bucket* itself
  stays clean for a later, unrelated draw.

`useToolOverride.test.tsx`'s own "style memory reload on restore" tests were
rewritten in the same pass to assert against a fake `StyleMemoryHandle`
(wiring-level: is `reloadCategory` called with the right args, after the
selection-restore write, and not at all for a tool with no category) rather
than against the old hand-rolled `updateScene` shape, since that shape no
longer exists.

**Surviving residual:** After the modifier release, a genuine style edit made
while the foreign-category element is still selected folds into that element's
category and stays live in `currentItem*`. Drawing the restored tool's category
with no tool change in between then picks up that value, and adopt-on-select
records it into the restored tool's bucket. Closing this would require routing
drift capture by active tool rather than by selection when a drawing tool is
active with elements selected — a restructuring of `useStyleMemory`'s drift
capture that was explicitly out of scope. This residual is reachable only via
the override and degrades to stock Excalidraw behavior (a style edit follows
into the next drawn element). Full detail: `.superpowers/sdd/2026-08-07-tool-override/corrective-pass-report.md`.

## Tests
- Unit: `src/ui/toolbar/tool-override.test.ts` (12 tests, covers every
  `canEngage` guard, including "does not engage when the selection tool is
  already active" — this is the ONLY coverage of that guard; see gotcha
  below), `src/ui/toolbar/useToolOverride.test.tsx` (22 tests as of the
  corrective pass: engage/restore/blur/visibilitychange/lock-normalizer, the
  `Q` swallow — including the search-field case added in the corrective
  pass — and the style-memory reload wiring, now asserted against a fake
  `StyleMemoryHandle`), plus `src/ui/style-memory-tool-override.test.tsx` (2
  tests, corrective pass: both real hooks mounted together, the actual
  release-time-reload corruption/fix). `src/lib/history-shortcuts.test.ts`
  also gained a case for the widened `isTextEntry` input types. Full unit
  suite after the corrective pass: **640 tests / 70 files, all green.**
- e2e: `e2e/tool-override.spec.ts`, **6 tests** (the original 4, the
  elbow-arrow multi-point regression from the final-review wave, and the
  search-box typing regression from the corrective pass). Full e2e suite
  (113 tests) fully green, including the flake noted below.

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
