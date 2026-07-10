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

## Fix stale `e2e/menu-preferences.spec.ts` "About shows both repo links" (added 2026-07-10)
Deterministic pre-existing failure (predates the grid-size/view-menu branch base).
`AboutDialog.tsx` renders the upstream link as plain "Excalidraw" since commit
`06e568e`, but the test still asserts a link named `/excalidraw fork/i`. One-line
fix: update the test's assertion to the current link text (or rename the link).
This is the only red test in the suite; fixing it makes the full e2e green.

## Consolidated fix: global appState prefs overridden on doc open (added 2026-07-10)
`applyContentsToScene` (`src/lib/excalidraw-scene.ts:50-53`) spreads a saved
scene's full `appState` back on document open, so opening a `.excalidraw` authored
with different values overrides flow's global prefs — `gridSize`,
`objectsSnapModeEnabled`, `selectionMode`, `laserColor`, `bindingMode` — until the
user re-touches them. Systemic (affects all five identically), not a regression.
Fix once for all: strip flow-owned global appState keys in `applyContentsToScene`,
or re-assert them from flow state after load. Surfaced in the grid-size and
view-menu final reviews. See [[grid-size-preference]], [[view-menu-toggles]].
