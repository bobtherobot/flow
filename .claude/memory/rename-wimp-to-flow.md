---
name: rename-wimp-to-flow
description: Project renamed wimp → flow on 2026-07-07 (branding, storage keys, fork branch, directory)
metadata:
  node_type: memory
  type: project
---

On 2026-07-07 the project was renamed from **wimp** to **flow** (app-wide, no migration).

**What changed:**
- All in-repo `wimp`/`Wimp`/`WIMP` → `flow`/`Flow`/`FLOW`: display name (`index.html` title, `public/config.json` `appName`, `App.tsx`), `package.json` name, CSS classes `.flow-*` + custom props `--flow-*`, `FLOW_REPO_URL` (`github.com/REPLACE-ME/flow`, still a placeholder).
- **Storage keys renamed with NO migration** (accepted data loss): IndexedDB `DEFAULT_DB_NAME = "flow"` and localStorage `SLOPPINESS_KEY = "flow.sloppiness"`. Any drawings/prefs saved under the old `wimp` keys in a browser are orphaned.
- **Excalidraw fork branch** renamed `wimp → flow` and pushed to `origin/flow` (`bobtherobot/excalidraw`); `.gitmodules` tracks `flow`. The old `origin/wimp` branch was left on the fork as a backup — delete once all checkouts have re-synced.
- Project directory moved `/home/bob/projects/wimp` → `/home/bob/projects/flow`; workspace file → `__project - flow.code-workspace`. The parent git repo has no remote, so this was a local move only.
- Verified after rename: typecheck clean, 52/52 unit tests pass.

**Memory location:** as part of this rename, project memory was moved out of the global account (`~/.claude/projects/-home-bob-projects-wimp/memory/`) into repo-local **`.claude/memory/`** so it travels with the repo. Repo `CLAUDE.md` instructs sessions to read `.claude/memory/MEMORY.md` at start, since the global auto-loader does not reach repo-local files.
