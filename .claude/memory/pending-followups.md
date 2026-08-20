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

## Flaky e2e under parallel load (added 2026-08-05, widened 2026-08-19)
`e2e/quickbar.spec.ts` (arrow-binding persistence) flakes under parallel load.
Pre-existing, unrelated to the scrub work. CI sets `retries: 1` so it cannot
produce false reds, which masks rather than fixes it.

**This is broader than one spec.** Four full-suite runs during the
`fix/arrow-binding-modifier` / `fix/binding-lock-raw-reads` work (2026-08-19)
each failed a *different* set, while every one of them passed in isolation:

| Run | Parallel failures beyond the 2 known `text-panel` ones | In isolation |
| --- | --- | --- |
| 1 | `tool-override.spec.ts:335` snap toggle produces guides; `:365` snap toggle stays on while modifier held | 15/15 pass |
| 2 | `drawing-defaults.spec.ts:69` Transform panel rounds a shape; `tool-override.spec.ts:45` drawing tool stays active | 24/24 pass |
| 3 | `new-document.spec.ts:60` File ▸ New keeps flow's appState preferences | pass, plus 6/6 over 3× `--repeat-each=2` |
| 4 | **`--workers=1`: none** — 183 passed, only the 2 known `text-panel` failures, 3.1m | n/a |

So the flaky set is at least `quickbar`, `tool-override` (3 different tests),
`drawing-defaults` and `new-document` — i.e. *no particular spec*, which points
at shared load/timing rather than a bug in any one test. The failures present
as **locator timeouts** (e.g. 30s waiting for
`getByRole("menuitemcheckbox", { name: "Snap to Objects" })`), not assertion
mismatches, which fits the same reading.

**The operational lesson, and why this matters more than the flakes
themselves:** a parallel full-suite red is not evidence of a regression here,
and a different spec failing each run is the tell. The only run that
distinguishes a real break from load noise is `npx playwright test
--workers=1` (~3.1m vs ~45-95s). Do that before concluding a change broke
something — and before treating a green parallel run as proof it didn't.

Not investigated: whether the cause is worker count vs. the dev server, whether
`fullyParallel` / `workers` in `playwright.config.ts` should be capped, or
whether the shared vite server is the contention point. Any real fix belongs in
config, not in the individual specs.
