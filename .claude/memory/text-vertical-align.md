# Text panel: vertical align + line height (Controls ▸ Text)

**Shipped 2026-08-25.** A `top / middle / bottom` segmented control in the Text
panel, under the horizontal Align row, for text bound inside a shape.

## Zero fork edits

Vendor already owns the whole behaviour: `verticalAlign` is a real field on text
elements and `actionChangeVerticalAlign` (`actions/actionProperties.tsx`) both
writes it and calls `redrawTextBoundingBox`. flow only dispatches it through the
existing `executeAction` bridge — the same route `changeTextAlign` already took.
Nothing was added to the fork, and there is no `currentItem*` default to seed.

## The gate is narrower than `hasText`

`resolveBoundTextIds` (`src/lib/selection-style.ts`) filters `resolveTextTargetIds`
down to text whose `containerId` resolves to a **non-arrow** container. That
mirrors vendor's `shouldAllowVerticalAlign` (`packages/element/src/textElement.ts`):
loose text has no box to align within, and an arrow label rides the line. The
`padding` gate next to it looks similar but is NOT interchangeable — padding
targets the *container* ids and enumerates container types explicitly, vertical
align targets the *bound text* ids and only excludes arrows.

## Icon language is deliberately not the Align panel's

`AlignPanel` already ships `ALIGN_TOP/VCENTER/BOTTOM` icons (guide line + bars)
for aligning elements to each other. Reusing that vocabulary here would have read
as a duplicate of that control, so the Text panel's icons draw the container's
**box** with the text block pushed to one edge. Aria labels are likewise
"Align text top/middle/bottom", so a locator can't collide with the Align panel's
"Align top/middle/bottom" when both panels are docked.

## e2e gotcha

`e2e/text-panel.spec.ts`'s `addText` helper clicks a fixed (600, 380). A probe
rectangle drawn over that point swallows the click and the text becomes that
rectangle's *label* instead of a free element — which silently inverts what a
"free text has no box" assertion is measuring. The gate test draws its bare
container at (340,240)–(500,340), clear of the helper's click.

Related: [[transform-panel]] (padding moved into this panel), [[flow-optional-prop-undo]].

---

# Line height (same panel, shipped 2026-08-25)

`1 / 1.5 / 2` presets plus a manual field, laid out exactly like the Size row
(`--top` + `--stack`). Also zero fork edits.

## Vendor has no action for this — flow writes it

Unlike vertical align, there is no `changeLineHeight` to dispatch, so the write
lives in `setTextLineHeight` (`src/lib/transform.ts`), shaped like
`setContainerPadding` beside it. The two shapes of text need different
follow-ups and getting either wrong is silent:

- **Bound text** → write only `lineHeight`, then `api.redrawBoundText(container)`
  (the flow fork export padding already uses). The container re-wraps, re-fits
  and re-centres the label, and grows if the taller text no longer fits.
- **Free text** → nothing recomputes its box, so the new `height` goes in the
  same `newElementWith`. It is *computed*, not measured:
  `lineCount × fontSize × lineHeight` is vendor's own `getTextHeight`, and
  `restore.ts` inverts exactly that formula (`detectLineHeight`) to recover the
  value from a reloaded scene — so a wrong height would silently corrupt the
  line height on reload. Line height cannot change where text wraps (only the
  wrap *width* can), so the line count is already known.

## There is no `currentItemLineHeight`

A new text element takes its line height from the *font*
(`getLineHeight`, 1.15–1.25 per family), so there is no tool default to seed and
nothing for style-memory to bucket. The field therefore shows blank rather than a
fabricated default when nothing is selected, and a fresh element usually lights
*no* preset — same as an off-preset font size.

## Surviving a font change — the ONE fork edit in this work

Vendor's `changeFontFamily` overwrites `lineHeight` with the incoming font's own
metric on every font change. That is right for text still carrying the *old*
font's metric and wrong for a value the user picked, and the difference is only
knowable by comparing against the old font's default — so
`index.tsx` gained an additive re-export of **`getLineHeight`** (one line in the
flow block that already re-exports the eyedropper and the shape registry), plus a
`FORK_EDITS` entry in `scripts/build-excalidraw.mjs` so a rebase can't drop it
silently. Build now reports **4 fork edits verified**.

`TextPanel.changeFontFamily` then: capture `customLineHeights` (element
`lineHeight !== getLineHeight(element.fontFamily)`), dispatch the action, and
`restoreTextLineHeights` straight after. Three things make this work, all
measured rather than assumed:

1. **Order.** The restore must come *after* the action; before it, the action
   just overwrites it again.
2. **The async branch is already safe.** When the font faces aren't loaded,
   vendor defers the redraw into `document.fonts.load().then()`, and that
   callback re-reads each element **from the scene by id** (with an explicit
   upstream comment about not closing over a stale instance). So it measures
   against the line height restored here. Probed at +200ms and +1.4s: height
   stayed 120 for a 3-line/20px/2.0 element, i.e. never 1.15.
3. **Undo stays one step.** The restore's own `updateScene` did NOT add a second
   history entry — `undoStack` went 2 → 3 across the whole font change, and one
   Ctrl+Z returned font *and* line height together. Do not "fix" this with the
   deferred-commit machinery; it already behaves.

Deliberate limit: a user who sets a line height that happens to *equal* the
font's own default is indistinguishable from one who never touched it, and loses
it on a font change. The alternative (pinning a flag in `customData`) was
rejected — it would not protect scenes created before this feature, and undo
cannot unset a newly-added optional prop ([[flow-optional-prop-undo]]), so the
pin would go stale.

## Pre-existing gap found while testing (NOT fixed)

Committing any panel number field blurs it to `<body>`, outside both the dock and
Excalidraw's container, so **Ctrl+Z does nothing straight after typing a value +
Enter**. Written up in full — mechanism, scope, why it was deferred — in
[[pending-followups]].
