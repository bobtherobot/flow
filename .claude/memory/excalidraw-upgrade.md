---
name: excalidraw-upgrade
description: "The 2026-08 fork upgrade to upstream master — new base branch flow-next, the replay approach, the four load-bearing fork edits, and the traps"
metadata:
  type: project
---

# Excalidraw fork upgrade (2026-08-10/11)

Moved the vendored fork from its **2025-03-11** fork point to **upstream master of
2026-08-07** — 382 upstream commits, ~17 months — and replayed flow's customizations.
Merged to `main` as `82cf577`.

## New coordinates

- Fork's long-lived branch is now **`flow-next`** (off `upstream/master`), pushed to
  `bobtherobot/excalidraw`. The old **`flow` branch is superseded and stale** — decide
  whether to retire it.
- **There is no newer Excalidraw *release* to target.** `git describe upstream/master` =
  v0.18.0; v0.18.1 (2026-04-20) is a patch release already in our history. Master carries
  382 unreleased commits. "Upgrading" means tracking unreleased master — a deliberate choice.
- Upstream restructured into a monorepo: `packages/excalidraw/element/*` →
  `packages/element/src/*`, `constants.ts` → `packages/common/src/`, `scene/Shape.ts` →
  `packages/element/src/shape.ts`, `scene/selection.ts` → `packages/element/src/selection.ts`,
  `laser-trails.ts` → `laserTrails.ts`.

## Replay, don't merge

13 of the 33 customized files no longer existed at their old paths. A plain
`git merge upstream/master` produces modify/delete conflicts on all 13, where edits get
silently stranded. **Do it again the same way on the next big jump:** branch fresh off
upstream, apply each file's *cumulative* diff (`git diff <fork-point> flow -- <old>` with
the paths rewritten) at its new location, resolve, and let the flow e2e suite drive the rest.

Of 33 files: 11 applied cleanly, 14 needed conflict resolution, **8 were dropped**.

## The fork diff SHRANK from 33 files to 22

- **7 dropped as dead code.** The whole Text-colour-control customization
  (`actionProperties`, `Actions.tsx`, `LayerUI`, `colorPickerUtils`, `actions/index`,
  `actions/types`, `en.json`) only ever drove *Excalidraw's own styles panel*, which flow
  hides. flow never calls `changeTextColor`. Only the `currentItemTextColor` appState field
  is used, and it is kept.
- **1 dropped as redundant.** Upstream now implements marquee touch/enclose natively as
  `boxSelectionMode: "contain" | "overlap"`. `App.tsx` maps flow's `selectionMode` onto it
  instead of forking `selection.ts`.

**Upstream has since built native equivalents of three more flow customizations** —
`bindingPreference` (vs `bindingMode`), `currentItemStartArrowheadSize` (vs flow's arrowhead
sizes), and the `boxSelectionMode` above. Retiring ours would shrink the fork further; not
yet done.

## Four new fork edits, each load-bearing

1. **`scripts/buildPackage.js` bundles the sibling workspace packages.** Upstream lists
   `@excalidraw/common|element|math|fractional-indexing` in esbuild's `external`, expecting
   them resolvable as separate npm packages. flow consumes the fork as ONE `file:` dependency,
   so those imports survive into `dist` unresolvable and **the app does not boot at all**
   ("Failed to resolve entry for package @excalidraw/common"). Aliasing each to its source and
   emptying `external` restores the self-contained bundle. `@excalidraw/utils` was already
   aliased this way upstream — this just extends their own pattern.
2. **`data/restore.ts` exempts flow's optional props from `Required<>`.**
   `Required<Omit<ExcalidrawElement,"customData">>` strips the `?` from `cornerRadius`,
   `padding`, `startArrowheadSize`, `endArrowheadSize`, demanding a concrete number — but
   "not set" is meaningful for all four. This had been failing `yarn gen:types` **silently**,
   leaving flow type-checking against stale `.d.ts` files, which is how the prop rename below
   went unnoticed. Now green for the first time in this fork's history.
3. **Numeric `currentItemStrokeWidth` reinstated as an override.** Upstream replaced it with a
   three-value keyed system (`currentItemStrokeWidthKey` → medium/bold/extraBold = 1/2/4px).
   flow's control is a continuous 0–10px slider where **0 is meaningful**, which three keys
   cannot express. `getCurrentItemStrokeWidth` prefers the number when set, else falls back to
   the key. Check is `!= null`, NOT truthiness — see [[drawing-defaults]].
4. **`redrawBoundText` on the imperative API.** Rewraps a container's bound text after a change
   that alters its text box without changing the container's dimensions (flow's `padding`).
   `redrawTextBoundingBox` needs a `Scene`, which the public API does not hand out.

## flow-side adaptations to renamed/changed upstream APIs

- **`excalidrawAPI` → `onExcalidrawAPI`** (old prop removed). React silently ignores an unknown
  prop, so flow's api handle stayed **null forever** and every canvas control became a no-op
  **with no error anywhere**. This one rename accounted for most of the upgrade's failures:
  52 passed/68 failed → 92/28. If a future upgrade makes "everything is inert but nothing
  throws", suspect a renamed prop first.
- **`scrollToContent` → `setViewport({target, fit})`.** `fit: "scale-down"` is what upstream's
  own Zoom-to-Fit uses and matches the old `fitToContent: true`.
- **`appState.searchMatches`** reshaped from a flat array to `{ focusedId, matches }`, and match
  lines gained `showOnCanvas`.
- **`tsconfig.json` pins react/react-dom types.** The fork carries its own `@types/react`
  (19.0.10) beside flow's (19.2.17); two copies mean two `ReactNode` identities, so any vendor
  `.d.ts` exposing one (`AppState.errorMessage`) fails to typecheck. Scoped to flow — the fork's
  own `gen:types` still resolves its nested copy.

## The tool-lock / auto-select family — expect more of these

flow forces `activeTool.locked` permanently on ([[tool-override]]). Upstream keeps conflating
**"keep the tool active"** with **"select what you just drew"** behind that one flag, so every
upgrade risks silently disabling auto-select. **Four sites found so far** across two sessions:
shape pointerup, linear pointerup, `actionFinalize`, and the text-editor keyboard-submit.
Fixing the shape-pointerup site alone took the suite 91/29 → **113/7**.

**The text-editor site is NOT decoupled, deliberately — do not try a fifth time without a
decision.** It does restore the container selection after escaping a label editor (verified),
but regresses two bound-text recentre tests: those reselect the container by clicking its
centre, and a click on the centre of an **already-selected transparent-fill rectangle
deselects it**, whereas with nothing selected the same click lands on the text element. That
is vendor hit-testing, not flow logic — and `TextPanel`'s targeting is already correct
(`resolveTextTargetIds` walks `boundElements`; probed with a container selected, the fields
are enabled). The open question is a product one: **what should be selected after finishing a
bound-text label?**

## Gotchas

- **Kill stray vite servers before trusting any e2e result.** `playwright.config.ts` sets
  `reuseExistingServer: !CI`, so a long-lived dev server silently overrides what the suite
  tests. A stale one produced a completely false **118 failed / 2 passed** right after the
  merge; `pkill -f "node .*\.bin/vite"` and a re-run gave 117/3.
- **Vendor rebuild:** `cd vendor/excalidraw/packages/excalidraw && node ../../scripts/buildPackage.js`
  (cwd matters — from the submodule root esbuild fails with "entry point index.tsx cannot be
  marked as external"). Types: **`rm -rf dist/types` first**, then `yarn gen:types` — the script
  runs `rimraf types` while `outDir` is `dist/types`, so a stale run makes tsc treat its own
  output as input (TS5055). Avoid `yarn build:esm`, whose failing tail makes a good build look broken.
- **Submodule push hazard:** `flow-next` was created off `upstream/master`, so it initially
  *tracked* `upstream` — the public `excalidraw/excalidraw`. A bare `git push` would have tried
  to send 389 commits there. Tracking is now `origin/flow-next`; check
  `git rev-parse --abbrev-ref @{u}` before pushing any new submodule branch.
- Upstream added tools flow's UI knows nothing about: `lasso`, `bucketfill`, `autoshape`, plus
  `StrokeVariability` and an eyedropper.

## State at merge

647/647 unit, **117-118/120 e2e**, tsc clean, production build green. The two failures are
`text-panel.spec.ts` padding tests, both blocked on the selection question above. The padding
*write* path is fixed (via `api.mutateElement` + `redrawBoundText`); what remains there is a
value/ordering mismatch in two successive fills.

See [[flow-fork-strategy]], [[drawing-defaults]], [[tool-override]], [[style-memory]].
