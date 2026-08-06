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

- `git branch -D backup-pre-scrub` — stale (it was rewritten by filter-branch's
  `--all`, so it is NOT a real backup; the real originals live in `refs/original/`).
- `rm -rf .git/refs/original/` (or `git for-each-ref --format='%(refname)' refs/original/ | xargs -n1 git update-ref -d`).
- `git reflog expire --expire=now --all && git gc --prune=now --aggressive`.
- Delete the disk backup in the session scratchpad (`…/scratchpad/claude-backup/`)
  if it still exists (scratchpad is session-scoped and may already be gone).

Precondition: only after verifying the GitHub repo's history is clean and correct.
Other rewritten local branches (`master`, `feat/*`) are local-only and harmless.

_(Both stale e2e tests were fixed 2026-08-04: `menu-preferences.spec.ts` now
asserts the About dialog's actual link text ("Excalidraw", `exact`), and
`bottombar.spec.ts` pins its presets — see [[color-swatches]]. The full e2e suite
is green as of that date: 87 e2e + 448 unit.)_

## Push the vendor fork's `flow` branch (added 2026-08-05) — BLOCKING for CI
The scrub-numeric-inputs work added flow's 4th behavioural fork edit
(`commitDeferredChanges` on `updateScene` — see [[scrub-numeric-inputs]]). Two
commits sit on the submodule's local `flow` branch and the parent gitlink points
at the newer one, but **neither is pushed**:

- local `vendor/excalidraw` `flow` = `813d2983`
- `origin/flow` on `github.com/bobtherobot/excalidraw` = `0444f0f9`

Until `git -C vendor/excalidraw push origin flow` runs, a fresh clone cannot
fetch the pinned commit and `actions/checkout --recurse-submodules` fails — so
the CI added in the same branch cannot run at all.

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

## Flaky e2e: quickbar arrow-binding persistence (added 2026-08-05)
`e2e/quickbar.spec.ts` (arrow-binding persistence) flakes under parallel load.
Pre-existing, unrelated to the scrub work. CI sets `retries: 1` so it cannot
produce false reds, which masks rather than fixes it.
