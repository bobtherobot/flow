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
  `AlphaSlider`, `NumericFields`, `PartChooser`, `PartArt`, `PaletteSection`,
  `PickerRow`), `useColorDraft`, `useAreaDrag`. `PartArt` owns all part
  artwork (see the picker-refinement section below — it replaced a CSS
  `::after` trick). `PaletteSection` folds palette curation into the Color
  panel. `PickerRow` no longer renders a preview well; `ColorPreview.tsx` is
  gone from the tree entirely, not merely unlisted here.
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

The whole suite's healthy state today is **130 passed / 2 failed**. Anything
else, re-run the failing spec alone before believing it.

## The picker-refinement branch (2026-08-11, second pass) — CSS artwork moved into `PartArt.tsx`

A follow-up branch (`feat/color-picker-refinement`, created from `main` after
the section above shipped; plan
`docs/superpowers/plans/2026-08-11-color-picker-refinement.md`, spec
`docs/superpowers/specs/2026-08-11-color-picker-refinement-design.md`;
ledger `.superpowers/sdd/2026-08-11-color-picker-refinement/progress.md`)
redid five things postdating everything above: all part-chooser artwork moved
from CSS to SVG, the part stack rearranged (taller than wide), the
quick-colour quartet became a 2×2 grid at smaller sizes, the palette grid
gained a drag-to-delete trash tile, and the round preview well (`ColorPreview`)
was removed from `PickerRow`. Verification at the end of Task 7 (this
branch's last task): unit 868/868 (84 files), typecheck exit 0, e2e 129
passed / 2 failed — the same two `text-panel.spec.ts` failures as always, no
new ones.

### `PartArt.tsx` replaces the CSS `::after` ring hole-punch

The stroke box used to read as a ring via a `::after` pseudo-element painting
a smaller inset square in the panel background color over a solid swatch.
`color.css` used to carry a comment explaining why the more obvious approach
(a double inset `box-shadow` — an outer inset shadow in the swatch color
layered over an inner inset shadow in white) doesn't work: both insets grow
inward *from the edge*, so over an already solid-filled background the result
is a color band at the edge and a bullseye of solid white filling the rest of
the interior — not a ring, and not fixable by adjusting the two inset
amounts. `PartArt.tsx` replaces the whole approach with concentric stroked
SVG paths and now carries that same "box-shadow can't do this" reasoning in
its own comments — `color.css` no longer has an opinion on rings at all. (The
old `flow-clr-part--{fill,stroke,text}` classes were left CSS-inert per the
task brief rather than pruned at the time; the 2026-08-11 final-review pass
removed them from `PartChooser.tsx` after confirming with `grep -rn
"flow-clr-part--" src/ e2e/` that nothing selected them — `flow-clr-part` and
`flow-clr-part--active` are the only ones any CSS rule uses.)

**The mechanism**: one `<path>` per layer, stroked at successively narrower
widths, **widest first**. An SVG stroke of width W straddles the path line by
W/2 each side, so painting back-to-front in descending width produces even
concentric bands — ink (width 8, or 15 for the ring), panel-surface (4, or 11
for the ring), and for the stroke part a third band in the real color (7),
all three `fill="none"` so the ring stays hollow. **Reversing the layer order
is a silent visual regression, not a crash or a type error**: the ring
collapses into a solid dark square and the filled parts lose their light rule
entirely. `PartArt.test.tsx` is the only thing that catches it — check the
DOM order of the `<path>` elements, not just their attributes, if this code
ever looks subtly wrong.

`paintOrder="stroke fill"` is applied **only** to the fill layer (the one
with `fill !== "none"`): it makes that layer paint its fill over the inner
half of its own stroke, which is what makes the light rule read as 2 units
wide instead of 4. Applying it to every layer — an easy mistake, and Task 1's
first draft did exactly this — makes the light rule disappear everywhere
except that innermost edge.

`useId()` on this codebase's React 19 yields an underscore-delimited id like
`_r_0_` — no colon. (Older React versions used a colon-delimited id like
`:r0:`: colons resolve fine through `getElementById`/`url(#id)`, which is how
the component's own checkerboard `<pattern>` and `<clipPath>` references
work, but they would break a **CSS class selector** built from the same
string.) `PartArt` strips colons on principle (`useId().replace(/:/g, "")`)
even though nothing in the current React version's id format needs it — a
defensive guard against a future React version change, not something
load-bearing today.

### The part stack is a fixed, non-uniform layout — not a generic diagonal

`PartChooser.tsx`'s `POSITION` table places each part explicitly, in units of
`--flow-clr-part-size`: fill at `{top:0, left:0}`, stroke stepped to
`{top:0.5, left:0.5}` (a half-part diagonal offset from fill), text dropped
to `{top:1.25, left:0}` — back to fill's left edge, not a continuation of the
diagonal. Fixed positions are safe only because `availableParts` always
returns at most these three specific parts (`color-parts.ts`) — an earlier
layout attempt stepped all three along one diagonal and put stroke and text
at the same spot whenever a selection had both, burying whichever rendered
behind.

### Every part always renders; `available` dims, it does not remove

**The stack is one fixed size — `1.5 × 2.25` part-sizes — at every
selection**, because all three boxes render unconditionally and a part the
selection cannot address is merely dimmed (`.flow-clr-part--off`,
`aria-disabled`, skipped by arrow-key cycling, click guarded). The swap arrow
dims in place for the same reason rather than unmounting.

This replaced three sizes keyed to the part count (1×1 / 1.5×1.5 / 1.5×2.25,
selected by `--parts-N` classes, briefly by a `STACK_SPAN` inline style).
**Do not reintroduce selection-dependent sizing.** The panel's top row is two
sections of equal height — the chooser, and the saturation box stretched to
match it — so a chooser that grew and shrank dragged the entire picker around
every time the user clicked a different element. That resizing, plus the
saturation box's own `aspect-ratio` tying its height to the panel width, is
what the fixed layout exists to stop.

Consequences worth knowing:

- **`partColor` still returns a value for an unavailable part** — a tool
  default, or a property read off an element that doesn't really use it (a
  text element does carry `backgroundColor`). The dimming is what means "not
  applicable"; the colour underneath it is not meaningful. Don't wire it to
  anything.
- **The rail's compact chooser is now always at its tallest, 111px**
  (72 stack + 8 gap + 31 quartet), where a plain shape used to give 87px.
  The rail vertical-fit e2e test already measured 111px and passed, so this
  cost nothing — but it is why that test's `toHaveCount(3)` assertion no
  longer proves a state transition. Three is the only case now; the
  assertion survives as a cheap "chooser is mounted and whole" guard.
- **In the panel the saturation box has no `aspect-ratio`** — it is
  overridden to `auto` under `.flow-clr-panel__top` so it scales
  horizontally only. The base rule keeps 16/10 for the rail popup, where the
  box spans the full width with nothing beside it to match. At a narrow panel
  the docked one goes portrait; that is deliberate, chosen over breaking the
  equal-height rule.

### `PaletteSection`'s trash tile: `aria-disabled`, never `disabled`

The palette grid's leading trash tile intentionally carries `aria-disabled`
instead of the native `disabled` attribute. **Chrome delivers no mouse events
at all to a `disabled` form control**, and HTML5 drag-and-drop drop targets
are implemented on top of mouse events (`dragover`/`drop`) — a `disabled`
trash would silently refuse every drop in the single most common case
(nothing selected, user just drags a swatch onto it). `aria-disabled`
announces the same "can't act on this right now" state to assistive tech
while keeping the element genuinely interactive for drops. **jsdom cannot
catch a regression here** — it doesn't model Chrome's mouse-event suppression
on disabled controls, so a jsdom-based drag simulation would keep passing
even with `disabled` swapped back in. Only `e2e/color-panel.spec.ts`'s
`"dragging a swatch onto the trash deletes it"` (Task 7), which drives real
HTML5 DnD via Playwright's `dragAndDrop` in actual Chromium, is a genuine
regression guard for this.

### The rail vertical-fit e2e test needs an explicit re-select, and asserts it got one

Task 7's first draft of `"the rail's color control fits the rail without
overflowing"` (`e2e/color-panel.spec.ts`) drew a rectangle and gave it bound
text via `Enter` → type → `Escape`, on the premise that a labelled container
(3 parts: fill/stroke/text) is the tallest case the compact chooser renders.
**That sequence alone does not reach the 3-part case.** Tool-lock stays on
the Rectangle tool after drawing (flow forces it permanently on — see
[[tool-override]]), and `Escape` out of the bound-text edit clears
`selectedElementIds` to `{}` rather than restoring the container as selected.
This is the same selection loss this file already documents as pre-existing
and out of scope for `e2e/text-panel.spec.ts:201`/`:225` — the
`addLabelledBox` helper those tests use is the identical
`Enter`/type/`Escape` sequence, and they fail on the very next line for the
same reason (the container reads as unselected, so the labelled-container-only
UI stays disabled). A plain click on the canvas right after `Escape` does not
reselect the container either: the active tool is still a drawing tool, not
the selection tool, and Excalidraw only treats a plain click as a
selection-click while the selection tool is active. A first-draft version of
this test that stopped at `Escape` would pass while silently measuring the
shorter `parts-2` case (1.5 part-sizes tall) instead of the `parts-3` case
(2.25 part-sizes tall, stacked above the quartet) — passing for the wrong
reason, with nothing in the test's output to reveal it.

**The committed test routes around this explicitly**: after `Escape`, it
clicks the Selection tool, then clicks the container's stroke edge (the
interior doesn't hit-test — a fresh rectangle's fill is transparent) to force
a genuine re-select, then asserts
`page.locator(".flow-toolbar").getByRole("radio")` has count `3` **before**
reading `scrollHeight`/`scrollWidth`. That count assertion is the durable
part: if a future change breaks this re-selection trick (or the underlying
Escape-selection-loss bug ever gets fixed and changes the interaction), the
test fails loudly on the count instead of quietly reverting to measuring the
2-part case again. Confirmed at the time of writing: `rail.scrollHeight -
rail.clientHeight` is `0` for the real 3-part case at a 1440×900 viewport —
the product risk the plan flagged is resolved, and now the test that says so
actually proves it.
