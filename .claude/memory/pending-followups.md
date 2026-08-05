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
