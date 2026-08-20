# Tool override (hold Cmd/Ctrl for selection)

Illustrator-style temporary tool override plus a permanently-on tool lock.
Spec/plan: `docs/superpowers/specs/2026-08-07-tool-override-design.md`,
`docs/superpowers/plans/2026-08-07-tool-override.md`. Branch `feat/tool-override`.

> **On the vendor line numbers in this file.** It carries roughly a dozen
> `vendor/excalidraw` line references, and an upstream replay invalidates all of
> them at once with nothing to detect it. The references touched during the
> 2026-08-16 fix wave were re-verified against the tree at that time: the
> image-tool guard, the deep-select block, the deselection split, the
> grid/snap site lists, the `withCmdOrCtrl` note, and the move-cursor gate.
> **Re-verified again on 2026-08-17**, because this branch's own `flow:`
> comment insertions shifted every reference below `App.tsx:10789` by about 5
> lines: the image-tool guard, the `withCmdOrCtrl` note, and the deselection
> split were corrected to their current line numbers. The move-cursor gate
> (`~App.tsx:8110`/`~8124`) and the grid/snap site lists sit above that shift
> point and were unaffected. **Every other line number here is presumed stale
> since the 2026-08-11 upstream replay** — trust the symbol name, grep for it,
> and treat any bare number as a hint, not a promise of precision. Where a
> reference was corrected in the 2026-08-16 or 2026-08-17 pass it now leads
> with a symbol and keeps the number only as a parenthetical.

**Status: shipped, including a final-review fix wave and a corrective pass on
top of that, plus a third pass (2026-08-15) reducing Cmd/Ctrl to one canvas
meaning.** Unit suite green (640/640 at ship, 1219/1219 as of the third
pass), e2e fully green (113/113 at ship; 183/185 after the third pass's
2026-08-16 fix wave, the 2 failures pre-existing in `text-panel.spec.ts`). A regression was found
mid-branch (forcing the tool lock on silently killed auto-select-on-draw
app-wide), root-caused, fixed with a deliberate two-site fork edit, and the
four e2e tests it took down were updated to the new workflow. See "The
regression and its fix" below — this is the highest-value section for anyone
touching this feature again. A later whole-branch review then found a
**third** site with the same conflation, a `Q`-shortcut escape hatch, and a
style-memory interaction the override made newly reachable — see
"Final-review fix wave" below. A **re-review of that wave** then found the
`Q` swallow still ate the letter in flow's own search boxes, and — more
seriously — that the style-memory fix in that wave did not work and opened a
second corruption path; see "Corrective pass" below, which supersedes the
"One known, accepted residual" paragraph in the final-review section. A
**third pass** (branch `feat/cmd-modifier-semantics`, 2026-08-15) found that
the same modifier conflation which caused the original regression was not
fully closed — three more upstream behaviours were still permanently on
during selection work. See "Cmd/Ctrl means one thing" below, the section to
read before touching anything Cmd/Ctrl-gated in this feature again.

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
- **The override mechanism routes through public API** — `setActiveTool` /
  `getAppState` / `updateScene` / `onChange`. (The *lock decoupling* below,
  and the drag fix immediately after, each needed a fork edit.)
- **The modifier must not block dragging (fork edit, 2026-08-14).** Upstream
  captures `withCmdOrCtrl` at pointerdown and used it to suppress element
  dragging for the whole gesture — it reserves cmd/ctrl for select-through.
  flow reserves the same modifier for *this* feature, so the two meanings
  collided: holding it gave you the selection tool that could select and
  resize but **never move**, which is the one thing people reach for it to
  do. Fixed by dropping `!pointerDownState.withCmdOrCtrl` from the drag gate
  in `App.tsx`'s pointer-move handler (~10906, marked with a `flow:` comment).
  **This cannot be fixed above the fork** — `event.ctrlKey` is read-only, so
  flow cannot strip the modifier from real events before Excalidraw sees it.
  Marquee select-through is untouched: it runs on pointer-up (the other
  `withCmdOrCtrl` use) and is only reached when the drag branch doesn't fire.
  Covered by `tool-override.spec.ts` "holding the modifier lets you drag a
  shape to move it" plus a marquee guard beside it; verified to fail with the
  gate restored.
- **This went unnoticed for a week because the tests asserted the wrong
  thing.** The original suite proved the tool *switches* and that a selection
  *survives the release* — never that the selected thing could be moved. A
  feature's tests should exercise what the feature is *for*, not just its
  state transitions.
- **Transparent shapes hit on their stroke, not their interior** — worth
  knowing when reproducing bugs here. A press inside an unfilled rectangle
  hits nothing and starts a marquee, with or without the modifier; that is
  Excalidraw behaviour, not a bug in this feature. Two reproduction attempts
  chased it before the 2×2 (filled/transparent × modifier/none) matrix
  isolated the real variable.
- **The restore is two calls, in this order.** `setActiveTool` gives the right
  cursor but clears the selection for any non-selection tool (vendor
  `App.tsx`, the `nextActiveTool.type !== "selection"` guard inside
  `setActiveTool`'s state updater); the follow-up `updateScene({appState:
  {selectedElementIds, selectedGroupIds, editingGroupId}})` puts it back.
  Selection is read FRESH at release — an engage-time snapshot would clobber
  an undo made mid-hold.
- **Never `setActiveTool({type:"image"})` from this feature** — it re-fires the
  image picker. In vendor `App.tsx`, `setActiveTool`'s
  `if (nextActiveTool.type === "image")` branch calls
  `onImageToolbarButtonClick`, which opens the OS file picker (~`App.tsx:6069`
  for the branch, ~`12832` for the method; re-verified 2026-08-17 — was stale at
  `App.tsx:4741`, another casualty of the 2026-08-11 replay's line churn, then
  drifted again to `12827` by this branch's own comment insertions).
  Both the engage guard (`canEngage`) and the lock normalizer skip the image
  tool for this reason. `src/ui/toolbar/tool-override.ts`'s own JSDoc carried
  the same stale `4741` and was corrected in the same pass.
- **Don't engage mid-gesture.** `canEngage` bails on `cursorButton === "down"`,
  `newElement`, and `multiElement`. **Amended 2026-08-16:** the recorded
  justification used to be "the vendor reads Cmd during a drag to bypass grid
  snapping and to close elbow arrows." The grid-snapping half is no longer true
  — removing exactly that bypass is what the 2026-08-15 pass did (see "Cmd/Ctrl
  means one thing"). **The elbow-arrow half is still real, and so is a third
  reason the original wording missed: the mid-draw sites this branch
  deliberately left unfixed (`handlePointerMoveInEditMode`, `actionFinalize`)
  are only safe to leave *because* `multiElement` blocks engagement.** So the
  guard is now load-bearing in both directions — do not remove it on the
  grounds that "the grid reason is gone." (It also no longer reads Cmd to
  suppress dragging — see the drag fix above; that half was superseded on
  2026-08-14.)
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

**A THIRD site in this family, found 2026-08-20 — the two above were not the
whole set.** Vendor `App.tsx`'s `textWysiwyg` `onSubmit` handler (~6297) chose
what to re-select after a keyboard text submit via
`viaKeyboard && !this.isToolLocked() && activeTool.type !== "autoshape"`.
Its own comment says "keyboard-submit keeps focus on the edited object. For
bound text, keep the container selected" — but with flow forcing the lock
permanently on, `elementIdToSelect` was **always `null`**, so labelling a shape
with Enter and pressing Escape left it deselected. Every panel control needing
a selection then greyed out. Fixed by dropping the `isToolLocked` term, exactly
as the other two sites did.

This is why it went unnoticed for so long: the symptom was not "the tool lock
misbehaves", it was "the Padding field is disabled" in a text-panel test that
had been filed as a pre-existing failure since 2026-08-11. **When forcing a
vendor flag permanently on, grep every read of that flag — `isToolLocked` had
three consumers with unrelated meanings, and two sweeps found only two of them.**

Knock-on for tests: two `text-panel.spec.ts` tests had a Selection-click plus a
canvas click that existed only to undo the old deselection. With the container
now correctly still selected, clicking its bound text **opens the text editor**
instead, greying the same controls — so those steps had to be removed. A
workaround for a bug becomes a bug once the cause is fixed.

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
fixes.

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
problems, both now fixed.

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
into the next drawn element).

## Cmd/Ctrl means one thing (2026-08-15)

**The pattern, stated once and plainly.** flow reserves Cmd/Ctrl for this
feature's temporary selection tool, which means the modifier is held for a
*whole interaction* — press, drag, release — not tapped for an instant the
way upstream's own Cmd/Ctrl gestures assume. Every upstream behaviour gated
on that modifier is therefore permanently on during selection work instead of
being the opt-in gesture it was designed as. This is the same root cause as
"The regression, and its fix" above (that one was `activeTool.locked` gating
two behaviours; this one is `event[KEYS.CTRL_OR_CMD]` gating several) — and it
is not a one-time cleanup. Three instances have now been found and removed on
three separate days: drag suppression (2026-08-14, see the gotcha above),
deep-select swallowing shift, and the two snap overrides (both below).
**Anyone finding a fourth collision should expect it to present as "feature X
is always on while selecting," not as an obvious bug report** — the symptom
reads as a feature working "too well," not as broken.

**That prediction was correct, and here is the collision it predicted — known,
named, and deliberately NOT fixed on this branch.** See "The fifth collision:
arrow binding" at the end of this section.

Three parts landed on this branch, all in `vendor/excalidraw`:

- **Part A — deep-select swallowed shift** (`components/App.tsx`, the
  `if (event[KEYS.CTRL_OR_CMD])` "deep selection" block at line 9549, fixed at
  line 9568, submodule `c369dbaa`). Upstream's Cmd/Ctrl-click branch replaced
  `selectedElementIds` wholesale via `editGroupForSelectedElement` and
  returned before the shift-aware path lower in the same handler ever ran —
  so shift-click while the modifier-held selection tool was active could
  never extend a selection, only replace it. Fixed by adding a
  `event.shiftKey` sub-branch ahead of the existing unconditional call; the
  non-shift path and the `event.altKey` lasso sub-branch above it are
  byte-identical to upstream.
- **Part B1 — snapping.ts inverted the toggle** (`snapping.ts:178`,
  `isSnappingEnabled`, submodule `004a0732`). Upstream read
  `!app.state.objectsSnapModeEnabled` while Cmd/Ctrl was held — a
  hold-to-invert gesture for a modifier flow never releases mid-selection, so
  Snap to Objects was permanently backwards during selection work. Deleted;
  snapping now follows the toggle alone (View ▸ Snap to Objects, the quickbar
  toggle, `Alt+S`).
- **Part B2 — grid snap bypass, 21 sites in 2 files** (`components/App.tsx` and
  `packages/element/src/linearElementEditor.ts`; submodule `95680cf` for the
  first 15, plus the 2026-08-16 fix wave for the rest). Upstream bypassed
  `getEffectiveGridSize()` — passed `null` instead — whenever Cmd/Ctrl was
  held, so grid snap was permanently off during selection work. All dropped the
  Cmd/Ctrl term; grid snap now follows View ▸ Grid alone. Breakdown:
  - `App.tsx`, **16**: 1 compound guard, 9 inline `getEffectiveGridSize()`
    calls, 5 `lastPointerDownEvent`-derived call sites, and 1 negated boolean
    argument — `LinearElementEditor.addMidpoint(..., !event[KEYS.CTRL_OR_CMD],
    ...)`, whose 4th parameter is `snapToGrid`. That last one now passes `true`.
  - `linearElementEditor.ts`, **5**: `handlePointerMove` (×2),
    `handlePointDragging` (×2), `handlePointerDown`'s alt-click add-point (×1)
    — linear-editor point drag and add-point, all reachable with the selection
    tool. `addMidpoint`'s own
    `snapToGrid && !isElbowArrow(element) ? ... : null` was left
    byte-identical (the elbow exemption is upstream's, and `snapToGrid` is now
    always `true` from the one caller); it carries a `flow:` comment only.

  **Deliberately NOT fixed — three sites, and this is not an oversight.**
  `linearElementEditor.ts`'s `handlePointerMoveInEditMode` (×2, one of them the
  `event[KEYS.CTRL_OR_CMD] || isElbowArrow(element)` compound) and
  `actions/actionFinalize.tsx`'s `effectiveGridSize` ternary. All three are
  reached only while a multi-point element is *being drawn*, and `canEngage`
  (`src/ui/toolbar/tool-override.ts`) refuses to engage the override when
  `multiElement` is set — so the modifier is never held through them under
  flow's model, and there they are still upstream's opt-in gesture. Leaving
  them keeps the fork diff smaller and preserves upstream behaviour where flow
  has no claim on it. They are allowlisted by name and exact count in
  `scripts/build-excalidraw.mjs`'s stage 5 (below); adding a new one anywhere
  fails the build.

  **How this was missed the first time.** The original sweep was scoped to
  `App.tsx`, so its exhaustion greps could only ever be exhaustive *within* that
  file — a grep that proves "no more sites here" says nothing about the other
  file with the identical idiom. The `addMidpoint` argument was missed for a
  second, independent reason: it is a negated boolean, not a
  `getEffectiveGridSize()` call, so a call-shaped grep could not see it. The
  concrete symptom while it stood: `App.tsx`'s neighbouring *elbow*-midpoint
  path (the `getGridPoint` call in the pointermove handler, ~10645) had been
  fixed, so two adjacent midpoint paths disagreed — with grid on and the
  modifier held, dragging an arrow endpoint or adding a segment midpoint landed
  off-grid while every other drag snapped.

- **Automated survival check for the deletions** (`scripts/build-excalidraw.mjs`,
  stage 5, added 2026-08-16). The pre-existing stage 4 asserts a *symbol is
  present* in the built declarations, which can only express additive fork
  edits; 23 load-bearing deletions have no footprint in `dist/` to assert on.
  Stage 5 therefore scans the fork **source** for the removed idiom
  (`CTRL_OR_CMD` within 3 lines of `getEffectiveGridSize`/`snapToGrid`, comment
  lines skipped) and fails the build if any file exceeds its allowlisted count.
  Proven in both directions: passes on the post-fix tree, and reverting one
  site produced `EXIT=1` with the offending file, line and text named.

**That deselection stays at pointerup on purpose.** The deep-select fix's own
`flow:` comment calls this out explicitly. The path it means is the
**shift-click deselect** inside `handleCanvasPointerUp`: the gate
`if (hitElement && !pointerDownState.drag.hasOccurred && ...)` followed by
`if (childEvent.shiftKey && !this.state.selectedLinearElement?.isEditing)`, and
inside it the `// remove element from selection while keeping prev elements
selected` `setState` that `delete`s the id. Grep for that comment —
`components/App.tsx` ~12266 for the gate, ~12318 for the removal, verified
2026-08-17 (both had drifted by 5 lines from the 2026-08-16 figures of
~12261/~12313 due to this branch's own comment insertions). A click that
didn't drag deselects; a click that did drag doesn't.

> **Corrected 2026-08-16 — this paragraph previously cited the wrong block.**
> It pointed at `App.tsx:12459-12466` "gated on `!drag.hasOccurred` (12432)".
> That range is a *different* thing: the **clear-all** block
> (`// Deselect selected elements`, which resets `selectedElementIds` to `{}`)
> and it has no `shiftKey` condition at all — it is the click-on-empty-canvas /
> click-the-bounding-box path. That citation was introduced by this very branch
> (`ab2dd14`) and is more dangerous than an ordinary stale ref, because the
> wrong target is superficially plausible: it *is* in the pointerup handler, it
> *is* gated on `!drag.hasOccurred`, and it *is* about deselecting. A future
> editor "tidying" the two into consistency would be reading the wrong code.

This is deliberately **not** also handled at pointerdown, even though the Part A
fix sits in a pointerdown branch: toggling deselection at both points would
double-toggle, and the concrete failure would be shift+**drag** silently
deselecting instead of moving the selection. **This is the single most likely
thing for a future editor to "tidy" into a bug** — it looks like an
inconsistency (why doesn't the click branch handle its own deselection?) but
the split is load-bearing. `e2e/tool-override.spec.ts`'s "modifier + shift-drag
moves the selection instead of deselecting" is the guard, and its own comment
records that it is a guard for *this split*, not for the shift branch.

**Group drilling on Cmd-click was deliberately kept**, not folded into this
cleanup. `App.tsx:9549`'s `if (event[KEYS.CTRL_OR_CMD])` block still drills
into a group and selects the child element regardless of a normal click's
group-respecting behavior — this was already an accepted trade-off (see
"Accepted trade-offs" at the bottom of this file) and stays permanently
active while the modifier is held, same as before. "Remove it entirely, drill
via double-click instead" was explicitly on the table and not taken — the
design doc records both options and the call to keep it. Double-click drilling
already exists independently, unaffected by this change:
`App.tsx`'s `handleCanvasDoubleClick` (~line 7011), the
`selectedGroupIds.length > 0` branch at ~line 7148, which drills into an
*already-selected* group on double-click. The two are complementary, not
duplicates — Cmd-click drills from a hit-test with nothing selected yet,
double-click drills further into a group you're already inside.

**The compound-guard trap.** One of the `App.tsx` grid sites (inside
`PointerDownState`'s `originInGrid` computation, ~`App.tsx:9174`) read
`event[KEYS.CTRL_OR_CMD] || isElbowArrowOnly ? null : this.getEffectiveGridSize()`
— two independent reasons to bypass grid snap, only one of them flow's to
remove. The fix drops only the `event[KEYS.CTRL_OR_CMD] ||` term, leaving
`isElbowArrowOnly ? null : ...` untouched — elbow arrows keep their own
grid-snap bypass, unrelated to the modifier conflation. Five lines above, in
the same object literal, `withCmdOrCtrl: event[KEYS.CTRL_OR_CMD]` was
deliberately left alone — that field feeds marquee select-through (read at
pointerup, the other consumer of `withCmdOrCtrl`) and is out of scope for
this fix. A sweep that pattern-matched "remove the Cmd/Ctrl term" without
reading each site would have caught the `isElbowArrowOnly` term too, or
missed that `withCmdOrCtrl` sits right next to the thing that needed fixing.

**The fork footprint change, and why it matters differently than past fork
edits.** This is the first *deletion-shaped* work on this feature. Every fork
edit before it either added a field (arrowhead size, laser color, grid color)
or dropped a single clause at one site (the 2026-08-14 drag-suppression fix).
This pass modifies **23 pre-existing upstream expressions in place across 3
files** — `components/App.tsx` (17: 16 grid + 1 deep-select shift),
`packages/element/src/linearElementEditor.ts` (5 grid), and `snapping.ts` (1
object-snap) — which means an upstream replay will surface these as **merge
conflicts**, not clean insertions: the lines this branch touches are lines
upstream is also likely to keep touching. Every site carries a `flow:` comment
for exactly this reason — a future replay can `grep -n "flow:"` all three files
and re-apply each deletion by hand against the new upstream text, since a
mechanical patch apply is not expected to succeed cleanly here the way it has
for prior fork edits on this feature. `scripts/build-excalidraw.mjs` stage 5 is
the automated backstop if a replay silently restores one.

> **Corrected 2026-08-16.** This paragraph, the design spec, and the
> `MEMORY.md` index line all previously said **"17 sites across 2 vendor
> files."** That was true of `App.tsx` + `snapping.ts` alone, which is exactly
> what the sweep was scoped to — and why its own exhaustion greps could not
> have found the identical idiom in `linearElementEditor.ts`. The true figure
> is 23 sites across 3 files, plus 3 sites deliberately left (listed under
> Part B2). Correspondingly, "Cmd/Ctrl means exactly one thing" is an
> overstatement: on the *reachable* canvas paths under flow's override it is
> true, but the modifier still carries upstream meanings on the mid-draw paths
> `canEngage` makes unreachable, and marquee select-through's `withCmdOrCtrl`
> is untouched by design.

### The fifth collision: arrow binding (FIXED 2026-08-19)

Recorded 2026-08-16, **corrected and fixed 2026-08-19** on
`fix/arrow-binding-modifier` (submodule branch `flow-arrow-binding`). The
original entry said "three sites" and implied the defect was uniform across
platforms; both were wrong, and a first draft of the correction was wrong again
about the blast radius. All three errors are kept visible below rather than
edited out, because each came from tracing vendor code without following it
through flow's own fork.

`components/App.tsx` — grep `bindingPreference`, **six** sites, all verified
2026-08-19. None carries a `flow:` marker; every one is still pure upstream:

| Line | Handler | Guard | Effect |
| --- | --- | --- | --- |
| 5637 | `handleKeyDown` | `event[KEYS.CTRL_OR_CMD] && !event.repeat` | invert to `bindingPreference !== "enabled"` |
| 5892 | `handleKeyUp` | `!event[KEYS.CTRL_OR_CMD] && !isBindingEnabled(...)` | resets `bindMode` to `"orbit"` |
| 5927 | `handleKeyUp` | `!event[KEYS.CTRL_OR_CMD]` | restore to preference |
| 8379 | `handleCanvasPointerDown` | `!event.ctrlKey` | restore to preference |
| 8876 | `handleCanvasPointerUp` | `!event.ctrlKey` | restore to preference |
| 10083 | `handleLinearElementOnPointerDown` | `event.ctrlKey` | invert again (idempotent with 5637) |

**The two pointer restores (8379, 8876) are the sites the original entry
missed, and they are the ones that decide the verdict.** They test a *raw*
`event.ctrlKey`, not `KEYS.CTRL_OR_CMD`, while flow's override key is Meta on
Apple and Control everywhere else (`src/ui/toolbar/tool-override.ts`,
`overrideKeyFor`). So the defect is **platform-asymmetric**:

- **macOS** — Meta held ⇒ `event.ctrlKey` is false ⇒ `handleCanvasPointerDown`
  restores `isBindingEnabled` to the preference *before the drag starts*. The
  keydown inversion is wiped almost immediately and the collision largely
  self-heals.
- **Linux / Windows** — Control held ⇒ `event.ctrlKey` is true ⇒ both restores
  are skipped ⇒ the inversion stands for the whole hold. **flow develops on
  Linux, so it was live here.** (Conclusion from reading the guards, not from a
  runtime repro.)

**A first draft of this correction claimed the inversion flipped arrow-endpoint
binding, and that was wrong — flow's own fork shields exactly that path.**
`bindingMode` (flow's lock, `src/lib/binding-mode.ts`) is consulted by the
`isBindingEnabled` **selector** in `packages/element/src/binding.ts:149`, which
short-circuits on `"on"`/`"off"` and only falls through to
`appState.isBindingEnabled` on `"auto"`. Nothing in flow ever writes `"auto"` —
`DEFAULT_BINDING_MODE` is `"on"` and `toggledBindingMode` yields only
`"on"`/`"off"` — so **on every selector-based path `appState.isBindingEnabled`
is dead code in flow**, the modifier included. Endpoint drag is one of those
paths: `getBindingStrategyForDraggingBindingElementEndpoints`
(`binding.ts:612`, guards at `:700` and `:1007`) calls the selector. An e2e of
the form "hold the modifier, drag an endpoint, assert it still binds" is
therefore **vacuous — it passes with or without the fix.** Do not write one.

This is **structurally identical to the object-snap defect Part B1 fixed**: a
hold-to-invert gesture applied to a *persisted user preference*, for a modifier
flow never releases mid-interaction. Same class, same reason it reads as a
feature rather than a bug.

**But it is not the same pure deletion B1 was, and that is the second
correction.** `canEngage` returns false for `activeTool.type === "selection"`,
so the override never engages when the selection tool is already active — yet
the keydown inversion at 5637 fired regardless of the override. That path was
upstream's deliberate hold-to-suppress-binding gesture, not a flow bug. So
deleting the inversion does not merely fix the override collision, it **removes
upstream's binding-suppression gesture outright** — and `actionToggleArrowBinding`
has no `keyTest`, so the quickbar lock and View ▸ Arrow Binding are now the only
ways to suppress a binding. B1 set the precedent for accepting exactly that
trade; it is a trade, not a free fix.

**What the fix actually changes, given the selector shields the main paths.**
Because `appState.isBindingEnabled` is dead on every selector-based path (see
above), the inversion could only ever reach the sites that read the raw field
**directly, bypassing flow's selector**. Those are the whole observable blast
radius of this fix, and each was verified 2026-08-19:

- `renderer/interactiveScene.ts:1687` — `appState.isBindingEnabled &&
  appState.suggestedBinding` gates the binding highlight.
- `element/src/linearElementEditor.ts:377` and `:581` — pass
  `isBindingEnabled: app.state.isBindingEnabled` into an options bag consumed by
  `elbowArrow.ts:1222/1262/1279`.
- `components/App.drawshape.ts:129`, `:251`, `:257` — shape-recognition binding.
- `actions/actionProperties.tsx:2074`, `:2088` — elbow fixed-point calc.

So the user-visible effect of the fix is: while the modifier is held, the
binding highlight still shows, elbow arrows still route as bound, and
shape-recognition still binds. Real, but far narrower than the original entry
implied.

### Sixth, larger defect found while fixing the fifth: flow's lock was bypassed

**Found and FIXED 2026-08-19** on `fix/binding-lock-raw-reads` (submodule branch
`flow-binding-lock-raw-reads`), immediately after the fifth collision.

The same direct-read list above is a bug independent of any modifier.
`src/App.tsx` pushes only `bindingMode` into appState; nothing ever syncs
`appState.isBindingEnabled` to it, so `isBindingEnabled` sits at its default
`true` no matter what the user does. Consequence: with the quickbar
arrow-binding lock switched **off** (`bindingMode: "off"`), every direct-read
site above still behaves as if binding were on — the highlight still paints,
recognized arrows still bind, elbow arrows still route bound. **flow's own
arrow-binding toggle is only partially effective, all the time, with no
modifier involved.**

Almost certainly a regression from the 382-commit upgrade (see
[[excalidraw-upgrade]]): new upstream code added `isBindingEnabled` reads that
the fork's selector does not intercept. Note the two defects interacted —
holding the modifier used to set `isBindingEnabled: false`, which accidentally
made the direct reads *agree* with a `"off"` lock while held. Removing the
inversion does not create this bug (it is present whenever the modifier is not
held, i.e. almost always), but it does remove that accidental masking.

**The fix.** Ten raw reads routed through the selector, across five files:
`binding.ts` (2, the `bindOrUnbindBindingElementEdge` calls),
`linearElementEditor.ts` (2, the options bag feeding `elbowArrow.ts`),
`App.drawshape.ts` (3, shape recognition), `interactiveScene.ts` (1, the
binding highlight) and `actionProperties.tsx` (2, elbow fixed-point). Counted
mechanically before and after: **11 appState-shaped raw reads in those files
before, 1 after** — the survivor being the selector's own read at
`binding.ts:161`.

**The trap that would have made this a silent no-op.** `interactiveScene.ts`
receives `InteractiveCanvasAppState`, a narrowed type that did not carry
`bindingMode` at all — and the selector's parameter is `bindingMode?:`
*optional*. So calling `isBindingEnabled(appState)` there **compiles clean and
always falls through to the raw flag**. The fix therefore also widens
`InteractiveCanvasAppState` and maps the field in `InteractiveCanvas.tsx`.
Making it *required* there does not work: `bindingMode` is optional on
`AppState` itself, so a required field breaks 9 `AppState ->
InteractiveCanvasAppState` assignments (App.tsx ×7, UnlockPopup, lasso). It is
declared optional to match. **Any future selector call must be checked for this
— optionality makes the compiler no help at all.**

**Coverage is structural, and deliberately so.** `build-excalidraw.mjs` gained
**stage 7**: it fails the build on any `appState|app.state|this.state|state`-
shaped `.isBindingEnabled` read outside a small allowlist (the selector, App's
3 preference-restore comparisons, InteractiveCanvas's prop mapping). Verified
to fire on the pre-fix source. Its regex deliberately does NOT match
`options?.isBindingEnabled` — that is options-bag plumbing carrying an
already-resolved boolean, ~7 legitimate sites in `elbowArrow.ts` /
`linearElementEditor.ts`; a first draft matched them and produced a meaningless
allowlist.

**Two behavioural tests were written for this and MEASURED VACUOUS — do not
cite them as coverage.** `arrowBinding.test.tsx`'s "bindingMode lock (flow)"
block asserts a locked-off arrow does not bind and a locked-on arrow does. Both
**pass against the pre-fix source**, because arrow *drawing* already routed
through the selector (`binding.ts:612`). The sites the fix actually changed are
canvas rendering, elbow routing/outline snapping and shape recognition — none
reachable from a jsdom draw gesture. They are kept as characterization tests
with that fact written into the file, and stage 7 is the real guard. **This is
the second time on this feature that an obvious-looking test turned out to
prove nothing; measure vacuity by running the test against the unfixed source
before claiming it as coverage.**

**A note on `isBindingEnabled` as a parameter name.** At
`actionProperties.tsx:2074/2088` the value is passed as
`calculateFixedPointForElbowArrowBinding`'s 5th positional argument, whose
parameter is named `shouldSnapToOutline`. So the lock now also suppresses
outline snapping on elbow conversion, which is the semantically consistent
result but is not what the call site's name suggests.

**Vendor suite baseline.** `yarn vitest run packages/element packages/excalidraw`
is **204 failed / 1462 passed (19 of 99 files)** on this fork *before* the
change and identically after — those failures are pre-existing fork drift, not
this work. The suite is not in flow's CI. Record the baseline before reading
any number from it as a regression.

This is the collision the paragraph at the top of this section predicted —
"a fourth collision will present as *feature X is always on while selecting*."
It does, and that prediction is now evidence that the pattern generalises: when
looking for the next one, grep vendor `App.tsx` for `event[KEYS.CTRL_OR_CMD]`
in *keydown/keyup* handlers, not just pointer handlers. The keyboard sites were
outside every sweep so far because all three fixed collisions were pointer-path.
**Add a second sweep axis from this correction: grep raw `event.ctrlKey` /
`event.metaKey` too.** Every site the original entry missed used the raw
property, which is why a `CTRL_OR_CMD`-only sweep found three of six — and the
raw form is also what makes a defect behave differently on macOS than on Linux.

### Two further notes on modifier-gated vendor code (no code changed)

- **`withCmdOrCtrl` is effectively stranded, not merely "out of scope".** Three
  places — its own `flow:` comment in `App.tsx` (~10978), the comment on the
  2026-08-14 drag fix, and the design spec — describe it as "read on
  pointer-up". Verified 2026-08-17 (re-verified; drifted 5 lines from the
  2026-08-16 figures of ~10973/~11444 due to this branch's own comment
  insertions): it is **written once** (`App.tsx:9169`,
  inside the `PointerDownState` literal) and **read at exactly one site**
  (~`App.tsx:11449`), which is inside the box-selection branch of
  `onPointerMoveFromPointerDownHandler` — the pointerdown-scoped **pointermove**
  handler, not `handleCanvasPointerUp`. Its guard is
  `!event.shiftKey && isSomeElementSelected(...)` plus
  `pointerDownState.withCmdOrCtrl && pointerDownState.hit.element`. But
  `hit.element` being set is precisely the case where, since the 2026-08-14 fix,
  the drag branch now moves the hit element instead of starting a marquee — so
  marquee select-through under a held modifier is largely unreachable under
  flow's model. The correct description is "stranded": the field is still
  written, still compiles, still read, and its read is almost never taken. The
  "runs on pointer-up" wording in all three places is wrong; treat any reasoning
  that leans on it as unsound.
- **No move cursor for a drag that works (UX papercut, pre-existing).**
  `App.tsx` ~8110 gates `CURSOR_TYPE.MOVE` on `!event[KEYS.CTRL_OR_CMD]` when
  hitting the common bounding box of the selection, and ~8124 repeats it with
  the comment `// if using cmd/ctrl, we're not dragging`. Since 2026-08-14 you
  *can* drag while the modifier is held, so the comment is false and the user
  gets no move affordance for an action that works — the cursor says "you can't
  do this" while the app does it. Same family as the collisions above
  (upstream's modifier assumption baked into a branch), cosmetic rather than
  behavioural, so it is recorded rather than fixed.

**A verification lesson worth generalising, from this same branch's own
review cycle.** Two separate implementer reports made claims that were not
mechanically executed, both caught in review rather than by their own
authors: one claimed a snap-toggle-ON path was "verified by hand" with no
script, log, or transcript behind it — a subagent cannot visually inspect a
running browser, so "verified by hand" is not a real claim, it's an assertion
wearing evidence's clothes. The other paraphrased a gate's per-test output
while presenting it in the same report alongside genuinely pasted transcripts
elsewhere, which reads as verbatim by association. **The standard: a claim
without a pasted command and its actual output is not evidence, regardless of
how confidently or specifically it's worded.** Both were fixed — the first by
adding a real positive-case e2e assertion, the second by pointing to the gate
that should have been pasted.

**The infrastructure trap that cost real time in this branch's own
verification.** A backgrounded full-suite Playwright run was silently killed
partway through **twice** in this session — once caught only because the
implementer waited on a notification that never arrived and the controller
had to confirm via `pgrep -af playwright` / `pgrep -af "node.*vite"` (both
empty) that the run was dead rather than slow. The hazard is specific: a
partially-completed background run's output looks exactly like a legitimate
partial result, not like a crash — nothing announces "this got killed." **Rule
for this repo: never background the full e2e suite; run it in the foreground
with an explicit timeout (600s worked) so a truncated run fails loudly instead
of reading as done.**

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
- e2e: `e2e/tool-override.spec.ts`, **15 tests** — the original 4, the
  elbow-arrow multi-point regression (final-review wave), the search-box typing
  regression (corrective pass), the drag/marquee pair (2026-08-14 drag fix), the
  three shift tests and the three snap/grid tests (third pass), plus the
  snap-ON-while-held test added 2026-08-16. Full e2e suite **183/185** green
  (2 pre-existing `text-panel.spec.ts` padding failures), plus the flake noted
  below.

  **The snap toggle × modifier matrix is now complete, and the third cell was
  the one that mattered.** The third pass shipped only OFF+held and ON+unheld —
  two tests that each differ from the real case in *two* variables, so neither
  isolated the modifier. The uncovered cell was ON+**held**: the user with Snap
  to Objects on who holds the override, for whom the original bug presented as
  "snapping stops working when I hold Cmd" — the more common of the two
  complaints. Added as "the snap toggle stays on while the modifier is held" and
  proven RED by reverting `snapping.ts` to upstream's `event[KEYS.CTRL_OR_CMD]
  ? !objectsSnapModeEnabled : objectsSnapModeEnabled`, rebuilding, and running
  it: it failed on its own assertion (`Expected: > 0 / Received: 0`) in the same
  run where its ON+unheld sibling passed.

  **A gesture that wasn't what it looked like.** The grid test's "drag from
  `BOX_EDGE`" is, once the box is selected, a drag of the **west resize
  handle** — so it resized and never changed `y`, which made
  `expect(y % gridSize).toBe(0)` vacuous and would have let a re-broken cmd-drag
  stay green (the box is drawn *after* grid mode is on, so it starts aligned).
  The test now does both gestures with before/after reads bracketing each: the
  edge resize (asserting `x` changed and is on-grid) and a genuine move pressing
  inside the selection bbox (both axes changed and on-grid). Measured values
  during the fix: resize/move from `(400, 260)` with `gridSize` 20 and a
  `+47,+33` offset lands at `(440, 300)`.

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
  groups (vendor `App.tsx:9549`, re-verified 2026-08-15 — was stale at
  `App.tsx:7223` before this correction, a casualty of the 2026-08-11
  upstream replay's line-number churn; `if (event[KEYS.CTRL_OR_CMD])` inside
  the pointerdown hit-test handler — drilling into groups regardless of a
  normal click's group-respecting behavior); every Cmd shortcut flaps the
  tool through selection and back.
