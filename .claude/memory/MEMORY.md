# flow — project memory

Repo-local memory index. One line per memory; see `CLAUDE.md` for the read-at-start convention.

- [Fork strategy](flow-fork-strategy.md) — how flow customizes Excalidraw: submodule fork, ride upstream, keep diff lean/additive, API-where-clean
- [Sloppiness → global setting](flow-sloppiness-global.md) — DONE (2026-07-07): app-wide sloppiness pref in File▸Preferences, flow-level not fork
- [Desktop menu bar](flow-desktop-menu-bar.md) — File/View/Help bar + Preferences/About, Radix, flow-level, no fork edits (shipped 2026-07-07)
- [Rename wimp → flow](rename-wimp-to-flow.md) — 2026-07-07 project rename: branding, storage keys (no migration), fork branch, directory, memory moved repo-local
- [Left-panel accordion](left-panel-accordion.md) — IN PROGRESS: Illustrator-style dockable panels replacing the island; Phase 0–1 done (selection-style core + docking engine), P2+ pending
- [Pending follow-ups](pending-followups.md) — deferred tasks; currently: purge local git recovery refs from the 2026-07-08 .claude history scrub
- [Vertical toolbar](vertical-toolbar.md) — flow-native left tool rail (float/close/configurable), replaces Excalidraw's island; shipped 2026-07-08
- [Quick actions bar](quick-actions-bar.md) — flow-native horizontal top bar (arrange/group/align/toggles/undo-redo/tools), right of the menu; adds the arrow-binding lock (2nd fork edit); shipped 2026-07-08
- [Bottom bar](bottom-bar.md) — flow-native horizontal bottom-left bar (grid/zen/zoom/canvas-bg/search); zero fork; shipped 2026-07-08
- [Search sub-panel](search-panel.md) — flow-native canvas search in the controls dock (fork export #2 `getSearchMatches`); native sidebar retired; bottom bar + Ctrl/F auto-open it; shipped 2026-07-09
- [Arrowhead size](arrowhead-size.md) — per-end arrow head size slider (Stroke panel), size = strokeWidth × factor; fork SCHEMA edit (start/endArrowheadSize on linear elements); shipped 2026-07-09
- [Transform panel](transform-panel.md) — top-of-dock sub-panel for numeric W/H/X/Y/rotation/corner-radius/padding; all 3 phases shipped 2026-07-09; reuses Excalidraw resize (additive export) + per-element cornerRadius (rect/diamond/elbow) + per-container text padding
