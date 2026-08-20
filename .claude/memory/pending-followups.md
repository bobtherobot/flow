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

## Flaky e2e — both families FIXED (2026-08-19); suite is deterministic

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

### Still genuinely broken (not flakes)

`text-panel.spec.ts` ×2 — "padding rewraps a container's bound text" (the
Padding input stays `disabled`) and "padding applies to every labelled
container in a multi-selection" (undo yields `45,45`, expected `30,30`). They
fail in **every** run, parallel and serial, and predate this work. Nothing
about synchronisation will fix them; they need real investigation into the
padding control and its undo entry.

### Standing rule

`retries: 1` in CI now masks nothing worth masking, because the suite no longer
flakes — but it would also hide the two real `text-panel` failures if they ever
started passing intermittently. Since the suite is deterministic, **treat any
red other than those two as a genuine regression**, and do not reach for
`--workers=1` as a discriminator: neither family was load-related, and the
menubar race reproduced serially too.
