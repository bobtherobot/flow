# Per-category style memory

Shipped 2026-08-06. Spec: `docs/superpowers/specs/2026-08-06-style-memory-design.md`.
Plan: `docs/superpowers/plans/2026-08-06-style-memory.md`.

Four session-scoped buckets — shape, linear, text, freedraw — remember the last
selected or edited element's style and apply it to the next element drawn in
that category. `src/lib/style-memory.ts` (pure), `src/lib/style-memory-store.ts`
(singleton), `src/ui/useStyleMemory.ts` (onChange bridge, mounted in `App.tsx`).

## The rules that are not obvious from the code

- **Only contended keys are bucketed.** A `currentItem*` key two or more
  categories can render (stroke colour/width/style, opacity, background, fill,
  roundness, cornerRadius) needs a bucket (`CATEGORY_KEYS` in `style-memory.ts`).
  Everything else — font size, arrowheads, arrowType, textColor, **and
  padding** — is *resident*: vendor's single slot is already correct because
  nothing else writes it. `currentItemPadding` is the sharpest example: only
  shape containers can carry padding at all, so it is never bucketed by any
  category, not even loosely — appState is its only home. `setContainerPadding`
  in `src/lib/transform.ts` writes it directly on every live edit; adoption
  writes it through `snapshotContainerPadding` folded into the text bucket's
  patch (see below), but the value itself still lives only in appState.
- **Adopt-on-select fires only for a single-element add.** Marquee and Ctrl+A
  deliberately change nothing — there is no last-clicked element.
- **Edits are captured by watching `currentItem*` drift**, not by instrumenting
  the callers. That is what catches `executeAction` dispatches (TextPanel's font
  family) and vendor keyboard shortcuts, and why `useSelectionStyle` needed no
  change at all. The corollary: a panel control that writes an element prop but
  never touches its matching `currentItem*` default is invisible to this
  mechanism — see the fork-edit section below, this bit the radius/padding
  controls directly.
- **Arrows never take `currentItemRoundness`** — they derive their curve from
  `currentItemArrowType` (vendor `App.tsx`, `newArrowElement`). Lines *do* read
  it. `applicableKeys` encodes this; getting it backwards silently squares off
  curved arrows.
- **The load uses `CaptureUpdateAction.NEVER`.** It changes defaults only. Using
  IMMEDIATELY here puts a phantom entry on the undo stack for every tool click.
- **Unset corner radius is a meaningful third state, not "no opinion."** Every
  other contended key is a plain default: if a category never recorded one,
  quietly falling through to whatever the previous category left in appState is
  a harmless soft fallback. Radius is not — vendor reads
  `element.cornerRadius ?? 16` for elbow arrows and branches on
  `typeof cornerRadius === "number"` for shapes, so a stale literal `0` leaked
  from a square-cornered rectangle turns an elbow arrow's 16px bends sharp.
  `RESET_WHEN_UNRECORDED` (`style-memory.ts`, currently just
  `currentItemCornerRadius`) is the set of contended keys `resolveLoad` must
  reset to an explicit `undefined` rather than leave untouched when the target
  bucket never recorded one. This is why `useStyleMemory.ts`'s `applyPatch` no
  longer has an `if (value === undefined) continue` guard — that guard used to
  swallow exactly this reset, silently restoring the stale value it existed to
  clear. `Object.is(appState[key], value)` on the next line already dedupes the
  case where both are already `undefined`, so nothing else changed.
- **Panels must write their own `currentItem*` default alongside the element
  edit — drift capture only sees appState writes, not raw element mutation.**
  `StrokePanel`'s `setRadius` passes `{ currentItemCornerRadius: value }` as
  `useSelectionStyle.update`'s third (`currentItems`) argument, which existed
  already for this purpose (compare the adjacent stroke-width control) but
  radius's multi-property update (`cornerRadius` + `roundness`) never supplied
  it before this feature. Without it, editing an already-selected box's radius
  writes the element but never reaches the bucket at all.

## Traps

- **The single most valuable trap in this feature: vendor `_newElementBase`
  silently drops any field not in its hand-enumerated return list.**
  (`vendor/excalidraw/packages/excalidraw/element/newElement.ts`.) It
  destructures a fixed set of names and rebuilds the element literally from
  them — `cornerRadius` and `padding`, passed correctly at every call site
  (`baseElementAttributes`, `newArrowElement`), landed in `...rest` and were
  discarded before the element was ever constructed. No error, no type failure
  — the appState field held the right value and the created element just
  never got it. Fixed with `cornerRadius: rest.cornerRadius, padding:
  rest.padding`, mirroring the existing `customData: rest.customData` line.
  Every constructor built on `_newElementBase` (`newElement`, `newArrowElement`,
  `newLinearElement`, `newFreeDrawElement`, ...) shares this fix. **Anyone
  adding a new fork element field will hit this exact failure mode, and it is
  silent** — verify with a debug probe on the created element, not just on
  appState, the way Task 5 eventually did.
- The bridge writes via `updateScene`, which re-fires `onChange`. The refs must
  be updated *before* the write or the hook folds its own load back into the
  wrong bucket. `useStyleMemory.test.tsx` pins this with
  `"does not fold its own load back into the wrong bucket"` — do not weaken it.
- `style-memory-store.ts` is a module singleton, so every test needs
  `resetStyleMemory()` in `beforeEach` (same hazard as `resetDeferred`).
- `currentItemRoughness` is deliberately excluded. Sloppiness is an app-wide
  preference re-asserted at the call site; see [[flow-sloppiness-global]].

## Known gap

Double-click-to-text and Enter-on-a-container create text without a tool change,
so they miss the load. Only `currentItemOpacity` is affected — every other text
key is resident. In practice flow folds alpha into an 8-digit colour hex rather
than moving element opacity, so no flow control writes `currentItemOpacity`
today.

## Fork edit

`currentItemCornerRadius` and `currentItemPadding` added to vendor `appState.ts`
+ `types.ts`, read at `baseElementAttributes` in
`createGenericElementOnPointerDown` and at `newArrowElement`, plus the
`newElement.ts` pass-through trap above. Extends the `bcfbfff6` fork commit
that already owns the `cornerRadius`/`padding` element fields. See
[[arrowhead-size]] for the same schema-extension pattern and
[[selection-mode]] for the vendor rebuild procedure (`buildPackage.js` from
`packages/excalidraw`, then `tsc` directly to regenerate `dist/types` — a
fresh clone needs this before flow's own `tsc` can resolve
`@excalidraw/excalidraw`, since `dist/` is gitignored).

## e2e vendor gotchas (found writing `e2e/style-memory.spec.ts`)

- **`Escape` cannot deselect from a test.** Once focus leaves Excalidraw's own
  container (e.g. after blurring a flow panel input), its keydown handler never
  sees the keypress at all — `src/App.tsx` does not set
  `handleKeyboardGlobally`, so the listener is bound to Excalidraw's container
  div, not `document`. It *does* work inside the text WYSIWYG, where focus never
  left. There is no `deselect` helper in the spec file for this reason; a
  rail-tool click already clears the selection before the next draw.
- **A transparent-fill shape's interior is not a hit.** `shouldTestInside`
  returns false for a transparent-background rectangle, so a test must click
  the hollow shape's **outline**, never its centre, to select it.

## Testing lesson: mutation-test the assertion, not just the code

Reviewers repeatedly found tests that passed for reasons unrelated to what they
claimed to prove: a `typeof x === "number"` assertion on a value that could
never be anything else; store tests whose resident-key-filtering assertion held
whether or not the filtering existed (`toEqual({})` silently ignores an
`undefined`-valued key — `toStrictEqual` does not); a re-entrancy test that
still passed after swapping the exact ordering it was written to pin; and two
e2e cases (test 1, and the `[6, 6]` stroke-width assertion in test 4 at
`e2e/style-memory.spec.ts:148`) that pass with the whole hook unmounted, because
vanilla Excalidraw's single shared `currentItemStrokeWidth` already carries a
value forward between two same-category draws regardless of per-category
memory — left in place as regression guards, but their names overstate what
they prove. The practice that caught all of these: break the invariant the test
claims to protect, confirm the test fails, then restore it. Worth keeping as
routine for this codebase, not just as history from this one feature.

## Deferred, not fixed

`src/lib/transform.ts` still has no unit test file — `setContainerPadding`'s
appState write is covered only at the e2e layer.
