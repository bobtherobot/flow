# Grid line color

A global **Grid color** `ColorSwatch` in File ▸ Preferences, directly below
Grid size — `flow.gridColor`, default `#dddddd`. Shipped 2026-08-15. One
picked color paints the thin/regular grid lines verbatim; the bold
every-`gridStep` lines are derived, never stored.

## The inverted bold-lighter rule — READ THIS BEFORE "fixing" it back

Upstream Excalidraw's grid ships **bold darker** than regular
(`GridLineColor[theme] = { regular: "#e5e5e5", bold: "#dddddd" }` — bold is
the numerically smaller, darker hex). flow's derivation goes the **opposite**
direction: `boldGridColor()` in `src/lib/grid.ts` *lightens* each channel by
`GRID_BOLD_LIGHTEN = 8`, clamped at 255, so flow's bold is LIGHTER than its
regular. This is deliberate, not a bug someone should reconcile with
upstream. A 4px solid bold line reads far heavier on screen than a 1px dashed
regular one at equal lightness — lightening the bold line evens out that
perceived-weight mismatch instead of compounding it (darker *and* thicker
would look far heavier still). `DEFAULT_GRID_COLOR = "#dddddd"` reuses
upstream's own bold shade as flow's *regular*, and the derived
`+8` bold lands on `#e5e5e5` — upstream's own regular shade. So the pair
is literally upstream's two constants with their roles swapped, not new
colors. `GRID_BOLD_LIGHTEN`'s magnitude (8) is chosen to reproduce that exact
existing separation (`0xE5 − 0xDD = 8`), not picked freehand.

If you're diffing against upstream and see "bold is lighter, that looks
backwards" — it is backwards **on purpose**. Check this file before touching
`boldGridColor` or its sign.

## Two-field design; derivation stays in flow, not the fork

Only `flow.gridColor` round-trips through `localStorage`
(`src/app/preferences.ts` `get/setGridColor`, key `flow.gridColor`,
normalizes to canonical `#rrggbb` via `scrubHex` on write, drops unparseable
input rather than persisting it). `gridColorBold` is never independently
settable or stored anywhere — it's recomputed from `gridColor` by
`boldGridColor()` at both call sites that populate appState
(`flowSeedAppState` in `src/lib/flow-app-state.ts`, and the live-apply effect
in `src/App.tsx`), so the pair cannot drift out of sync. `boldGridColor` is
pure math with no dependency on vendor internals, which is why it lives in
flow's `lib/`, not the fork — it keeps the vendor diff purely mechanical
(thread two new fields through) with zero derivation logic duplicated across
both repos.

## Fork footprint: 4 vendor files, not 3

**The plan and spec both say "3 files" — that estimate was wrong.** The 4th
file (`StaticCanvas.tsx`) was added mid-execution during Task 4's review, as
an approved scope expansion. Record 4 here, not 3, if anything else cites
this feature's fork size.

- `packages/excalidraw/types.ts` — `AppState.gridColor?: string` /
  `gridColorBold?: string`; and the `StaticCanvasAppState` pick gets the same
  two fields, also optional, both commented `// flow`.
- `packages/excalidraw/appState.ts` — two `APP_STATE_STORAGE_CONF` entries
  (`{ browser: false, export: false, server: false }`), same shape as the
  existing `laserColor`/`selectionMode` entries: flow owns persistence,
  vendor must never browser-persist or export these.
- `packages/excalidraw/renderer/staticScene.ts` — `strokeGrid` gains two
  params (`gridColor`, `gridColorBold`) and its two `context.strokeStyle =
  isBold ? GridLineColor[theme].bold : GridLineColor[theme].regular` sites
  become `isBold ? gridColorBold : gridColor`. The call site passes
  `appState.gridColor ?? GridLineColor[renderConfig.theme].regular` (and the
  bold equivalent) — see the fallback trap below for why this line is
  order-sensitive. `theme` is now a dead parameter of `strokeGrid`; left in
  place deliberately to keep the signature stable.
- `packages/excalidraw/components/canvases/StaticCanvas.tsx` — the 4th file.
  `getRelevantAppStateProps` (the `React.memo` comparator's input) gains
  `gridColor`/`gridColorBold` to its pick. This is the one that was missing
  in the first cut and caused a real repaint bug — see below.

## The `StaticCanvasAppState` optionality trap

The brief's Step 2 specified the two new `StaticCanvasAppState` picks as
**required**: `gridColor: AppState["gridColor"]`. That breaks
`build:excalidraw` with **12 tsc errors across 6 files**. The reason:
`AppState["gridColor"]` is itself `string | undefined` (it's an optional
`AppState` field), but a *required* property of type `string | undefined`
still must be **present** (even if its value is `undefined`) at every object
literal that claims to satisfy `StaticCanvasAppState` — TypeScript's
excess-property/required-property checking doesn't care that `undefined` is
already in the value's type, it cares whether the key exists on the object.
Every call site across 6 files that builds a `StaticCanvasAppState`-shaped
object without explicitly naming `gridColor`/`gridColorBold` failed. Fix:
make both picks optional (`gridColor?: AppState["gridColor"]`), matching how
`AppState` itself declares them. Optional properties don't need to be present
at all, which is what every one of those 6 call sites actually assumed.

## What the 12 errors were actually pointing at — generalize this

Making the fields optional silenced all 12 errors correctly — that part of
the fix was right. But the errors weren't noise: they were the type system
mechanically enumerating **every site that constructs or narrows a
`StaticCanvasAppState`**, i.e. every place a value with the new fields might
need to flow through. Of those sites, `StaticCanvas.tsx`'s
`getRelevantAppStateProps` was the one where forwarding actually mattered
functionally, not just type-wise: it feeds the `React.memo` comparator that
decides whether the static canvas re-renders. Without `gridColor`/
`gridColorBold` in that function's returned object, a color-only
`updateScene({ appState: { gridColor } })` call changes React state but the
memo comparator sees no relevant difference (canvasNonce doesn't move,
elements keep identity, and the picked props excluded the new keys) — so the
canvas silently keeps painting the *old* color until something else forces a
repaint (pan, zoom, editing an element). The grid preference would have
looked broken/stale in exactly the cases a user is most likely to try first.

**Rule for next time:** after silencing a wave of type errors by widening a
type (adding `?`, loosening a union, etc.), don't just move on once `tsc` is
green — audit what those errors were actually pointing at. They often mark
real behavioral wiring, not just type paperwork.

## The theme-aware fallback trap

A first pass hardcoded `gridColor`/`gridColorBold` defaults into
`getDefaultAppState()` in `appState.ts`. That's wrong because
`GridLineColor` (upstream's built-in two-tone constant) is **theme-keyed**
— its dark-mode entry is produced by running the light constant through
`applyDarkModeFilter`, it isn't just a flat swap. Hardcoded, theme-invariant
defaults in `getDefaultAppState()` always win over the `??` fallback in
`staticScene.ts` (`appState.gridColor ?? GridLineColor[theme].regular`),
because `appState.gridColor` would never actually be `undefined` — it'd
already be the hardcoded default from mount. On flow's fork specifically
this would have painted a **near-white grid on the DARK theme**, since the
hardcoded default was the light-mode shade. Flow itself is unaffected in the
happy path (it always seeds its own pair via `flowSeedAppState`), but any
vendor-only code path or future removal of that seeding would have silently
regressed dark mode. Fix (review round 1, ruled in by the human partner,
superseding the plan's original text): **drop the hardcoded defaults
entirely**, leave both fields `undefined` in `getDefaultAppState()`, and let
the `??` in `staticScene.ts` resolve `GridLineColor[theme]` correctly per
theme when nothing else has set them.

## `??`, never `||`, on every fallback here

Same falsy-coercion class of bug the [[drawing-defaults]] memory already
tracks three separate fork fixes for on `strokeWidth` (where `0` is a valid,
meaningful value that `||` would discard). It doesn't directly apply to grid
color today — hex strings are always truthy — but every fallback added by
this feature (`scrubHex(hex) ?? DEFAULT_GRID_COLOR` in `boldGridColor`,
`appState.gridColor ?? GridLineColor[theme].regular` in `staticScene.ts`)
uses `??` on principle, matching the codebase-wide rule: nullish coalescing
for defaults, never `||`, so a future field on this pattern that *can*
legitimately be falsy doesn't inherit a silent bug for free.

## The e2e masking discovery — the most valuable finding here

`e2e/grid-color.spec.ts`'s pixel-sampling test very nearly didn't catch the
`getRelevantAppStateProps` bug above, for a subtle reason: **sampling canvas
pixels immediately after closing the Preferences dialog passes even with the
repaint bug fully present.** Clicking "Done" changes `appState.openDialog`,
and `openDialog` *is* one of the fields the memo comparator already tracked
— so closing the dialog forces an unrelated repaint that happens to paint
the correct (new) color anyway, laundering the exact bug the test exists to
catch. The fix is `setGridColor(page, hex, { closeDialog: false })`: the test
commits the hex value with Enter and samples pixels **while the dialog is
still open**, before anything else touches appState. This is documented in
three places in the spec (helper comment, test-level comment, and the
top-of-block doc comment) specifically so a future tidy-up can't silently
delete `closeDialog: false` and re-break the test's sensitivity without
anyone noticing test intent changed.

**General rule, not specific to this feature:** when pixel-testing that a
mutation causes a repaint, any *incidental* appState change between the
mutation and the pixel sample — closing a dialog, an unrelated toggle, a
pan/zoom, an edit — can force a repaint of its own and mask the very bug
the test is supposed to catch. Sample as close to the mutation as possible,
with nothing else touching tracked appState in between.

## `appState`-only e2e assertions cannot catch this class of bug at all

The other two tests in `grid-color.spec.ts` ("updates the live appState
colors", "persists across reload") only ever read `window.h.state.gridColor`
/ `gridColorBold`. Both would have passed with the memo-comparator bug fully
present — `updateScene` genuinely does update React's appState even when the
canvas doesn't repaint, so an appState-only assertion is structurally blind
to a "state changed but pixels didn't" bug. Only the pixel-sampling test
closes that gap, and it was **negative-control verified**: the implementer
reverted the `getRelevantAppStateProps` fix, rebuilt the fork, re-ran the
test, observed `hits: 0` (confirming the test does fail without the fix),
then restored the fix and confirmed the submodule gitlink was back at
`fada646f`. Treat pixel sampling as required, not decorative, for any future
canvas-rendering preference — appState assertions alone are not sufficient
coverage for a repaint bug.

## Shipped

- `src/lib/grid.ts` — `DEFAULT_GRID_COLOR = "#dddddd"`,
  `GRID_BOLD_LIGHTEN = 8`, `isGridColor` (3/6/8-digit hex type guard),
  `boldGridColor(hex)` (per-channel lighten, clamp 255, unparseable input
  falls back to the default's own bold shade rather than throwing).
- `src/app/preferences.ts` — `get/setGridColor` over `flow.gridColor`.
  Read: missing/invalid → default; valid → `scrubHex`-normalized. Write:
  invalid input is silently dropped, never persisted.
- `src/lib/flow-app-state.ts` — `gridColor` added to `FlowAppStatePrefs`
  and to `flowSeedAppState`'s seed (both `gridColor` and the *derived*
  `gridColorBold: boldGridColor(gridColor)`); both keys also added to
  `FLOW_GLOBAL_APP_STATE_KEYS` so a saved `.excalidraw` doc's own values for
  either field are stripped on open rather than clobbering the live
  preference — `gridColorBold` is listed there too even though it's never a
  *stored* preference, because it's still flow-owned live state that a
  document must not be able to inject.
- `src/App.tsx` — `gridColor` state seeded from `getGridColor()`;
  `handleChangeGridColor` validates with `isGridColor` before committing;
  a `useEffect` applies both fields live via `updateScene({ appState:
  { gridColor, gridColorBold: boldGridColor(gridColor) } })`, cast the same
  way `selectionMode`/`laserColor` already are (`as unknown as
  Parameters<ExcalidrawAPI["updateScene"]>[0]`) since these are fork fields
  absent from the vendor `.d.ts`; `gridColor` included in `appStatePrefs`
  so File ▸ New re-seeds it via the same ref both `initialData` and New
  share (see [[flow-global-appstate]] for why that ref exists at all).
- `src/ui/PreferencesDialog.tsx` — a `ColorSwatch` row labeled "Grid color"
  (title/aria hook: `"Grid color hex"`), directly below the Grid size row,
  wired to `gridColor`/`onChangeGridColor` props.
- 4 vendor files — see the fork-footprint section above.

## Known gap, deferred

`handleChangeGridColor` in `App.tsx` validates the incoming value with
`isGridColor` (accepts 3/6/8-digit hex) but does **not** run it through
`scrubHex` before setting React state, while `setGridColor` in
`preferences.ts` *does* normalize before persisting. Currently unreachable
in practice — every `ColorSwatch` interaction path emits a canonical
6-digit lowercase hex — but a non-canonical valid hex (e.g. 3-digit shorthand
or mixed case) would leave live appState and localStorage disagreeing until
reload. Left as-is; flagged during Task 6 review as a plan-level gap, not an
implementer deviation.

## Tests

`src/lib/grid.test.ts` (bold-derivation channel math, clamp-at-255,
`isGridColor` boundaries), `src/app/preferences.test.ts` (round-trip,
normalize-on-write, corrupt/missing storage), `src/lib/flow-app-state.test.ts`
(seed + global-keys membership), `src/ui/PreferencesDialog.test.tsx` (row
renders, wired to props), and `e2e/grid-color.spec.ts` — 3 tests: live
appState update, persist-across-reload, and the pixel-sampling repaint
regression test described above. Full suite at ship: unit green, e2e 176/178
(the 2 failures are the pre-existing, unrelated `text-panel.spec.ts` ones
also tracked in [[grid-size-preference]] and other recent memories).

Related: [[grid-size-preference]] (sibling Preferences row, contrast — zero
fork edits there vs. 4 here), [[flow-global-appstate]] (the
`FLOW_GLOBAL_APP_STATE_KEYS` list this feature adds two entries to, and the
seed-ref pattern File ▸ New depends on), [[laser-color]] (precedent for the
fork-field + `updateScene` cast pattern this feature reuses), [[selection-mode]]
(another fork-field precedent, same cast requirement), [[drawing-defaults]]
(the `??`-not-`||` falsy-coercion lesson this feature's fallbacks follow on
principle).
