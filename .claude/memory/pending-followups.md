---
name: pending-followups
description: "Deferred cleanup/tasks to pick up in a later session"
metadata:
  type: project
---

Running list of deferred work. Remove items once done.

## Purge local git recovery refs from the .claude history scrub (added 2026-07-08)
On 2026-07-08 we scrubbed `.claude/`, `CLAUDE.md`, `.superpowers/` from the entire
`main` history and force-pushed to `github.com/bobtherobot/flow` (see
[[flow-fork-strategy]]). Local safety nets were intentionally left in place. Once
the public repo is confirmed good, purge them so the old objects (which still
contain the removed files) are dropped locally:

- ~~`git branch -D backup-pre-scrub`~~ — **DONE 2026-08-11** (see [[repo-hygiene]];
  it was stale anyway — filter-branch's `--all` rewrote it too, so it was never a
  real backup; the real originals live in `refs/original/`).
- `rm -rf .git/refs/original/` (or `git for-each-ref --format='%(refname)' refs/original/ | xargs -n1 git update-ref -d`).
- `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
- Delete the disk backup in the session scratchpad (`…/scratchpad/claude-backup/`)
  if it still exists (scratchpad is session-scoped and may already be gone).

Precondition: only after verifying the GitHub repo's history is clean and correct.
**Precondition VERIFIED 2026-08-11** — `origin/main`'s history has zero commits
touching `.superpowers`, `CLAUDE.md`, or any non-`memory/` `.claude` path, and
only `.claude/memory/` is published. So the remaining steps above are cleared to
run whenever wanted; the five `refs/original/*` refs are now the last place the
scrubbed private files still exist inside git history. Note this step is
irreversible — it drops the ability to rewind the July rewrite, which is the point.
Other rewritten local branches were deleted 2026-08-11.

_(Both stale e2e tests were fixed 2026-08-04: `menu-preferences.spec.ts` now
asserts the About dialog's actual link text ("Excalidraw", `exact`), and
`bottombar.spec.ts` pins its presets — see [[color-swatches]]. The full e2e suite
is green as of that date: 87 e2e + 448 unit.)_

_(The vendor fork push blocker recorded here on 2026-08-05 is **resolved**:
`origin/flow` on `github.com/bobtherobot/excalidraw` is at `813d2983`, so the
gitlink resolves for a fresh clone and `actions/checkout --recurse-submodules`
works. CI ran for the first time on the 2026-08-05 spin-button commit. The
standing rule stands, though: a fork edit is only real once the submodule branch
is pushed **and** the parent gitlink is bumped — `dist/` is gitignored, so
nothing else reveals a missing push until CI or a fresh clone fails.)_

## Keyboard shortcuts unreachable from flow's chrome (added 2026-08-05)
`PanelsRoot`, `ToolBar`, `QuickBar`, `BottomBar` and `MenuBar` are all DOM
siblings of `<Excalidraw>`, which binds keydown on its own container unless
`handleKeyboardGlobally` is set (flow never sets it). Only undo/redo are
forwarded, from the panels only (`src/lib/history-shortcuts.ts`). Delete, tool
keys and everything else still do nothing while flow chrome has focus.

`handleKeyboardGlobally={true}` was considered and rejected — it would fire canvas
shortcuts while flow's dialogs and menus are open ("d" switching the tool behind
an open Preferences dialog). Note the obvious "hoist the handler to the app root"
fix is also wrong: the root contains the Excalidraw container, so undo would
double-fire. Any broader fix needs a `closest(".excalidraw")` exclusion and
deserves its own spec.

## e2e — all flakes and the two real failures FIXED (2026-08-19/20); suite is fully green

**The "parallel load" framing recorded earlier today was wrong. Load was never
the cause.** Keeping the correction visible because the wrong framing survived
two weeks and shaped how every red run was read.

### What it actually was (fixed)

Clicking a Radix menubar trigger while the previously-opened menu is still
mounted is **swallowed** — the menu toggles open and shut inside one gesture,
leaving nothing open. The test then waits for a menu item that will never
appear and dies on the 30s test timeout.

Evidence that killed the load theory:

- A reproduction opening the View menu 4× in a row failed **8/12 at
  `--workers=8` and 5/12 at `--workers=1`.** Serial reproduction is what ruled
  load out.
- Passing tests in the same runs sat at **p50 1.4s / p90 2.1s / p99 2.7s**
  against a 30s timeout. No starvation tail; lowering `workers` would have
  fixed nothing.
- Failures were **bimodal** — nothing between 2.9s and a hard 30s wall. That is
  a block, not slowness.
- An instrumented vite dev server logged **zero** reloads/errors/restarts
  across a full run, ruling out dev-server churn.
- Clicking the menubar immediately after `goto` with no readiness gate passed
  **12/12**, ruling out a hydration race.
- Two consecutive pre-fix runs failed **the same two specs** (`shapebar` "Show
  Shapebar", `tool-override` "snap toggle … real menu"), both menu-driven.
  "Different spec each run" was an artifact of small samples across the whole
  suite, not randomness.

`grid-color.spec.ts` had already carried a hand-rolled one-shot retry for this
exact behaviour, with a comment describing it precisely — found, worked around
locally, never generalised. **Look for existing local workarounds before
theorising; one was sitting in the suite the whole time.**

Fix: `e2e/helpers/menu.ts` `openMenu()` — waits for any previous menu to
detach, then asserts the menu opened and re-clicks if it did not (both halves
needed; the swallow is a race, so losing it once does not mean losing it
twice). 32 call sites across 16 specs migrated; `grid-color`'s local workaround
now delegates to it. **Menu-family timeouts: 2 per run before, 0 across 4 runs
after.**

### The state-read family (also FIXED, same day)

**Root cause: flow mounts in two phases and every readiness gate only covered
the first.** Measured right after `page.goto("/")` resolves:

| milestone | t |
| --- | --- |
| flow's `toolbar[name="Tools"]` | ~0ms |
| `window.h` exists | ~0ms |
| `h.state` / `h.app.scene` | ~160ms |
| `canvas.interactive` | ~160ms |

flow's own chrome (rails, menubar, panels) is up immediately; Excalidraw mounts
~160ms later. Two traps followed, and the suite hit both:

- **`window.h` is truthy long before it is useful.** It exists as an empty
  shell at t=0, so `h?.state?.x` returns `undefined` instead of throwing and an
  assertion silently reads a wrong answer — `tool-override`'s "tool lock is on
  from the first paint" failing `expected true, received undefined`.
- **Waiting on flow's toolbar proves nothing about Excalidraw**, being
  satisfied at t=0. A spec that gates on it and then drags on the canvas races
  a ~160ms window where no element is created, so
  `scene.getNonDeletedElements().at(-1)` is `undefined` — exactly how
  `shapes.spec.ts` failed. `shapes.spec.ts` had no gate at all.

Fix: `e2e/helpers/app.ts` — `gotoApp` / `reloadApp` / `waitForApp`, gating on
`h.app.scene` (last of the three to arrive, and the object specs actually
read) plus a visible interactive canvas. **155 `goto` + 17 `reload` sites
migrated across 26 specs.**

Plus one genuinely separate bug: `shapes.spec.ts`'s Save/Open round-trip read
the scene immediately after clicking the stored document, but opening is async
(IndexedDB read, then scene swap). Now polls, matching the idiom
`drawing-defaults.spec.ts` already used after its own File ▸ Open.

**A prediction that was wrong, recorded because it cost time.** The previous
entry called 20 `waitForTimeout` sleeps "the strong lead", on the strength of
`text-panel` (7) and `stroke-panel` (5) being the worst offenders *and* the
worst residual specs. That correlation was real and the inference was wrong:
**not one sleep was removed, and the flakes went to zero anyway.** The sleeps
are mostly canvas-repaint waits before pixel screenshots, where there is no DOM
condition to poll. Correlation between "spec has sleeps" and "spec flakes" came
from both tracking the same third thing — those specs do the most canvas work.

**Result: three consecutive full runs at 183 passed / 2 failed, the same two
failures every time.** The suite is deterministic; every remaining red is real.

### Formerly "genuinely broken" — FIXED 2026-08-20

The two `text-panel.spec.ts` padding failures, filed as pre-existing since
2026-08-11, were **two unrelated app bugs**, not test bugs:

1. **Padding writes recorded no history entry.** `setContainerPadding` used
   `api.mutateElement`, which mutates the live scene element in place, so
   `updateScene` had no delta to capture. Undo popped unrelated earlier
   entries. Fixed by writing immutably with `newElementWith` — see
   [[flow-optional-prop-undo]], which now documents *both* mechanisms that
   have cost this one write its history entry.
2. **The Padding control was disabled because the container was deselected.**
   Vendor `App.tsx`'s text-submit handler gated re-selection on
   `!isToolLocked()`, and flow forces the lock on — a **third** site in the
   tool-lock/auto-select family. See [[tool-override]].

Fixing (2) then broke two other text-panel tests whose setup existed purely to
work around (2). Removed.

Also fixed the last real flake: `shapes.spec.ts`'s Save/Open round-trip. The
earlier `expect.poll` covered only the **read** side; the test still reloaded
immediately after clicking Save, so the IndexedDB write sometimes never
committed and the document never appeared in the Open list — which the poll
converted from a fast failure into a 30s timeout. Both sides now poll the store
directly; the dialog closing is not proof the write landed.

**The suite is now fully green: three consecutive runs at 185 passed / 0
failed.**

### Standing rule

The suite is green and deterministic, so **treat any red at all as a genuine
regression** — there is no longer a known-failing baseline to excuse one
against. Do not reach for `--workers=1` as a discriminator: none of the causes
were load-related, and the menubar race reproduced serially too. `retries: 1`
in CI now masks nothing worth masking, but it would hide a newly-introduced
flake, so prefer reading the first-attempt result.

## Ctrl+Z is dead right after committing any panel number field (found 2026-08-25)

**Scope of the bug:** every numeric field in the controls dock — Font size, Line
height, Padding, the Transform panel's W/H/X/Y, arrowhead sizes. Reproduced
deliberately on Padding, so it long predates the line-height work that surfaced it.

**The mechanism, in three parts:**

1. `useNumberField` commits a typed value on Enter *and then calls
   `e.currentTarget.blur()`* (`src/lib/history-shortcuts.ts` is unrelated; the
   blur is in `useNumberField.ts`'s `onKeyDown`). Nothing re-focuses anything,
   so `document.activeElement` becomes **`<body>`**.
2. flow forwards history shortcuts from `PanelsRoot.tsx`'s **React `onKeyDown`,
   which is bound to the dock wrapper `<div>`** — it only ever sees keydowns
   whose target is inside the dock. That handler exists because flow's panels
   are a DOM *sibling* of `<Excalidraw>`, which binds its own keydown on its own
   container.
3. `<body>` is a sibling of both. A keydown targeted there is inside neither
   subtree, so **no handler runs at all** — not flow's, not Excalidraw's.

**Symptom:** type a value, press Enter, press Ctrl+Z → nothing happens. Click
anywhere first (canvas or any panel control) and undo works normally. The
history entry itself is fine — measured: `undoStack` grew 1 → 2 → 3 correctly
across three commits, so this is purely key *routing*, not history capture.

**Why it was left alone:** the fix is to widen where that listener lives (window
or document level, or re-focus something after a field commits), and global
key-routing changes are the exact class of change this repo has been bitten by
repeatedly — see [[tool-override]] (the `Q` swallow, the 23-site modifier sweep,
the arrow-binding inversion found at 6 sites not 3). It wants its own pass with
its own e2e coverage, not a drive-by. See [[text-vertical-align]] for where it
was found; `e2e/text-panel.spec.ts`'s line-height undo test calls `.focus()` on a
panel control first, with a comment pointing here.

