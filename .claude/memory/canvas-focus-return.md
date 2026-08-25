---
name: canvas-focus-return
description: "Fix (2026-08-25, fix/canvas-focus-return): return keyboard focus to the canvas after fire-and-forget chrome interactions, so undo/Escape/Delete/nudges don't go dead"
metadata:
  type: project
---

## The bug

Ctrl+Z (and Escape, Delete, arrow-key nudges) went dead after clicking any
toolbar/quickbar/bottombar button, or after committing a panel number field —
until the user next clicked the canvas. Root cause: Excalidraw binds keydown to
`.excalidraw-container` itself (`vendor/excalidraw/packages/excalidraw/components/App.tsx`,
the `onKeyDown` JSX prop on the container div — React synthetic, so it only
fires when the native event's target is that container or a descendant of it),
not `document` — the document binding is gated behind `handleKeyboardGlobally`,
which flow does not set (see [[pending-followups]] for why not: it would fire
canvas shortcuts while flow's own dialogs/menus are open). flow's chrome is a
DOM sibling of `<Excalidraw>`, so a keystroke raised while a chrome control has
focus never reaches the container's listener at all.

flow had already solved this once, narrowly: `src/ui/panels/PanelsRoot.tsx`
forwards undo/redo only (`src/lib/history-shortcuts.ts`), and bails on
`isTextEntry` — so a committed number field was still dead.

## The fix

`src/lib/focus-canvas.ts` — `focusCanvas()` calls
`document.querySelector(".excalidraw-container")?.focus({ preventScroll: true })`.
Safe to call when the container isn't mounted (optional chaining). This exact
one-liner already existed inline in `useQuickArrowDrag.ts`'s `arm()` (a
quick-arrow drag suppresses the canvas's own focus transfer via
`preventDefault`) — the helper just gives it one home.

Four call sites, all "fire-and-forget, never a popup trigger" (checked):
- `ToolButton.tsx`, `QuickButton.tsx`, `BottomButton.tsx` — call `focusCanvas()`
  right after the supplied `onClick()`.
- `useNumberField.ts`'s `onKeyDown` Enter branch — call `focusCanvas()` **after**
  `e.currentTarget.blur()` (order matters: blur's own default focus-shift would
  otherwise run after and steal it back). **Enter only, never blur** — blur means
  focus is already headed somewhere the user chose (Tab to the next field), and
  stealing it back would break Tab-between-fields. The Escape branch also blurs
  but must not call `focusCanvas()` for the same reason.

**Deliberately out of scope**: the menubar. Radix restores focus to its own
trigger on menu close by design; overriding that risks breaking keyboard menu
navigation. Recorded as a known remaining gap in [[pending-followups]].

## Verification gotcha worth remembering: Ctrl-hold has a side effect that fakes a passing undo test

`useToolOverride.ts` listens for the Ctrl/Cmd modifier on `window` with
`capture: true` — unconditional, not gated by focus at all (same placement
pattern as `App.tsx`'s Ctrl/Cmd+F repoint). Holding Ctrl (as `page.keyboard
.press("Control+z")` does, mechanically: Control down, z down+up, Control up)
engages flow's temporary "hold Ctrl for Selection" override, then **restores
the previous tool on Ctrl-up** — and restoring to anything other than
`"selection"` deselects the element.

First draft of the e2e Enter-commit test asserted on the **number field's
displayed value** reverting to the pre-edit number after Ctrl+Z. That passed
even with the fix's `focusCanvas()` call deleted — not because undo ran, but
because the tool-override's Ctrl-up deselected the element, and the Stroke
Width field falls back to `appState.currentItemStrokeWidth` (the panel's
"default width for nothing selected") when there's no sole selection — which
happened to equal the pre-edit value (2), making the assertion pass for a
reason that had nothing to do with the fix. Confirmed by reading the *raw
scene element's* `strokeWidth` directly (`h.app.scene.getNonDeletedElements()`)
at each step: it stayed at 9 (never reverted) the whole time the fix was
removed, while `selectedElementIds` and the field's own text both looked
consistent with "it worked." `e2e/canvas-focus.spec.ts` now asserts against the
raw scene element for exactly this reason — a lesson in the same family as
[[style-memory]]'s "mutation-test the assertion, not just the code": a test
that reads a *derived display value* which has more than one path to the same
number is not proof of the thing it claims to prove.

## Verified clean

- No visible focus ring: `.excalidraw-container`'s computed `outline-style` is
  `none` on a programmatic focus following a click, and it doesn't match
  `:focus-visible` (browsers reserve `:focus-visible` styling for
  keyboard-initiated focus).
- No page scroll: `preventScroll: true` confirmed via `window.scrollY` unchanged
  across a `focusCanvas()` call on a scrolled page.

## Numbers

Unit 1381 → 1393 (+12: focus-canvas.ts ×3, one per button ×3, useNumberField
Enter/blur ×2, plus the pre-existing suite unaffected). Each of the four
call-site tests was mutation-checked (removed the `focusCanvas()` call, watched
the specific new test fail, restored, watched it pass again) — see commit
history on `fix/canvas-focus-return`. e2e chromium 223 → 226 (+3,
`e2e/canvas-focus.spec.ts`, run 3× with identical results). typecheck clean.
