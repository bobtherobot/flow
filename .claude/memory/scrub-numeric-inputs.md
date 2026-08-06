# Drag-to-scrub numeric inputs

**Shipped:** 2026-08-05. Spec: `docs/superpowers/specs/2026-08-05-scrub-numeric-inputs-design.md`.
Plan: `docs/superpowers/plans/2026-08-05-scrub-numeric-inputs.md`.

Every numeric field in the panels scrubs like Firefox devtools' CSS inspector.
The range sliders beside stroke width and opacity are gone; the two arrowhead
sizes keep bare sliders because their number is meaningless.

## How it works

- `src/ui/panels/controls/useScrubDrag.ts` owns the gesture. 150px of vertical
  drag sweeps `span` value units (up increases), Shift ×10, Alt ×0.1, 3px drag
  threshold, Escape reverts to the gesture's start value.
- Listeners live on `window`, not pointer capture — jsdom implements no
  `setPointerCapture`, and window listeners survive a drag leaving the field.
- `span` defaults to `max - min`. Fields whose bounds are sanity clamps pass
  their own: W/H/X/Y 300, radius/padding 200, font size 150.

## The undo rule — and why it needed a fork edit

Callbacks are `(value, transient)`. Transient writes use
`CaptureUpdateAction.EVENTUALLY`; the closing write uses `IMMEDIATELY` **plus**
`commitDeferredChanges: true`, so one gesture is one undo entry.

**Capture modes alone do not work.** This was tried first and proven wrong by the
e2e test — it recorded *zero* undo entries. `App.updateScene` skips its capture
block for `EVENTUALLY` but still runs `replaceAllElements`, so intermediates
advance the live scene while `store.snapshot` lags. The closing `IMMEDIATELY`
write is then routed through `filterUncomittedElements` (`store.ts:221`), which
sees `snapshot.version < liveVersion`, reads it as an in-flight local action, and
rewrites the payload back to the stale snapshot. Nothing is captured, and the
element's history baseline silently freezes.

**Never use `NEVER`** either — it advances the snapshot, so undo would step back
only the last intermediate value.

### The fork edit (flow's 4th behavioural one)

`App.updateScene` gained an optional `commitDeferredChanges?: boolean`; when set,
the payload is authoritative and `filterUncomittedElements` is skipped. One field
and one branch, default-off, so collab reconciliation is untouched. `types.ts`
derives the public `updateScene` type from `App`'s method, so it reaches flow's
typings with no second edit.

**This is the thing to re-verify after every upstream rebase.** A rebase that
reworks the capture block could drop it silently; `e2e/stroke-panel.spec.ts`'s
undo tests are the regression detector.

### `src/lib/deferred-commit.ts`

Holds one bit: whether transient writes are awaiting a commit. A transient write
calls `markDeferred()`; a non-transient one calls `consumeDeferred()` and passes
the result as `commitDeferredChanges`, so an ordinary panel write (a colour
swatch click) keeps the filter's protection. `resetDeferred()` exists because a
gesture that ends without its commit — the control unmounting mid-drag — would
otherwise leak the bit to the next unrelated write. Both `SliderInput` and
`NumberInput` release it from a `useEffect` cleanup gated on their own pending
state.

Threaded through `useSelectionStyle.setProp`/`update` and `lib/transform.ts`'s
`resizeElementDimension`/`setContainerPadding`, all defaulting to non-transient.

## Ctrl+Z had to be forwarded from the panels

`PanelsRoot` is a DOM **sibling** of `<Excalidraw>` (`src/App.tsx`), and the
vendor binds keydown on its own container unless `handleKeyboardGlobally` is set —
which flow does not set. So no keyboard shortcut reaches the canvas while a panel
control has focus. This predates the feature but lands on it: a scrub leaves the
field unfocused, so undo would do nothing.

`src/lib/history-shortcuts.ts` + a `PanelsRoot` handler forward **undo/redo only**.
`handleKeyboardGlobally` was considered and rejected: it would fire canvas
shortcuts while flow's own dialogs and menus are open (pressing "d" with
Preferences open would switch the tool underneath it).

**Known remaining gap:** every other shortcut (Delete, tool keys) is still
unreachable while a panel control has focus. Fixing that broadly deserves its own
spec.

## Font size is the exception

Excalidraw's `changeFontSize` action hardcodes `IMMEDIATELY` inside its own
`perform`, and the fork edit lives on `updateScene`, which the action path never
touches — so it does not reach here. Batching font size would need a second,
unrelated fork edit, which was declined. `TextPanel` instead holds the in-progress
value in local state and calls `executeAction` once on release: its digits track
the drag, the canvas does not. This is the design's one deliberate inconsistency.

## Vendor rebuild procedure

From `.claude/memory/selection-mode.md`, and it still bites: run the package build
from `vendor/excalidraw/packages/excalidraw` as `node ../../scripts/buildPackage.js`
(running it from the submodule root fails). `yarn` is blocked on Node 25.
`buildPackage.js` does **not** emit types — regenerate with
`node_modules/.bin/tsc -p tsconfig.json` from that same directory, which prints
pre-existing upstream errors and still emits. Fork edits must be committed on the
submodule's `flow` branch **and** the parent gitlink bumped; `dist/` is gitignored.

## The native spin buttons are back (2026-08-05)

The `↕` scrub grip beside each field is gone — the whole field body already
scrubs, so it was redundant — and `<input type="number">`'s own spin buttons are
enabled in its place. Fields went 56px → 64px (the buttons reserve ~12px of
layout, the grip freed ~11px beside the field; 64 is the widest that fits two
fields plus axis captions in the 260px default dock, which the old pair
overflowed).

Three things had to be true for this to work, all measured in Chromium with a
throwaway Playwright probe rather than reasoned about:

1. **The spinners fire `input` per step and one `change` on release**, which maps
   exactly onto the existing transient/commit split — so a click, or a held
   button's auto-repeat, is one undo entry. **This is why the buttons previously
   did nothing to the object**: the field only commits on blur/Enter, and a spin
   gesture involves neither.

   **Telling a step from typing is engine-specific, and this is where it first
   shipped broken.** Chromium dispatches a plain `Event` with no `inputType`;
   **Firefox dispatches an `InputEvent` with `inputType: "insertReplacementText"`**
   (typing is `"insertText"` in both). Reading only the interface — "not an
   InputEvent means it's a spin" — worked in Chromium and made Firefox's buttons
   do nothing at all, since every Firefox step was read as typing and deferred to
   a blur the gesture never produces. `NumberInput.isUiStep` now checks a
   `spinning` ref (a press is down on the buttons — engine-agnostic, and the
   reason a third engine can't reproduce this) *first*, with the `inputType`
   allowlist as the converse safety net. `e2e/number-field.spec.ts` runs on
   Firefox as well as Chromium precisely because jsdom renders no spin buttons
   and cannot catch any of this.
2. **`preventDefault()` on pointerdown kills the spinner outright** — no step,
   no focus. The scrub arms itself that way (to suppress focus), so a press
   within `SPINNER_HIT_PX` of the field's right edge is left entirely to the
   browser. Measured with this field's padding/border (6px inset): Chromium's
   control is 15px wide (reaching 21px in), **Firefox's is 18px (reaching 24px)**
   — hence 25, which costs a few px of Chromium field body that starts no
   gesture and beats a band of Firefox button that does nothing when pressed.
   Firefox also does **not** focus the field on a spin press, where Chromium
   does; that is why a stale display shows up there first (see below).
3. **A wheel over a *focused* number field steps it** (unfocused does nothing).
   Suppressed outright — inside a scrollable dock it edits values by accident,
   and its `change` wouldn't arrive until blur, leaving the deferred-commit bit
   set across unrelated writes. React registers `wheel` passively at the root, so
   this needs a native listener with `{ passive: false }`.

A mixed (`null`) selection hides the buttons via `.flow-ctl-num--mixed` — there
is no base value to step from, and stepping an empty field would write an
arbitrary one to everything selected.

### Stroke width's step had to match its display precision

`StrokePanel` passed `step={units === "px" ? 0.5 : unitStep(units)}`, but
`PRECISION.px` is 0 — `displayValue` rounds px to whole numbers. So a half-step
landed on a width the field cannot render: the element held 2.5 while the field
showed "3", and a spin-button click looked like it did nothing. (Firefox showed
it immediately, because it doesn't focus the field on a spin press, so the
value-echo effect overwrote the text; Chromium hid it until the next re-read.)
`unitStep` already returns the display-consistent step for every unit, px
included, so the px override is gone. Same rounding that retired the 0.5px
*minimum* — see [drawing-defaults.md](drawing-defaults.md). **A control's `step`
must agree with the precision its unit displays at.**

### The commit bug this uncovered

`commitPending` guarded its closing write on `next !== committed.current`. In the
live app that is **always** equal: every transient write echoes straight back as
a new `value` prop and the sync effect updates `committed.current`. So the
gesture-closing commit never fired — the scene advanced past a stale snapshot
with nothing captured. It only looked right in unit tests, where a static `value`
prop never echoes. `SliderInput.commit` is unconditional for exactly this reason;
`commitPending` now is too. **This affected the shipped held-arrow-key path, not
just the new spinners.** `NumberInput.test.tsx`'s `LiveField` wrapper (a parent
that echoes each write back) is the regression detector — a static `value` in a
test cannot catch this class of bug.

### Known gap: undo right after a spin gesture

A spin gesture leaves the field focused, and `isTextEntry` (lib/history-shortcuts.ts)
deliberately leaves Ctrl+Z to the browser's own text-undo stack for `type="number"`
inputs — so undo doesn't reach the canvas until focus leaves the field. Identical
to the pre-existing arrow-key behaviour, but far more visible now that a mouse
gesture triggers it. Fixing it means deciding that canvas undo outranks text undo
in flow's panels; not taken here.

## Gotchas

- `NumberInput`'s `step` is forwarded to `useNumberField` only when a caller
  passes it explicitly. A default of 1 would round the fractional values the
  Transform fields accept.
- Field accessible names lost the `" value"` suffix (`"Stroke width"`,
  `"Fill opacity"`) when the sibling slider disappeared. Font size kept
  `"Font size value"` — its S/M/L/XL group owns `"Font size"`.
