# Cmd/Ctrl means one thing — design

**Date:** 2026-08-15
**Status:** Approved, ready for planning

## Goal

Two user-reported problems, one root cause:

1. **Shift-click does not extend the selection while the Cmd/Ctrl override is
   held.** The user expects the temporary selection tool to behave like the real
   selection tool, shift-select included.
2. **Holding Cmd/Ctrl silently flips snapping.** The user wants snapping driven
   only by the explicit toggles that already exist (View ▸ Snap to Objects, the
   quickbar toggle, `Alt+S`), never by a held modifier.

The root cause of both: flow reserves Cmd/Ctrl for a *temporary selection tool*
(see [[tool-override]]), but upstream Excalidraw already reserves the same
modifier for several unrelated canvas behaviours. Because flow's override means
the modifier is held for the whole interaction, every one of those upstream
behaviours is now permanently on during selection work rather than being an
opt-in gesture.

This design removes the colliding canvas-gesture meanings so that, on the
canvas, **Cmd/Ctrl means exactly one thing: the temporary selection tool.**
Cmd/Ctrl *keyboard shortcuts* (`Cmd+Z`, `Cmd+V`, `Cmd+A`, …) are untouched.

## Prior art in this same collision

This is the third edit in the family. Recorded here so the pattern is visible:

- **2026-08-14** — upstream captured `withCmdOrCtrl` at pointerdown and used it
  to suppress element dragging. Holding the modifier gave a selection tool that
  could select and resize but never *move*. Fixed by dropping that clause from
  the drag gate.
- **This change** — the remaining two collisions (deep-select, snapping).

The [[tool-override]] memory lists both of the behaviours changed here as
"accepted trade-offs". This design retires that acceptance.

## Part A — shift-aware Cmd-click

### Why shift is currently ignored

`vendor/excalidraw/packages/excalidraw/components/App.tsx:9548` — on pointerdown
with a hit element, a Cmd/Ctrl branch runs *before* the normal selection logic:

```ts
if (event[KEYS.CTRL_OR_CMD]) {
  if (event.altKey) { /* lasso */ return false; }
  if (!this.state.selectedElementIds[hitElement.id]) {
    pointerDownState.hit.wasAddedToSelection = true;
  }
  this.setState((prevState) => ({
    ...editGroupForSelectedElement(prevState, hitElement),
    previousSelectedElementIds: this.state.selectedElementIds,
  }));
  // mark as not completely handled so as to allow dragging etc.
  return false;
}
```

`editGroupForSelectedElement` (`packages/element/src/groups.ts:272`) is a plain
replace:

```ts
{
  ...appState,
  editingGroupId: element.groupIds.length ? element.groupIds[0] : null,
  selectedGroupIds: {},
  selectedElementIds: { [element.id]: true },
}
```

It never reads `event.shiftKey`, and the `return false` means the shift-aware
path immediately below (line 9576 onward) is never reached. For an **ungrouped**
element this branch degenerates to "select only this one", which is why shift
appears to do nothing in the common case.

### Behaviour after the change

Drilling is kept — this was an explicit product decision, taken with "remove the
branch entirely, drill via double-click instead" on the table.

| Gesture | Behaviour |
|---|---|
| `Cmd`+click | Drill into the group, select that child. **Unchanged.** |
| `Cmd`+`Shift`+click, element not selected | Drill *and* **add** the child to the existing selection. |
| `Cmd`+`Shift`+click, element already selected | Deselect it — handled by the existing pointerup path, not by this branch. |
| double-click | Drill into a selected group. **Unchanged** (`App.tsx:7147-7168`). |

### Implementation

One fork site, `App.tsx:9548-9573`. The `event.altKey` lasso sub-branch and the
non-shift path stay byte-identical; a shift sub-branch is added.

When shift is held **and the element is not already selected**:

- `editingGroupId` = `hitElement.groupIds.length ? hitElement.groupIds[0] : null`
  (same drill context `editGroupForSelectedElement` would compute)
- `selectedGroupIds` = `{}` (same)
- `selectedElementIds` = previous selection **plus** the hit element, then passed
  through the existing exported helper
  `excludeElementsInFramesFromSelection` (`packages/element/src/selection.ts:54`)
  and wrapped in `makeNextSelectedElementIds`.

When shift is held **and the element is already selected**, the branch makes no
selection change at all.

### Two details that are load-bearing

**Deselection must NOT be implemented here.** Upstream performs shift-click
deselection at *pointerup* (`App.tsx:12222-12226`), gated on
`!pointerDownState.drag.hasOccurred` and `!pointerDownState.hit.wasAddedToSelection`
— specifically so that shift+*drag* moves elements instead of deselecting them.
That path already runs for Cmd+Shift+click. Toggling off at pointerdown as well
would double-toggle. Leaving the already-selected case untouched at pointerdown
is exactly what the plain selection tool does.

**The frame invariant must be preserved.** flow ships the Frame tool
(`src/ui/toolbar/tools.ts:63`), and the normal selection path spends ~40 lines
maintaining "a frame and its children are never selected together". Rather than
duplicating that, this design reuses `excludeElementsInFramesFromSelection`,
which is already exported and already used for the same purpose by
`getSelectionStateForElements` (`selection.ts:278`).

## Part B — Cmd/Ctrl stops affecting snapping

Cmd/Ctrl currently overrides **two independent** snapping systems. Both are
removed; snapping follows the explicit toggles alone.

### B1 — object snapping (the align indicators), 1 site

`packages/excalidraw/snapping.ts:162-192`. Today:

```ts
return (
  (app.state.activeTool.type !== "lasso" || isLassoDragging) &&
  ((app.state.objectsSnapModeEnabled && !event[KEYS.CTRL_OR_CMD]) ||
    (!app.state.objectsSnapModeEnabled &&
      event[KEYS.CTRL_OR_CMD] &&
      !isGridModeEnabled(app)))
);
```

This **inverts** `objectsSnapModeEnabled` while the modifier is held — it does
not merely enable it. (The user perceived it as "Cmd enables snapping" because
their `objectsSnapModeEnabled` is currently `false`; that field is persisted by
Excalidraw's own browser storage and is deliberately not a flow global, see
[[flow-global-appstate]].)

After:

```ts
return (
  (app.state.activeTool.type !== "lasso" || isLassoDragging) &&
  app.state.objectsSnapModeEnabled
);
```

The lasso guard is kept. The function's existing tail already returns
`app.state.objectsSnapModeEnabled`, so both paths now agree.

### B2 — grid snapping, 15 sites in `App.tsx`

All are the same idea — "while Cmd is held, don't snap to the grid" — in three
syntactic shapes:

- **9 inline:** `event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize()`
  at lines 10167, 10596, 10682, 11079, 13362, 13455, 13484, 13565, 13596.
- **5 multiline** on `this.lastPointerDownEvent?.[KEYS.CTRL_OR_CMD]` at lines
  9905, 9945, 9998, 10391, 10475.
- **1 compound** at line 9174:
  `event[KEYS.CTRL_OR_CMD] || isElbowArrowOnly ? null : this.getEffectiveGridSize()`.
  **Only the `event[KEYS.CTRL_OR_CMD] ||` term is removed here** — elbow arrows
  must keep their own grid bypass.

The first fourteen collapse to `this.getEffectiveGridSize()`. The fifteenth
becomes `isElbowArrowOnly ? null : this.getEffectiveGridSize()`.

Line numbers are as of fork commit `1831bf76` and are a starting point for
search, not a contract — each site must be matched by its surrounding code.

### Explicitly not touched

`withCmdOrCtrl` at `App.tsx:9169` stays. It still feeds marquee select-through
on pointerup, which is a separate meaning not in scope here. Every Cmd/Ctrl
*keyboard shortcut* is untouched. The `Cmd+Alt` lasso gesture is untouched. The
`Cmd`-skips-text-container-binding behaviour on double-click (`App.tsx:7189`) is
untouched.

### UI surfaces — unchanged, and that is the point

Snapping remains toggleable exactly where it already is:

- View ▸ **Snap to Objects** (`src/ui/menubar/MenuBar.tsx:221`, via
  `useViewToggles.ts`'s `objectsSnap`)
- Quickbar **Snap to objects**, shortcut `Alt+S`
  (`src/ui/quickbar/actions.ts:101`)

No flow-side code changes in Part B at all.

## Fork footprint and the replay cost

**17 sites across 2 vendor files**, all in `vendor/excalidraw`: 1 for Part A
(`App.tsx:9548`), 1 for Part B1 (`snapping.ts`), 15 for Part B2 (`App.tsx`). No
flow-side source changes are required by either part; flow's own behaviour
changes purely because the fork stops fighting it.

This is the first work on this feature that is **deletion-shaped rather than
additive.** Every prior fork edit here added a field or dropped a single clause;
these modify existing expressions in place, so an upstream replay will surface
them as conflicts rather than clean insertions. Mitigation:

- Every one of the 17 sites carries a `flow:` comment, so a future replay can
  `grep -n "flow:"` the two files and find them all.
- The count and the file list go into the memory file, per the
  replay-don't-merge workflow in [[excalidraw-upgrade]].

This roughly doubles the fork diff for this feature. That cost was presented and
accepted: Cmd/Ctrl having four simultaneous meanings during an override that
forces it held is the underlying defect, and patching one symptom at a time is
what produced the current state.

## Testing

**Unit** — the vendor changes are not reachable from flow's unit suite (they are
canvas pointer paths inside the fork). No new unit tests; the existing
`src/ui/toolbar/*` suites must stay green.

**E2E** — extend `e2e/tool-override.spec.ts`:

1. *Cmd+Shift+click adds to the selection* — select one shape, hold the
   modifier, shift-click a second, assert both ids are in
   `selectedElementIds`. Must be proven to fail before the fix.
2. *Cmd+Shift+click on an already-selected element removes it* — proves the
   pointerup deselect path still owns deselection and is not double-toggled.
3. *Cmd+Shift+drag moves the selection rather than deselecting* — the specific
   regression the pointerup gating exists to prevent.
4. *Holding the modifier no longer changes snapping* — with **Snap to Objects
   off**, drag an element past another's edge with the modifier held and assert
   no snap line appears (`appState.snapLines` stays empty). This is the direct
   regression test for B1, and it is the assertion that would have caught the
   inversion in the first place.
5. *Holding the modifier no longer bypasses grid snap* — with grid mode on,
   drag an element with the modifier held and assert the resulting `x`/`y` are
   multiples of `gridSize`. Direct regression test for B2.

Each new test must be verified RED against the unmodified fork before being
trusted — [[tool-override]] records a planned test on this exact feature that
passed with the feature deleted entirely.

**Full-suite watch.** [[tool-override]] records that changing selection
semantics on this feature previously took down 29 e2e tests across 9 spec files,
because many specs' draw helpers encode selection assumptions. Both parts here
change selection and snapping behaviour, so the full e2e suite — run
`--workers=1`, which this machine needs for trustworthy numbers — is a required
gate, not a formality. Two pre-existing `e2e/text-panel.spec.ts` failures are
expected; anything else is caused by this work.

## Scope / non-goals

- No change to marquee select-through, the `Cmd+Alt` lasso, or Cmd-on-dblclick
  text binding.
- No change to any Cmd/Ctrl keyboard shortcut.
- No change to the snapping UI, its toggles, or `Alt+S`.
- No change to `objectsSnapModeEnabled`'s persistence (still Excalidraw-owned
  browser storage, deliberately not a flow global).
- Group drilling on Cmd-click is **kept**, not removed.
