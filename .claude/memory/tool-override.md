# Tool override (hold Cmd/Ctrl for selection)

Illustrator-style temporary tool override plus a permanently-on tool lock.
Spec/plan: `docs/superpowers/specs/2026-08-07-tool-override-design.md`,
`docs/superpowers/plans/2026-08-07-tool-override.md`. Branch `feat/tool-override`.

**Status: code shipped (Tasks 1–7 committed, unit suite green), but Task 8's
full-suite verification found a real regression the branch introduces across
the wider app. NOT closed out — see "Known regression" below before this
branch merges.**

## Shipped
- `src/ui/toolbar/tool-override.ts` — pure: `overrideKeyFor(platform)` (Meta on
  Apple, Control elsewhere — mirrors the vendor's `KEYS.CTRL_OR_CMD`, and is
  deliberately NOT "either key" because macOS Control is right-click emulation)
  and `canEngage(state, target)`.
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
- **ZERO fork edits.** Everything routes through `setActiveTool` /
  `getAppState` / `updateScene` / `onChange`.
- **The restore is two calls, in this order.** `setActiveTool` gives the right
  cursor but clears the selection for any non-selection tool (vendor
  `App.tsx:4758`, guarded on `nextActiveTool.type !== "selection"`); the
  follow-up `updateScene({appState:{selectedElementIds, selectedGroupIds,
  editingGroupId}})` puts it back. Selection is read FRESH at release — an
  engage-time snapshot would clobber an undo made mid-hold.
- **Never `setActiveTool({type:"image"})` from this feature** — it re-fires
  `onImageAction` and re-opens the OS file picker (vendor `App.tsx:4741`). Both
  the engage guard (`canEngage`) and the lock normalizer skip the image tool
  for this reason.
- **Don't engage mid-gesture.** The vendor reads Cmd during a drag to bypass
  grid snapping and to close elbow arrows, so `canEngage` bails on
  `cursorButton === "down"`, `newElement`, and `multiElement`.
- Accepted consequences (from the spec, all still true): Cmd+drag with a
  *shape* tool no longer draws snap-free; Cmd-hold + click always drills into
  groups (vendor `App.tsx:7223`, `if (event[KEYS.CTRL_OR_CMD])` inside
  `handleSelectionOnPointerDown` — **not** `:6936` as an earlier draft of this
  memory had it; that line is unrelated `withCmdOrCtrl` plumbing for elbow-arrow
  grid snapping); every Cmd shortcut flaps the tool through selection and back.
- Related: [[vertical-toolbar]] (the rail this padlock left),
  [[quick-actions-bar]], [[view-menu-toggles]].

## Known regression (found in Task 8 full verification, unresolved)

**Forcing the tool lock permanently on silently disables auto-selecting a
newly drawn element, breaking any workflow that draws a shape and immediately
expects it selected.** This is vendor behavior, not a flow bug introduced by
new code — it is an unconsidered *consequence* of Task 3's design decision.

Root cause, read directly from `vendor/excalidraw/packages/excalidraw/components/App.tsx`:
- ~line 9638, the generic-element pointerup path: `if (!activeTool.locked &&
  activeTool.type !== "freedraw" && newElement) { ...selectedElementIds:
  [...prevState.selectedElementIds, newElement.id]... }` — selecting the just-drawn
  element is gated on the tool **not** being locked.
- ~line 9693, right after: `if (!activeTool.locked && activeTool.type !==
  "freedraw") { ...activeTool: updateActiveTool(..., {type:"selection"})... }`
  — reverting to the selection tool is gated the same way.
- The linear-element path (~line 9107) has the identical split: locked skips
  straight to `{ newElement: null }` with no `selectedElementIds` update at all.

Both "stop reverting to selection after a draw" (intended, spec line 8–9) and
"stop auto-selecting what you just drew" (not discussed anywhere in the spec's
Decisions or Accepted-consequences tables) are bundled behind the same vendor
`activeTool.locked` check. Task 3 turned the flag permanently on to get the
first effect and got the second for free, uninspected.

**Confirmed via A/B against the pre-feature baseline** (`git worktree add` at
`80e23b7`, the commit main was at when this branch forked — has the spec/plan
docs but none of the feature's code): every one of the 29 e2e failures below
passes cleanly on that baseline and fails identically, twice, reproducibly on
`feat/tool-override`. This rules out flakiness/environment; it is a genuine
regression from this branch.

**29 e2e failures, all traceable to the same root cause** — every affected
spec's own `draw`/`drawWith`/`drawRectangle` helper carries a comment stating
the now-false assumption ("the new element ends up selected" / "leaves it
selected"): `color-panel.spec.ts` (3), `drawing-defaults.spec.ts` (3, though
note only 3 of its 5 tests — the other 2 don't depend on selection),
`edit-actions.spec.ts` (1), `number-field.spec.ts` (2 chromium + 2 firefox),
`selection-mode.spec.ts` (2), `stroke-panel.spec.ts` (6), `style-memory.spec.ts`
(4), `text-panel.spec.ts` (4), `transform-panel.spec.ts` (3). Full names in
the Task 8 report.

**This was not caught by Tasks 4–7** because their own e2e coverage
(`tool-override.spec.ts`, `view-toggles.spec.ts`) never draws-then-immediately-
asserts-selected through a panel; the regression only surfaces once the whole
suite runs together, which is exactly what Task 8 is for.

**Not fixed here.** The right fix is a design decision, not a mechanical
patch: either (a) add a third `useToolOverride` responsibility that manually
re-selects a just-finished element when locked (flow-level, no fork edit,
plausible — `onChange` already sees `newElement` transition to `null`), or (b)
accept the new interaction model (draw, then Cmd-click to grab what you drew)
and update all nine affected spec files' `draw` helpers to Cmd-click for
selection before asserting panel state, matching the real end-user workflow
this feature now imposes. Both are real engineering work belonging to a
follow-up task, not this verification pass.

## Tests
- Unit: `src/ui/toolbar/tool-override.test.ts` (11, covers every `canEngage`
  guard, including "does not engage when the selection tool is already
  active" — this is the ONLY coverage of that guard; see gotcha below),
  `src/ui/toolbar/useToolOverride.test.tsx` (16, engage/restore/blur/
  visibilitychange/lock-normalizer). Full unit suite after this branch:
  **631 tests / 69 files, all green.**
- e2e: `e2e/tool-override.spec.ts`, **4 tests** (not 5 — see gotcha below).

## Gotchas for anyone touching this again

- **A 5th e2e test was written and deliberately deleted** (`bf5ce4f`): "the
  modifier does nothing when the selection tool is already active". It
  asserted `activeTool.type` stayed `"selection"` across a held modifier — true
  whether or not `useToolOverride` is mounted at all, since nothing in the app
  would change it either way. Deleting `useToolOverride` from `App.tsx`
  entirely would not have failed this test. The real guard
  (`canEngage` rejecting an already-selection active tool) is covered at the
  unit level instead. Do not re-add an e2e version of this without first
  proving it can fail — mutate the guard away and confirm red before trusting
  a new assertion here.
- **`.at(-1)` does not typecheck in this repo.** `tsconfig.json` pins
  `target`/`lib` to ES2020 and a prior commit (`9c1f515`, "drop tsconfig lib
  bump") deliberately reverted an ES2022 bump added only to support `.at(-1)`
  in tests, on review grounds that widening `lib` project-wide is an
  unreviewed side effect a test change shouldn't cause. `useToolOverride.test.tsx`
  reads `arr[arr.length - 1]` instead, with a comment pointing at that commit.
  Anyone reaching for `.at(-1)` in a new test here will hit the same wall.
- **Task order was swapped from the plan**: quickbar-toggle removal (`ca3cb1d`)
  landed *before* rail-padlock removal (`d969a01`), reversing the plan's Task
  5/6 order. Narrowing `TOOL_ICONS` to `Record<ToolId, ReactNode>` (part of the
  rail removal) breaks `src/ui/quickbar/icons.tsx`'s `TOOL_ICONS[LOCK_ID]`
  lookup until the quickbar's own `LOCK_ID` entry is gone too — the two files
  share that one coupling point despite `LOCK_ID` being two independent
  constants in two different modules.
