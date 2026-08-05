# Drag-to-scrub numeric inputs — design

**Date:** 2026-08-05
**Status:** approved, ready to plan

Replace the range sliders that sit beside a numeric field with a drag gesture on
the field itself, the way Firefox's CSS inspector edits numbers. Sliders that
have no numeric field (the two arrowhead-size controls) stay.

## Problem

flow's panels currently express a numeric value two ways:

- `SliderInput` — a range track plus an optional numeric field, used 4×: stroke
  width (`src/ui/panels/StrokePanel.tsx:213`), fill/stroke/text opacity
  (`src/ui/panels/ColorPanel.tsx:75`, one per colour row), and start/end
  arrowhead size (`StrokePanel.tsx:265`, `:288`, both `hideValue`).
- `NumberInput` — a bare field, used 8×: Transform's W/H/X/Y/rotation/radius/
  padding (`src/ui/panels/TransformPanel.tsx`) and font size
  (`src/ui/panels/TextPanel.tsx:107`).

Three problems follow:

1. **The track is expensive and imprecise.** It eats the full row width to buy
   coarse control, and it cannot express the Transform panel's values at all —
   which is why half the panel's fields are type-only today.
2. **Two vocabularies for one concept.** A user editing stroke width and then
   position meets two different controls for the same kind of edit.
3. **Every intermediate value is an undo entry.** `useSelectionStyle.update`
   writes with `CaptureUpdateAction.IMMEDIATELY`
   (`src/ui/panels/useSelectionStyle.ts:94`), so one slider drag buries the undo
   stack under dozens of entries. Spreading a drag gesture across all 12 fields
   would spread that defect with it.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Drag mapping | Range-proportional over a fixed 150px travel | A full drag sweeps the control's own range, so opacity/width/rotation need no tuning |
| Wide-range fields | Per-field `scrubSpan` override | X/Y's ±1e6 bounds are sanity clamps, not a designed range — proportional there is ~13,000 units/px |
| Drag surface | Grip glyph **and** field body | Grip advertises the gesture; the body is where the pointer already is |
| Undo granularity | One entry per gesture | `EVENTUALLY` during the drag, `IMMEDIATELY` on release |
| Font size | Commit on release, no live preview | It writes via `executeAction`, not `updateScene`, so Change 4's fork edit does not reach it; batching it would need a second, unrelated edit inside the action's `perform` |
| Mixed selections | Scrub disabled | There is no start value to drag from |

## Change 1 — The gesture: `useScrubDrag`

**New file** `src/ui/panels/controls/useScrubDrag.ts`. All pointer maths lives
here so the grip and the field body share one implementation and the behaviour is
unit-testable without a DOM control.

```
useScrubDrag({ value, min, max, step, span, disabled, onScrub })
  → { onPointerDown, isDragging }
```

`onScrub(value: number, transient: boolean)` fires with `transient: true` for
every intermediate value and `false` once, on release.

### Gesture states

| Event | Behaviour |
|---|---|
| `pointerdown` | Ignore when `disabled`, `value === null`, or the button isn't primary. `preventDefault` to suppress native focus, record `anchorY` + `anchorValue`, subscribe `pointermove`/`pointerup`/`keydown` on `window`, enter *armed* (not yet dragging). |
| `pointermove` | Below a 3px threshold, stay armed. Past it, enter *dragging* and emit on every move. |
| `pointerup` | Dragging → emit the final value with `transient: false`, leave the field unfocused. Still armed → treat as a click: focus the input and select all, ready to type. |
| `Escape` | While dragging: emit the gesture's *start* value (not the anchor, which moves when a modifier changes) with `transient: false` and end. Since intermediates were never captured, this commits a no-op diff and leaves no undo entry. While merely armed (still under the threshold): cancel outright — neither a commit nor a click, because the press became neither gesture. |

Listeners live on `window` rather than using `setPointerCapture`, so a drag that
leaves the field keeps tracking. jsdom implements neither pointer capture nor
`hasPointerCapture`, so window listeners are also what makes the gesture
testable without stubbing DOM methods.

### Value maths

```
UNITS_PER_PX  = span / SCRUB_TRAVEL_PX      // SCRUB_TRAVEL_PX = 150
multiplier    = Shift ? 10 : Alt ? 0.1 : 1
raw           = anchorValue + (anchorY - y) * UNITS_PER_PX * multiplier
snapped       = round(raw / step) * step    // step defaults to 1
next          = clamp(snapped, min, max)
```

Dragging up increases. The value is derived from the gesture *anchor* rather than
accumulated per move, so it cannot drift and `Escape` is a trivial revert.

**Modifier changes re-anchor.** When the Shift/Alt state changes mid-drag, reset
`anchorY` to the current pointer position and `anchorValue` to the current value.
Rescaling the total delta instead would make the value jump the moment a modifier
is pressed.

Snapping is followed by a round to 4 decimal places to clear float noise (a
0.1 multiplier on a 0.5 step produces values like `2.4000000000000004`).

## Change 2 — The control: `NumberInput`

`src/ui/panels/controls/NumberInput.tsx` gains:

- `scrubSpan?: number` — units traversed by one full drag. **Defaults to
  `max - min`** when both are finite, which is exactly right for every field
  whose bounds are a designed range. Falls back to disabling the scrub when the
  bounds are infinite and no span is given.
- A `↕` grip rendered before the input, `aria-hidden` and not focusable — the
  input remains the only accessible control.
- `onChange(value: number, transient: boolean)`. `useNumberField` passes
  `false` for typed commits; the scrub passes `true` mid-drag.
- `id?` and `className?`, so Preferences can keep its `<label htmlFor>`
  association and its own dialog sizing (see Change 5).

**Focus arbitration.** The field body scrubs only while the input is unfocused.
Once focused the user is editing, so the body yields to native text selection and
only the grip keeps scrubbing.

`useNumberField` (`src/ui/panels/controls/useNumberField.ts`) needs no change at
all — its existing effect already reflects external `value` changes while
unfocused, which is how the field tracks a scrub in progress. `NumberInput`
adapts at the boundary, calling `onChange(v, false)` for typed commits.

**`step` has two jobs and only one of them is new.** It sets the scrub's
granularity (defaulting to 1) and, when a caller passes it explicitly, forwards
to `useNumberField` to snap typed values too. Leaving it `undefined` by default
preserves today's behaviour: Transform's fields must keep accepting fractional
typed input, which a forwarded default of 1 would silently round.

## Change 3 — `SliderInput` becomes slider-only

Its only remaining callers are the two `hideValue` arrowhead sizes, so the
numeric field, the `unit` and `hideValue` props, and the `useNumberField` import
all come out. The component keeps its name — it is now honestly just a slider.

It also joins the transient/commit protocol: `onChange` on the range emits
`transient: true`, and `onPointerUp` / `onKeyUp` / `onBlur` emit the final value
with `transient: false` — but only when a transient write is actually pending, so
the three end-of-gesture events cannot commit the same value twice. Without this
the arrowhead sliders would be the only controls left spamming undo.

## Change 4 — Undo plumbing

`transient` selects the capture mode at each write boundary: `EVENTUALLY` while
the gesture runs, `IMMEDIATELY` on release. `NEVER` is wrong — per
`vendor/excalidraw/packages/excalidraw/store.ts:130-170` it calls
`updateSnapshot`, advancing the history baseline so undo would step back a
single frame.

### Why this needs a fork edit

**Capture modes alone cannot batch a gesture.** This was verified empirically —
the e2e proof failed — and then traced:

`App.updateScene` (`packages/excalidraw/components/App.tsx:3892`) skips its whole
capture block when `captureUpdate === EVENTUALLY`, but still runs
`replaceAllElements`. Intermediates therefore advance the **live scene** while
leaving `store.snapshot` behind. On the closing `IMMEDIATELY` write, the payload
is routed through `filterUncomittedElements` (`store.ts:221`), which sees
`snapshot.version < liveVersion`, reads it as "in-progress local action", and
**rewrites the payload back to the stale pre-gesture snapshot**. `captureIncrement`
then diffs the snapshot against itself and emits nothing: zero undo entries, and
that element's history baseline silently freezes.

That guard is right for its purpose — it stops an unrelated `updateScene` from
half-capturing an action still in flight. It cannot tell that our closing write
*is* that action finishing.

### The fork edit (additive, default-off)

`updateScene` gains one optional field, `commitDeferredChanges?: boolean`. When
set, the payload is taken as authoritative and the filter is skipped:

```ts
const nextCommittedElements = sceneData.elements
  ? sceneData.commitDeferredChanges
    ? arrayToMap(nextElements)
    : this.store.filterUncomittedElements(
        this.scene.getElementsMapIncludingDeleted(),
        arrayToMap(nextElements),
      )
  : prevCommittedElements;
```

One branch and a documented field. Every existing caller — including collab
reconciliation, the reason the filter exists — is untouched, because the field
defaults to absent. `types.ts:778` derives the public `updateScene` type from
`App`'s method signature, so the field reaches flow's typings with no second edit.

This is flow's **4th behavioural fork edit** (after the arrowhead-size schema,
selection chrome, and zero-stroke safety). Per the fork strategy it is additive
and upstream-shaped rather than a patch to existing behaviour.

### Knowing when a write ends a gesture

The flag must be set only on a write that actually closes a deferred sequence —
an ordinary panel write (a colour swatch click) has no deferred frames behind it
and should keep the filter's protection.

`src/lib/deferred-commit.ts` holds that one bit of state, module-level because
only one pointer gesture can be in flight at a time:

```ts
let pending = false;
export const markDeferred = () => { pending = true; };
/** True exactly once per deferred sequence, then resets. */
export const consumeDeferred = () => { const was = pending; pending = false; return was; };
```

A transient write calls `markDeferred()`; a non-transient write calls
`consumeDeferred()` and passes the result as `commitDeferredChanges`. The control
layer's `(value, transient)` contract is unchanged — the distinction between "a
typed commit" and "the end of a drag" is derived at the write layer, where it
belongs, rather than pushed into every control.

| File | Change |
|---|---|
| `vendor/excalidraw` (branch `flow`) | `App.updateScene` gains `commitDeferredChanges?: boolean`; when set, skip `filterUncomittedElements`. Requires a package rebuild + type regen. |
| `src/lib/deferred-commit.ts` | New. The `markDeferred` / `consumeDeferred` pair. |
| `src/ui/panels/useSelectionStyle.ts` | `SetPropArgs` gains `transient?: boolean`; `update()` gains a trailing `transient?` param. Both resolve the capture mode and the new flag. |
| `src/lib/transform.ts` | `resizeElementDimension` and `setContainerPadding` gain a trailing `transient?: boolean` with the same resolution. |

Existing callers omit the argument and keep today's `IMMEDIATELY` behaviour with
the filter intact.

## Change 5 — Call sites

| Surface | Change |
|---|---|
| `StrokePanel` width | `SliderInput` → `NumberInput`; span defaults to its 0–10 display range |
| `ColorPanel` opacity (×3 rows) | `SliderInput` → `NumberInput`; span defaults to 0–100 |
| `StrokePanel` arrowhead sizes | Unchanged control, now transient-aware |
| `TransformPanel` W/H/X/Y | `scrubSpan={300}` → 2 units/px |
| `TransformPanel` rotation | No span needed — its 0–360 bounds are the range |
| `TransformPanel` radius/padding | `scrubSpan={200}` |
| `TextPanel` font size | `scrubSpan={150}`; see below |
| `PreferencesDialog` grid size | Hand-rolled `useNumberField` → `NumberInput` via the new `id` + `className` props; span defaults to its 5–100 range |

### Font size

`TextPanel` writes via `sel.executeAction("changeFontSize", n)`, and that action
hardcodes `CaptureUpdateAction.IMMEDIATELY`
(`vendor/excalidraw/packages/excalidraw/actions/actionProperties.tsx:274`).
Change 4's fork edit does not help here: it lives on `updateScene`, and the
action path never goes through it. Batching font size would need a second,
unrelated edit inside the action's `perform`.

Instead, `TextPanel` **drops transient writes**: it holds local state for the
in-progress value so the field's digits track the drag, and calls
`executeAction` once on release. The canvas does not preview mid-drag — the one
place this design accepts an inconsistency, in exchange for a clean undo stack
and a fork diff that stays one edit wide.

### Accessible-name rename

The field's label is `` `${ariaLabel} value` `` today, a suffix that existed only
to disambiguate it from the sibling range. With the track gone, stroke width and
the three opacity rows take the plain name (`"Stroke width"`, `"Fill opacity"`,
`"Stroke opacity"`, `"Laser opacity"`). Updates land in
`src/ui/panels/StrokePanel.test.tsx`, `src/ui/panels/ColorPanel.test.tsx`,
`e2e/color-panel.spec.ts`, `e2e/drawing-defaults.spec.ts` and
`e2e/stroke-panel.spec.ts`.

Font size is **not** renamed: its field is `"Font size value"` because the
sibling S/M/L/XL group owns the name `"Font size"`.

## Change 6 — Styling

In `src/ui/panels/panels.css`:

- Delete `.flow-ctl-slider__field`, `__num`, `__unit` (lines 369-394) — the
  slider no longer has a field.
- `.flow-ctl-num` gains `touch-action: none` so a scrub on a touch device does
  not scroll the panel.
- `.flow-ctl-num__grip` — 8×14, `--flow-ink-muted`, low resting opacity rising on
  row hover, `cursor: ns-resize`.
- `.flow-ctl-num__input` gains `cursor: ns-resize`, reverting to `text` on
  `:focus`, plus `appearance: none` on the spin buttons.
- `body.flow-scrubbing { cursor: ns-resize }`, set for the duration of a drag so
  the cursor holds while the pointer travels outside the field.
- `:disabled` keeps the default cursor — no gesture, no affordance.

## Testing

**Unit — `useScrubDrag.test.ts` (new).** The maths, without a control: span →
units/px; Shift/Alt multipliers; re-anchoring on modifier change; clamping at
both bounds; snapping to a 0.5 step; the 3px threshold; `Escape` reverting to the
anchor; inert when `disabled` or `value === null`.

**Unit — `NumberInput.test.tsx`.** A drag emits `transient: true` then exactly one
`transient: false`; a pointerdown/up without movement focuses and selects rather
than committing; a focused input ignores body drags but honours the grip; the
grip is `aria-hidden`.

**Unit — `SliderInput.test.tsx`.** Trimmed to slider-only, plus the new
transient-during / commit-on-release protocol.

**Unit — `useSelectionStyle.test.tsx`, `TransformPanel.test.tsx`.** Assert the
capture mode each write path resolves.

**E2E — `e2e/stroke-panel.spec.ts`.** Scrub stroke width with a real mouse drag,
assert the value changed, then assert **one** Ctrl+Z restores the original. This
is the test that proves the `EVENTUALLY` semantics, and it is the one to write
first — see Risks.

## Risks

- **~~`EVENTUALLY` batching is inferred from the store source, not yet
  observed.~~ RESOLVED 2026-08-05 — the inference was wrong.** The e2e proof
  failed: capture modes alone record *zero* undo entries for a gesture, because
  `filterUncomittedElements` reverts the closing write's payload. See Change 4
  for the trace and the fork edit that fixes it. The task ordering did its job —
  the assumption was tested before eight call sites were built on it.
- **The fork edit must survive upstream rebases.** It is one branch inside
  `App.updateScene`; a rebase that reworks the capture block could drop it
  silently. The e2e undo proof is the regression detector, and it must keep
  running after every vendor bump.
- **`type="number"` with a non-integer step.** Hiding the spin buttons is
  cosmetic, but browsers still validate against `step`; stroke width's 0.5 step
  is already in use today, so this is unchanged rather than new risk.
- **Discoverability.** A number field that scrubs is not obvious without the
  grip. If the grip proves too subtle in use, the fallback is widening the hover
  affordance, not adding the track back.
