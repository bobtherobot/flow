# Color system

Shipped 2026-08-11 (branch `feat/color-system`, 18 feature tasks + this
verification task). Replaced four scattered color surfaces (ColorPanel's three
rows, the Swatches dock panel, `SwatchPicker`, `SwatchGrid`) with one Color
panel plus a compact chooser pinned to the tool rail. Spec:
`docs/superpowers/specs/2026-08-11-color-system-redesign-design.md` (status
`shipped`). Full build ledger, including every reviewer-found defect and its
fix, in `.superpowers/sdd/2026-08-11-color-system-redesign/progress.md` — read
it before touching this code again, it is denser than this file.

Verification at the end of Task 19: unit 835/835 (83 files), typecheck exit 0,
e2e 126 passed / 2 failed (`text-panel.spec.ts`, confirmed pre-existing on
`main` — see below). No new runtime dependency was added anywhere in the branch.

## The load-bearing idea

**The color is derived from the selection, never stored.** `useColorTarget`
reads it every render through `useSelectionStyle`, so the Color panel and the
rail popup are two independently-mounted views of one truth with no sync
layer between them. Only the active part, the recents, and the numeric display
mode live in `color-store.ts` — they have no home on the canvas.

## `useColorDraft`'s re-seed rule — wrong twice before it was right

HSV has to live in the hook, not be recomputed from the selection's hex on
every render: `#000000` has no hue and `s: 0` has no hue either, so a picker
that round-trips through hex forgets which hue you were on the moment you drag
into a corner (`useColorDraft.test.tsx`: `"KEEPS THE HUE through a round trip
to black"`).

That much was in the plan. What the plan's own reference implementation got
wrong (Task 10, review 1) is the re-seed condition: a single "last hex seen"
field can't distinguish an outside change from the echo of this hook's own
`onCommit`, because `onCommit` updates the draft's state *before* the parent
re-renders with the new prop — so the hook sees its own stale, pre-echo prop
on the next render and misreads that as an outside write, re-seeding from it
and killing the hue it just set. This would have re-seeded on **every
pointermove of a transient drag**, not just in a test.

The fix tracks two fields, not one:
- `seenHex`/`seenAlpha` — the last (hex, alpha) pair actually observed as a
  prop, updated on every render that sees a new pair, regardless of origin.
- `emittedHex`/`emittedAlpha` — the last pair this hook itself produced via
  `onCommit`, used only to recognize an incoming prop as an echo.

A second bug surfaced only after the first fix (same task, same review round):
an **alpha-only** outside change at an achromatic hex still re-seeds and
destroys the hue, because the echo check compares the full (hex, alpha) pair
and an alpha-only change doesn't match either. Fixed with an `alphaOnly`
escape (`hex === draft.seenHex`) alongside the echo check. Reachable in
practice from two surfaces bound to one value (panel + rail popup) or from an
undo landing exactly on alpha.

**Anyone "simplifying" `seenHex`/`emittedHex` back into one field, or dropping
`alphaOnly`, reintroduces one of these two bugs.** The symptom is silent (no
crash, no type error — the hue value is just wrong the next time you rotate
it) and the round-trip test is the only thing that catches it.

## The stroke-width coupling: one rule, four call sites

`needsRevival(color, width)` in `useColorTarget.ts` is what makes
`quickSet("none")` on stroke zero the width, and applying a color afterward
revive it to a visible value. Task 11's review found it wired into only **two**
of the four write paths, which broke the empty-selection (tool-defaults) path
outright — set stroke to none, then draw a new shape, and the stroke stayed at
width 0 with no way to fix it from the panel; a different path could make an
existing shape's outline vanish entirely (real color, real width 0). Fixed by
extracting `needsRevival` and calling it from all four write paths:
single-selection write, multi-selection write, swap, and the empty-selection
tool-defaults write — the first two share one per-element code site called for
both single and multi selections, so "four" is a count of write paths, not of
distinct call sites in the source.

**The comparison is `??`, never `||`.** `strokeWidth: 0` is a legitimate,
meaningful value in this codebase (the whole 0–10px slider exists because 0 is
a real design choice — see [[drawing-defaults]], which has cost three separate
fork edits to the falsy-coercion trap). `0 || fallback` silently revives a
width the user deliberately zeroed; `0 ?? fallback` does not.

## `useSelectionStyle`: two instances are correct, a third is a hard crash

`PanelsRoot.tsx:37` and `ToolBar.tsx:53` each call `useSelectionStyle(api)`
independently and pass the result down (`ColorPanel`, `RailColorControl` →
`ColorPopup`, plus every other dock panel via `PanelsRoot`'s instance). That
duplication is deliberate, not an oversight — Task 16's plan called for
**lifting it into `App` and threading `sel` down**, on the false premise that
`PanelsRoot` didn't already have one. Doing it anyway does not just duplicate
work, it **crashes the app with an unconditional infinite render loop at
mount**:

`Excalidraw` is wrapped in `React.memo(ExcalidrawBase, areEqual)`; `areEqual`
shallow-compares every prop except `initialData`. `App.tsx`'s
`onExcalidrawAPI={(api) => ...}` is a fresh arrow function on every `App`
render, which busts the memo unconditionally, which fires the vendor's
`componentDidUpdate` (`App.tsx:4101`), which re-triggers its own change
emitter gated only on `isLoading` — not on any actual diff (`:4285`) — which
bumps state, which re-renders `App`, forever.

The fix keeps two call sites and touches nothing in `App.tsx`. It is sound
specifically because neither `PanelsRoot` nor `ToolBar` is an ancestor of
`<Excalidraw>` — both are its siblings, both re-read the live scene on every
render so they cannot drift apart, `activePart` is shared through the
module-level `color-store.ts` singleton so selection stays in sync across the
two surfaces, and the two hooks' write-through bumps batch into a single
emitter tick. The only real cost is a second `resolveTextTargetIds` scan per
change. **If a future refactor wants to deduplicate the two `useSelectionStyle`
calls, it must not route through `App` to do it** — find a sibling of
`<Excalidraw>` that both consumers can share, or leave it alone.

## The eyedropper atom is global; cancellation is scoped by handle identity

`openEyeDropper` (`src/lib/eyedropper.ts`) sets a jotai atom
(`activeEyeDropperAtom`, re-exported from the fork) that both the docked
`ColorPanel` and the rail's `ColorPopup` write to — there is exactly one atom,
not one per surface, because `LayerUI` renders the overlay itself off that one
value. The first cut of `cancelEyeDropper` cleared it unconditionally on
unmount, which is fine until the *other* surface has a pick in flight:
collapsing the Color accordion while the rail popup's pick is active would
silently kill it, and vice versa via rail-hide. `openEyeDropper` now returns an
opaque `EyeDropperHandle` (just `object`, never inspected), and
`cancelEyeDropper` nulls the atom **only if the current value is the same
object it was given** — reference equality, not structural. The common case
(vendor already cleared the atom on select or its own cancel) is then a
natural no-op. A cross-surface test that mounts both real components against
one shared store is what caught this; per-surface isolated tests could not.

`cancelEyeDropper(handle)` is called from an unmount `useEffect` on **both**
surfaces — `ColorPanel.tsx:39` and `ColorPopup.tsx:49`, each
`useEffect(() => () => cancelEyeDropper(pick.current), [])`. It is
ownership-scoped by handle identity precisely because the atom is global and
both surfaces share it: an unconditional cancel would let one surface's
unmount kill a pick the *other* surface had started (the Color accordion
collapsing mid-pick from the rail popup, or the rail hiding mid-pick from the
panel). This was not true after Task 18's first review round — at that point
`cancelEyeDropper` had no caller at all, which is a real earlier state
recorded in `.superpowers/sdd/2026-08-11-color-system-redesign/progress.md`,
but the fix round that added the identity guard added these two call sites in
the same pass. Don't cite the no-caller state as current.

## `deferred-commit.ts` has a module-global flag that can strand — not ours, but real

Task 14's implementer observed the app coalescing two back-to-back writes to
the same property into one undo step regardless of elapsed time, and initially
attributed it to vendor history batching. The reviewer traced the vendor
(`store.ts`, `history.ts`) and disproved that — no time window, no
same-property merge exists there; every non-empty delta gets its own history
entry. The actual cause is `src/lib/deferred-commit.ts`'s module-global
`pending` flag (`markDeferred`/`consumeDeferred`): a `markDeferred` call with
no matching `consumeDeferred` — e.g. a component unmounting mid-drag — leaves
`pending = true` for the rest of the session, so a later, unrelated write skips
the uncommitted-element filter and its history recording can be swallowed.

**Pre-existing, not introduced by this branch, but flow-owned** (not a vendor
bug — don't re-file it against Excalidraw). Consequence for e2e: "one Ctrl+Z
undid the drag" does not prove the drag made exactly one undo entry — it's
equally consistent with the drag's entry having silently absorbed an earlier
leaked deferral. `e2e/color-panel.spec.ts`'s undo test asserts **step counts**
across a sequence of distinct edits (including a real multi-move drag) rather
than inferring from a single restore, specifically because of this. Any new
undo-related e2e test should do the same, not the single-restore shortcut.

## `ColorSwatch` survived — it is not dead code

`src/ui/panels/controls/ColorSwatch.tsx` looks like it should have been
subsumed by the new picker, but it wasn't: `PreferencesDialog.tsx` and
`BackgroundControl.tsx` both still use it as the small color well for colors
that aren't element fill/stroke/text (laser trail color, canvas background) —
things `useColorTarget`'s selection-derived model has no way to address. A
`grep -rn "ColorSwatch" src` finding *only* those two consumers (plus its own
definition and test file) is confirmation the retirement was scoped correctly,
not a regression.

## `npm run build:excalidraw` was broken, silently, since the prior branch

Discovered in Task 18, not introduced by it: `package.json`'s
`build:excalidraw` called `yarn build:package`, a script that stopped existing
in the vendor's `package.json` after the 382-commit upstream-master monorepo
restructure ([[excalidraw-upgrade]]). Nobody had rebuilt the vendor package
since that upgrade landed on `main`, so nothing caught it until this branch's
eyedropper export needed a rebuild. Replaced with `scripts/build-excalidraw.mjs`
— yarn install, esbuild bundle via `buildPackage.js`, then `tsc` for
declarations, tolerating a non-zero `tsc` exit only after confirming
`dist/types/excalidraw/index.d.ts` actually exists (mirrors the historical
upstream failure mode where tsc printed pre-existing errors but still wrote
every declaration file; as of the 2026-08 upgrade it exits 0 clean, and the
tolerance is only a guard against that reappearing on a future upstream sync).

**flow has no CI — builds are local, deliberately.** A GitHub Actions workflow
briefly existed and was deleted on 2026-08-11. Its one genuinely valuable job
moved into `build-excalidraw.mjs` as stage 4: verifying that flow's fork edits
survived into the **built declarations**, so a submodule rebase that silently
drops one is caught at vendor-build time rather than surfacing later as a
baffling typecheck or e2e failure. That is strictly better than where it was —
CI only ever checked one of the two load-bearing edits, and only after a push.

The guard is a `FORK_EDITS` table at the bottom of the script
(`commitDeferredChanges` in `App.d.ts`, `activeEyeDropperAtom` in `index.d.ts`).
**Add a row whenever a new fork edit becomes load-bearing** — it is the only
automated thing standing between a rebase and a silently missing customization.

## The rail is 88px, and `box-sizing: border-box` is load-bearing

`RAIL_WIDTH = 88` (`src/ui/toolbar/ToolBar.tsx`) — read it, never hardcode it;
`App.tsx`'s canvas gutter and `--flow-toolbar-reserved` both follow the
constant. Widening it from 48 (Task 15) surfaced two bugs that unit tests
cannot see because jsdom does no layout:

- **The rail was rendering 89px, not 88**, because nothing in `src/` had
  `box-sizing: border-box` on the rail element and its `border-right: 1px`
  sat outside the declared width — pre-existing at 48px too (49 actual), but
  only large enough to matter once the brief promised zero gutter overlap.
  Fixed by adding `box-sizing: border-box` to `.flow-toolbar` itself, the
  element carrying the inline width.
- **`.flow-toolbar__tools`'s two-column grid silently hugged its content**
  instead of filling the rail, because `.flow-toolbar` is
  `align-items: center` and nothing forced the tools grid to stretch. Needs
  `align-self: stretch` or the quartet control added in Task 16 would have
  overflowed a content-width container. Both are exact-pixel-verified in
  `e2e/color-panel.spec.ts` (a real `boundingBox()` comparison against the
  canvas gutter), not just asserted by inspection.

`shouldRedock` (`ToolBar.tsx`) tests the rail's **left edge**, not its width —
it needed no retuning for the wider rail, despite the spec predicting it would.

## Layout of the code

- `src/lib/color-convert.ts` — hex/RGB/HSV/HSL, **unrounded floats**
  (rounding inside conversions drifts the color visibly during a drag)
- `src/lib/color-parts.ts` — which parts a selection exposes and where each
  writes; bare text exposes `["text"]` alone, a labeled container exposes
  `["fill", "stroke", "text"]` via `resolveTextTargetIds`/`boundElements`
- `src/lib/color-store.ts`, `src/lib/recent-colors.ts` — active part, 6
  recents (`flow.recentColors`, cross-document, no scene scan), numeric
  display mode (HSLA/RGBA/HEX)
- `src/ui/color/` — every picker primitive (`SaturationBox`, `HueSlider`,
  `AlphaSlider`, `NumericFields`, `PartChooser`), `useColorDraft`,
  `useAreaDrag`
- `src/ui/panels/useSelectionStyle.ts`, `src/ui/panels/ColorPanel.tsx` — the
  docked surface, one `useSelectionStyle` instance owned by `PanelsRoot`
- `src/ui/toolbar/RailColorControl.tsx` + `ColorPopup.tsx` — the rail
  surface, a second independent `useSelectionStyle` instance owned by
  `ToolBar`
- `src/ui/color/useColorTarget.ts` — the write path: `quickSet`, `swap`,
  `needsRevival`, MIXED resolution
- `src/lib/eyedropper.ts` — the fork export wrapper, handle-scoped cancel

## Other traps worth knowing before touching this code

- **The "default palette" concept is gone.** The panel's palette-select
  selection *is* the active palette now, still persisted under
  `flow.defaultPaletteId` (no migration — the key is reused as-is).
- **No `panel-dock-state` migration exists for the retired `swatches` id**,
  and none is needed: `syncPanelDefs` already drops unknown panel ids on
  load, so a saved layout naming `swatches` is silently and safely dropped by
  pre-existing code. The spec originally called this out as a risk needing a
  migration; it doesn't.
- **The eyedropper fork export is two re-export lines**
  (`activeEyeDropperAtom`, `editorJotaiStore` from
  `packages/excalidraw/index.tsx`), not a ported component — `LayerUI`
  already renders the overlay whenever the atom holds a payload. Needs
  `npm run build:excalidraw` to become visible in `dist/`.
- Text-only selections write text color to `strokeColor` under the hood
  (`PICKER_TYPE` in `eyedropper.ts` maps text to `"elementStroke"` for the
  eyedropper preview) — don't be surprised the text part previews as a
  stroke pick.

## The `text-panel.spec.ts` failures: confirmed pre-existing, not ours

Two e2e failures survived every task in this branch
(`"padding rewraps a container's bound text"` and `"padding applies to every
labelled container in a multi-selection"`), asserted throughout the ledger as
"pre-existing and unrelated" without ever being checked against `main`. Task
19 settled it: checked out `main` (`3ca5603`) into a sibling worktree, rebuilt
the vendor package there against `main`'s own pinned submodule commit
(`66b8e1e`, already post upstream-master-upgrade — the `.gitmodules` branch
field just still said `flow`, stale, corrected on this branch), and ran
`e2e/text-panel.spec.ts` alone. **Both failures reproduce byte-for-byte
identically on `main`** — same "Padding" field stuck `disabled` in test 1,
same `[45, 45]` vs expected `[30, 30]` mismatch after undo in test 2. They
predate this branch entirely (traced in [[excalidraw-upgrade]] to the
container-selection-after-editing question left open by that upgrade) and are
genuinely out of scope here.

See [[excalidraw-upgrade]] for the "kill stray vite servers before trusting
e2e" gotcha (still applies — `pkill -f vite` before any e2e run, checked at
the start of this task), [[drawing-defaults]] for the `??`-not-`||` pattern
this branch's `needsRevival` extends, and [[color-swatches]] (superseded) for
the palette-store design this branch built on top of but did not change.

## Two e2e specs flake under parallel load — re-run in isolation before chasing

`e2e/new-document.spec.ts:60` ("File ▸ New keeps flow's app-wide appState
preferences") and `e2e/style-memory.spec.ts` both fail intermittently when the
full suite runs in parallel, and both pass reliably on their own — including at
`--workers=4`. Measured on the merge of this branch: `new-document` failed 3 of
7 full-suite runs, always while the machine was otherwise busy, and passed every
time it was run alone.

Neither is related to the color work. `new-document` covers `flowSeedAppState`
and `File ▸ New`, which this branch never touched, and the merge that surfaced
it produced a tree byte-identical to the branch tip (`git diff` empty), so it
cannot have been introduced by the merge. This branch does add 15 e2e tests,
which raises worker contention and so probably raises how often the pre-existing
flake shows.

Separately and permanently red: `e2e/text-panel.spec.ts:201` and `:225`
(container padding). Those are **not** flakes — they fail deterministically, and
they reproduce byte-for-byte on `main` at main's own pinned vendor commit. Real
pre-existing bugs, out of scope here.

The whole suite's healthy state today is **127 passed / 2 failed**. Anything
else, re-run the failing spec alone before believing it.
