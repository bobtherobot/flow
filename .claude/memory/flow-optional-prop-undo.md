# Undo can't clear a flow-added optional element prop

Discovered 2026-08-05 while moving the padding control to the Text panel.
Applies to every optional property flow adds to the vendor element schema
(`cornerRadius`, `padding`, `startArrowheadSize`/`endArrowheadSize` …).

## Two separate things — one was a real bug, one is a vendor limit

**1. FIXED — the write must bump the element version.**
`src/lib/transform.ts setContainerPadding` assigned `padding` straight onto the
clone (`latest.padding = value`). `Store.detectChangedElements`/
`createElementsSnapshot` (vendor `store.ts:398/435`) decide an element changed by
comparing `versionNonce`, so the padding change was invisible to history: the
rewrapped bound text got captured (its own version bumps inside
`resizeSingleElement`), the container's padding did not. Undoing a later padding
edit therefore jumped back past every earlier one and left the property
unset. Fix: write it through `newElementWith(current, { padding })`, which bumps
`version`/`versionNonce` — the same reason `useSelectionStyle.update` uses it.
Verified by probe: raw assign ⇒ 2nd-edit undo cleared padding entirely;
`newElementWith` ⇒ undo steps 50 → 30 correctly.

**2. WON'T FIX (vendor) — undo never returns a prop to "never set".**
`ElementsChange.applyDelta` (vendor `change.ts:1264`) ends in
`newElementWith(element, partial)`, and `newElementWith`
(`element/mutateElement.ts:155-171`) **skips keys whose update value is
`undefined`** when deciding `didChange`. When the previous state had no such key
at all, the inverse delta is `{ padding: undefined }` ⇒ `didChange` false ⇒ the
element is returned untouched. So the FIRST-ever edit of one of these props
can't be undone; every edit after it undoes normally.

Corner radius usually dodges this by accident: `cornerRadiusUpdate` also writes
`roundness` (a defined value), which makes the delta non-empty and lets the
`cornerRadius: undefined` in the same spread land. An elbow arrow, which gets
only `{ cornerRadius }`, has no such companion.

**Test implication:** never assert "undo clears the property". Make two edits and
assert undo steps back to the first value — that's what
`e2e/stroke-panel.spec.ts` (radius) and `e2e/text-panel.spec.ts` (padding) do.

A real fix would need a fork edit (force-apply undefined keys in `applyDelta`, or
materialise defaults on every element); neither is worth it today. See
[[flow-fork-strategy]] and [[transform-panel]].
