---
name: flow-desktop-menu-bar
description: "flow's desktop menu bar (File/View/Help) + Preferences/About — Radix, flow-level, no fork edits"
metadata:
  node_type: memory
  type: project
  originSessionId: 70719aec-040b-402c-9d98-d5a7174a67ee
---

**Shipped 2026-07-07** on branch `feat/desktop-menu-bar-preferences` (6 feature/test commits + spec flip). A traditional desktop menu bar replaces Excalidraw's hamburger.

**Architecture (all flow-level, zero `vendor/excalidraw/` edits — consistent with [[flow-fork-strategy]] rule #1: public API + flow code, not a fork change):**
- `src/ui/menubar/MenuBar.tsx` + `menubar.css` — Radix `@radix-ui/react-menubar` (WAI-ARIA menubar for free). File (New/Open/Save/Export▸PNG/SVG/JPG/Preferences/Clear), View (zoom in/out/fit/reset, toggle grid), Help (About). Presentational — every action is a callback prop owned by `App.tsx`. Tokens namespaced `--flow-*`; 36px top strip, canvas inset below via `inset: var(--flow-menubar-h) 0 0 0`.
- `src/lib/view-actions.ts` — pure `zoomIn/out`, `resetZoom`, `zoomToFit`, `toggleGrid` taking the `excalidrawAPI`. Zoom clamped 0.1–30, step 1.1.
- `src/ui/PreferencesDialog.tsx` (General=sloppiness, Keyboard=opens Excalidraw's built-in `openDialog:{name:"help"}`) + `src/ui/AboutDialog.tsx` (fork blurb + two links). Both reuse existing `dialogs.css` classes.
- **2026-07-08 update — Library/footer-help removal + Help menu consolidation:** Removed Excalidraw's Library trigger + docked panel and the bottom-right footer help icon via CSS hides in `src/index.css` (`.default-sidebar-trigger`, `.default-sidebar`, `.help-icon` — same flow-level hide pattern as the hamburger, zero fork edits). The old help-dialog buttons now live under the **Help menu**: About flow… / Documentation / Submit an issue / Keyboard Shortcuts. Blog + YouTube were dropped (no flow equivalent). Documentation/Submit-an-issue open flow placeholder URLs via `window.open(...,"_blank","noopener,noreferrer")`; Keyboard Shortcuts reuses `handleShowShortcuts` (built-in dialog) with its link row CSS-hidden (`.HelpDialog__header`) so it's shortcuts-only. Outbound URLs centralized in new `src/lib/links.ts` (`FLOW_REPO_URL`/`FLOW_DOCS_URL`/`FLOW_ISSUES_URL` = `REPLACE-ME` placeholders, `EXCALIDRAW_FORK_URL`); AboutDialog now imports from there. MenuBar gained `onDocumentation`/`onSubmitIssue`/`onShowShortcuts` props.
- `src/lib/excalidraw-scene.ts` — `ImageFormat` type moved here (from deleted `CustomMenu.tsx`); `applyContentsToScene` gained a `target` sloppiness param.
- Excalidraw hamburger hidden via `.excalidraw .dropdown-menu-button { display:none }` in `index.css`.
- **Deleted** `src/app/CustomMenu.tsx` (the old in-canvas menu).

**About links:** `EXCALIDRAW_FORK_URL = github.com/bobtherobot/excalidraw`; `FLOW_REPO_URL = github.com/bobtherobot/flow` (real repo as of 2026-07-08 — see [[flow-fork-strategy]]; no longer a placeholder). Outbound URLs centralized in `src/lib/links.ts`.

**Testing:** vitest unit/component (roughness, preferences, view-actions, MenuBar smoke, both dialogs) + Playwright E2E at `e2e/menu-preferences.spec.ts` (`npm run test:e2e`) — verifies bar position, File menu contents, sloppiness-persists-across-reload, About links. Playwright was newly scaffolded here (`playwright.config.ts`, testDir `e2e/`, port 5173). Global sloppiness detail in [[flow-sloppiness-global]].
