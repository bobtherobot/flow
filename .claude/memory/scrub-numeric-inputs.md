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

## Gotchas

- `NumberInput`'s `step` is forwarded to `useNumberField` only when a caller
  passes it explicitly. A default of 1 would round the fractional values the
  Transform fields accept.
- Field accessible names lost the `" value"` suffix (`"Stroke width"`,
  `"Fill opacity"`) when the sibling slider disappeared. Font size kept
  `"Font size value"` — its S/M/L/XL group owns `"Font size"`.
