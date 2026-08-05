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
| Font size | Commit on release, no live preview | Excalidraw's `changeFontSize` hardcodes `IMMEDIATELY`; batching it needs a fork edit we don't want |
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
| `Escape` | Emit the gesture's *start* value (not the anchor, which moves when a modifier changes) with `transient: false` and end. Since intermediates were never captured, this commits a no-op diff and leaves no undo entry. |

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

`transient` selects the capture mode at each write boundary.

`EVENTUALLY` is the correct constant, **not** `NEVER`. Per
`vendor/excalidraw/packages/excalidraw/store.ts:130-170`, `NEVER` calls
`updateSnapshot` — it advances the history baseline, so a trailing `IMMEDIATELY`
would diff against the last intermediate and undo would step back one frame.
`EVENTUALLY` schedules neither branch: nothing is captured, the snapshot is left
untouched, and the next `IMMEDIATELY` records a single diff from the pre-drag
state.

| File | Change |
|---|---|
| `src/ui/panels/useSelectionStyle.ts` | `SetPropArgs` gains `transient?: boolean`; `update()` gains a trailing `transient?` param. Both resolve `captureUpdate: transient ? EVENTUALLY : IMMEDIATELY`. |
| `src/lib/transform.ts` | `resizeElementDimension` and `setContainerPadding` gain a trailing `transient?: boolean` with the same resolution. |

Existing callers omit the argument and keep today's `IMMEDIATELY` behaviour.

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
(`vendor/excalidraw/packages/excalidraw/actions/actionProperties.tsx:274`), so
flow cannot defer it without a third behavioural fork edit.

Instead, `TextPanel` **drops transient writes**: it holds local state for the
in-progress value so the field's digits track the drag, and calls
`executeAction` once on release. The canvas does not preview mid-drag — the one
place this design accepts an inconsistency, in exchange for zero fork edits and a
clean undo stack.

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

- **`EVENTUALLY` batching is inferred from the store source, not yet observed.**
  If anything else triggers a capture mid-drag, the gesture splits into two undo
  entries. Nothing on the panel path should, but the e2e undo test is the proof
  and should be written before the plumbing is spread across call sites.
- **`type="number"` with a non-integer step.** Hiding the spin buttons is
  cosmetic, but browsers still validate against `step`; stroke width's 0.5 step
  is already in use today, so this is unchanged rather than new risk.
- **Discoverability.** A number field that scrubs is not obvious without the
  grip. If the grip proves too subtle in use, the fallback is widening the hover
  affordance, not adding the track back.
