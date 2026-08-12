---
name: repo-hygiene
description: "Branch/tag policy, the narrowed upstream fetch, and why the fork's stale branches are kept"
metadata:
  type: project
---

# Repo hygiene (2026-08-11)

A tidy-up pass over both repos. No code behaviour changed; the only source edit
was the version bump.

## Branches: main is the only branch

Five fully-merged local branches were deleted (`master`, `v0.02`,
`backup-pre-scrub`, `feat/fork-excalidraw-text-color`,
`upgrade/excalidraw-master`). Every one was an ancestor of `main`, so nothing
was lost. **`git branch` should show only `main`** — if a stale branch reappears,
it is a leftover, not history.

`upgrade/excalidraw-master` needed `-D` rather than `-d`: it was 1 commit ahead
of its *remote* counterpart, so git refused the safe delete even though the
commit was in `main` via merge `82cf577`. That warning is about the GitHub copy
being behind, not about unmerged work — verify with
`git merge-base --is-ancestor <sha> main` before forcing.

## Tags replace milestone branches

Milestones are now annotated tags, not branches. Retro-tags were backdated
(`GIT_COMMITTER_DATE`) to their commit's own date so `--sort=creatordate` reads
chronologically:

| Tag | Date | Marks |
|---|---|---|
| `prefork` | 2026-07-04 | before Excalidraw was vendored (was branch `master`) |
| `v0.0.1` | 2026-07-08 | lightweight tag, pre-existing |
| `pre-search-panel` | 2026-07-09 | pre-existing |
| `v0.0.2` | 2026-08-08 | was branch `v0.02`; pre-upgrade (see [[excalidraw-upgrade]]) |
| `v0.0.3` | 2026-08-11 | color system + fork upgrade |

**Versioning is three-part semver** (`v0.0.3`, not `v0.03`) because `package.json`
cannot hold a two-part version and it is the single source of truth for the
version the app displays.

## The version had drifted for a month

`package.json` read `0.0.1` from 2026-07-08 until 2026-08-11 — the `v0.02` branch
was cut without bumping it, so **File ▸ Help ▸ About under-reported for 92
commits**. `src/lib/app-version.ts` imports `version` straight from
`package.json`, and `PropertiesDialog` does the same, so **bumping `package.json`
is the entire fix** — no component edit. Use `npm version <x.y.z>
--no-git-tag-version` so the lockfile stays in step, then tag.

Note `AboutDialog.test.tsx` asserts against `APP_VERSION` itself, so it is
self-referential and **cannot catch a stale version**. Check the literal.

## Upstream fetch narrowed to master (the big one)

`vendor/excalidraw` had fetched **310 upstream branches** (every excalidraw PR
branch). The refspec is now:

```
remote.upstream.fetch = +refs/heads/master:refs/remotes/upstream/master
```

308 stale tracking refs were deleted and gc'd: 102M → 86M, and
`git fetch upstream` went from slow to **~0.6s**. All 19 tags were deliberately
preserved (`git describe` and the v0.18.x references depend on them) — the
deletion touched `refs/remotes/upstream/*` only, never `refs/tags/*`.

**To pull a specific upstream branch again**, fetch it explicitly — the narrow
refspec does not block it:

```
git fetch upstream <branch>:refs/remotes/upstream/<branch>
```

To restore the old firehose: `git config remote.upstream.fetch
'+refs/heads/*:refs/remotes/upstream/*'`. Nothing deleted is unrecoverable —
it all re-fetches from github.com/excalidraw/excalidraw.

## Keep the fork's stale `flow` branch — do NOT delete it

[[excalidraw-upgrade]] left open whether to retire the old `flow` branch now that
`flow-next` is the live one. **Answer: keep it, on `origin` especially.** flow
commits from before the upgrade have gitlinks pointing at commits reachable only
from `flow`; deleting that branch would make those historical flow commits
unable to resolve their submodule pointer. `origin/wimp` is an ancestor of
`flow`, so it is redundant, but harmless.

## Still outstanding

- **The July scrub purge is still NOT done** — see [[pending-followups]]. Its
  precondition was verified on 2026-08-11 (origin/main's history is confirmed
  clean of `.superpowers`, `CLAUDE.md`, and non-memory `.claude` paths), so it is
  cleared to run whenever wanted.
- `PropertiesDialog.tsx` hardcodes `EXCALIDRAW_VERSION = "0.18.1"`, stale since
  the fork moved to upstream master (382 commits past v0.18.0).
- GitHub still carries the merged branches `upgrade/excalidraw-master` and
  `v0.02` (cosmetic only).
