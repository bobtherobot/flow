# Design: Desktop Menu Bar + Preferences (global sloppiness)

**Date:** 2026-07-06
**Status:** Approved (pending spec review)
**Branch context:** builds on `feat/fork-excalidraw-text-color`

## 1. Summary

Add a traditional desktop-application **menu bar** (File / View / Help) to wimp,
replacing Excalidraw's hamburger dropdown, and introduce a **Preferences** dialog
under File. Preferences' first setting is a **global, app-wide sloppiness** control
that supersedes the current lock-to-Architect hack: one setting restyles every
element on the canvas at once and becomes the default for new elements.

Everything here is **wimp-level** — new components, the public Excalidraw API, and
CSS. **No Excalidraw fork edits are required**, consistent with the fork strategy
(public API / additive changes stay in wimp; ride upstream).

## 2. Goals

- A classic horizontal menu bar with **File**, **View**, **Help** menus and dropdowns.
- Move Open / Save / Export under **File**.
- A **Preferences** dialog (File ▸ Preferences…) with a left-nav category layout.
- Replace the hidden lock-to-Architect sloppiness hack with a real **global
  sloppiness** preference (Architect / Artist / Cartoonist), applied to all
  existing + new elements and persisted app-wide.
- Keep the fork diff untouched; all work lands in wimp.

## 3. Non-goals (deferred)

- **Edit menu** (Undo/Redo/Cut/Copy/Paste) — needs deeper Excalidraw command
  wiring; left off the bar entirely for now (not shown as a dead menu).
- **Manage / edit keyboard shortcuts** — later feature. For now the Preferences
  "Keyboard" section only *shows* the existing shortcuts list.
- **Dark theme / theme toggle** — light theme only for now.
- **Per-drawing sloppiness** — explicitly rejected; sloppiness is app-wide.

## 4. Decisions (resolved during brainstorming)

| Decision | Choice |
|---|---|
| Menu-bar location | Custom wimp top bar (not Excalidraw's hamburger, not left panel) |
| Menu completeness (pass 1) | File (full) + View + Help; Edit deferred |
| Menu-bar implementation | **Radix UI `@radix-ui/react-menubar`** (headless) + custom styling |
| Sloppiness persistence | **App-wide** preference (localStorage) |
| Help menu | Single **About wimp…** item → dialog |
| Keyboard shortcuts | Lives in **Preferences ▸ Keyboard** as a "show shortcuts" button |
| About links | Two: wimp repo (**placeholder URL** for now) + Excalidraw fork (`https://github.com/bobtherobot/excalidraw`) |

## 5. Architecture

### 5.1 Chrome / layout

- The Excalidraw mount wrapper changes from `position: fixed; inset: 0` to
  `inset: var(--wimp-menubar-h) 0 0 0` (36px top inset). The menu bar owns the
  full-width top strip; the canvas **and** Excalidraw's own floating islands
  (top-left toolbar, top-right controls) shift down beneath it — no overlap, no
  z-index contention.
- Excalidraw's hamburger menu button is hidden via CSS using its stable selector
  (same technique already used to hide the sloppiness fieldset). Its useful items
  (Clear Canvas, theme, export) migrate into the wimp bar or are dropped for pass 1.
- The `CustomMenu` component (Excalidraw `MainMenu` wrapper) is **removed**.

### 5.2 Menu bar (Radix)

New `src/ui/menubar/`:

- `MenuBar.tsx` — Radix `Menubar.Root` containing File / View / Help. Receives
  callback props for every action (`onNew`, `onOpen`, `onSave`, `onExport`,
  `onPreferences`, `onClearCanvas`, `onZoomIn`, `onZoomOut`, `onZoomToFit`,
  `onResetZoom`, `onToggleGrid`, `onAbout`). No business logic inside — pure
  presentational wiring to callbacks owned by `App`.
- `menubar.css` — the `--wimp-*` design tokens (see §7) plus styling for
  `Menubar.Trigger`, `Menubar.Content`, `Menubar.Item`, `Menubar.Sub`,
  `Menubar.Separator`. Radix handles ARIA roles, roving focus, arrow-key
  navigation, typeahead, and the Export submenu flyout; CSS supplies the look.

**Menu contents:**

- **File**: New · Open… · Save… · Export ▸ (PNG / SVG / JPG) · ─ · Preferences… · ─ · Clear Canvas
- **View**: Zoom In · Zoom Out · Zoom to Fit · Reset Zoom (100%) · ─ · Toggle Grid
  - All via public `excalidrawAPI`. Exact calls (zoom via `updateScene`
    `appState.zoom`, `scrollToContent()` for fit, `gridModeEnabled` toggle) are
    confirmed against the installed API version in the implementation plan; any
    that lack a clean public hook are dropped rather than reaching into internals.
- **Help**: About wimp…

### 5.3 Preferences dialog

New `src/ui/PreferencesDialog.tsx`, reusing the existing `wimp-dialog` styling
(`src/ui/dialogs.css`). Left-nav category layout (traditional desktop Preferences):

- **General** → Sloppiness: a 3-way choice (Architect / Artist / Cartoonist),
  default Architect. Changing it calls back to `App` immediately (live apply) or
  on close — **live apply on change** (simpler mental model, matches "global
  setting rules everything"). Persisted via `preferences.ts`.
- **Keyboard** → a "Show keyboard shortcuts" button. Best-effort: trigger
  Excalidraw's own shortcuts/help dialog if a public API exists; otherwise render
  a static read-only reference list. Placeholder note for the future edit feature.

Structured so additional categories/settings slot in without restructuring.

### 5.4 About dialog

New small `src/ui/AboutDialog.tsx` (reuses `wimp-dialog` styling): app name (from
config), one-line description that wimp is built on a **forked Excalidraw**, and
two links — the wimp app repo (**placeholder URL** constant, clearly marked) and
the Excalidraw fork (`https://github.com/bobtherobot/excalidraw`). Links use
`target="_blank" rel="noopener noreferrer"`.

### 5.5 Global sloppiness

- **Type / lib** (`src/lib/roughness.ts`, generalized): define
  `type Sloppiness = 0 | 1 | 2` (0 Architect, 1 Artist, 2 Cartoonist) with a
  name map. `normalizeRoughness(elements, target)` gains a `target` parameter
  (was hardcoded to `ARCHITECT_ROUGHNESS`); returns new objects only where a
  change is needed (unchanged identity otherwise, as today). `DEFAULT_SLOPPINESS = 0`.
- **Storage** (`src/app/preferences.ts`, new): `localStorage`-backed get/set for
  the sloppiness preference under key `wimp.sloppiness`. Synchronous read at
  startup (no async flash of the wrong roughness). Validates the stored value is
  0/1/2, falling back to `DEFAULT_SLOPPINESS` on missing/corrupt data.
- **App wiring** (`src/App.tsx`):
  - `useState` holds current sloppiness, initialized from `preferences.get()`.
  - `initialData.appState.currentItemRoughness` seeded from it.
  - `handleChange` normalizes any stray element (e.g. pasted foreign content) to
    the **current** preference value, not a constant.
  - `applyContentsToScene` (in `src/lib/excalidraw-scene.ts`) normalizes imported
    / opened documents to the current preference — so any old drawing conforms to
    the app-wide setting on open. It takes the target value as a parameter.
  - **On preference change** from the dialog:
    1. persist via `preferences.set()`,
    2. `updateScene` restyling **every existing element** to the new roughness,
    3. `updateScene` `appState.currentItemRoughness` so new elements inherit it,
    4. update the in-memory state so ongoing normalization uses the new value.
- The left-panel per-object sloppiness radio **stays hidden** (`index.css`
  `:has()` rule): sloppiness is controlled globally, never per element.

## 6. Data flow

```
localStorage(wimp.sloppiness)
        │  read at startup
        ▼
   App state (sloppiness) ──seed──▶ initialData.currentItemRoughness
        │        ▲
        │        │ set + updateScene(all elements + currentItemRoughness)
        │        │
        │   PreferencesDialog (General ▸ Sloppiness)  ◀── File ▸ Preferences…
        │
        ├─▶ handleChange: normalizeRoughness(strays, sloppiness)
        └─▶ applyContentsToScene(api, contents, sloppiness)  (open/import)
```

## 7. Visual design tokens ("quiet system chrome")

Flat white 36px bar, hairline base border, no rest shadow; 13px/600 Nunito ink
labels. Interactive states borrow Excalidraw's indigo so an open menu reads as
native to the canvas. Dropdowns: 8px radius, soft two-layer shadow, 30px items,
right-aligned shortcut hints, `Export ▸` flyout. WCAG AA contrast;
`prefers-reduced-motion` respected (fade only, no translate, no submenu delay).

```css
:root {
  /* Surfaces */
  --wimp-menubar-bg:    #ffffff;
  --wimp-panel-bg:      #ffffff;
  /* Ink */
  --wimp-ink:           #2b2b33;  /* labels, item text */
  --wimp-ink-muted:     #76767f;  /* shortcut hints, captions (AA @12px) */
  --wimp-ink-disabled:  #c2c2ca;  /* disabled items */
  /* Accent — Excalidraw primary, states only */
  --wimp-accent:        #6965db;  /* open label + highlighted item text */
  /* Interactive fills */
  --wimp-hover:         #f1f0fb;  /* label hover */
  --wimp-active:        #e8e7fb;  /* open label / item highlight */
  --wimp-active-strong: #dcdaf6;  /* pressed */
  /* Lines & shadow */
  --wimp-border:        #e9e9ed;  /* bar hairline, panel border, separators */
  --wimp-shadow:        0 4px 16px rgba(43,43,51,.12), 0 1px 3px rgba(43,43,51,.08);
  /* Geometry */
  --wimp-menubar-h:     36px;
  --wimp-label-h:       28px;
  --wimp-item-h:        30px;
  --wimp-panel-minw:    200px;
  --wimp-radius-sm:     5px;   /* labels, item chips */
  --wimp-radius-md:     8px;   /* dropdown panels */
  --wimp-pad-x:         10px;  /* label + item horizontal padding */
  --wimp-panel-pad:     4px;   /* panel inset frame */
  --wimp-gutter:        24px;  /* icon/check leading column */
  /* Type (Nunito) */
  --wimp-fs-label:      13px;  --wimp-fw-label:    600;
  --wimp-fs-item:       13px;  --wimp-fw-item:     500;
  --wimp-fs-shortcut:   12px;  --wimp-fw-shortcut: 500;
  --wimp-fs-group:      11px;  --wimp-fw-group:    700;
  /* Motion */
  --wimp-dur-fast:      90ms;
  --wimp-dur-panel:     120ms;
  --wimp-ease:          cubic-bezier(.2, 0, 0, 1);
}
```

Label states: rest transparent → hover `--wimp-hover` → open `--wimp-active` +
accent text → keyboard focus inset `2px` accent ring (`:focus-visible`).
Item states: rest → hover/highlight `--wimp-active` + accent text (mouse and
arrow-key highlight identical) → pressed `--wimp-active-strong` → disabled
`--wimp-ink-disabled`, no hover, `aria-disabled`. Separator: `1px --wimp-border`,
`margin: 4px 8px`. Namespaced `--wimp-*` so they never collide with Excalidraw's
`--color-*`; the only shared literal is the accent hex.

## 8. Testing

- **Unit** (`vitest`):
  - `roughness.ts`: `normalizeRoughness(elements, target)` for each target,
    identity passthrough when unchanged, mixed inputs.
  - `preferences.ts`: default when unset, round-trip set/get, fallback on
    corrupt/out-of-range stored value.
- **Component** (`@testing-library/react`):
  - `PreferencesDialog`: renders categories, selecting a sloppiness option fires
    `onChange` with the right value; "Show keyboard shortcuts" button present.
  - `AboutDialog`: renders description, both links with `rel="noopener noreferrer"`.
  - `MenuBar`: each item invokes its callback; disabled states where applicable.
- **E2E** (Playwright):
  - File ▸ Preferences ▸ set Artist → existing shapes visibly restyle; reopen
    Preferences shows Artist persisted (survives reload).
  - Export (PNG/SVG/JPG) still downloads.
  - Canvas + Excalidraw islands render below the 36px bar (no overlap).
  - Help ▸ About opens dialog with both links.

## 9. File plan

```
NEW  src/ui/menubar/MenuBar.tsx        Radix menubar + wimp menu tree
NEW  src/ui/menubar/menubar.css        --wimp-* tokens + menu styling
NEW  src/ui/PreferencesDialog.tsx      General (sloppiness) + Keyboard sections
NEW  src/ui/AboutDialog.tsx            fork description + two repo links
NEW  src/app/preferences.ts            localStorage-backed sloppiness pref
EDIT src/lib/roughness.ts              generalize normalizeRoughness(elements, target)
EDIT src/lib/excalidraw-scene.ts       applyContentsToScene takes target sloppiness
EDIT src/App.tsx                       mount bar, wrapper inset, wire prefs/about, live-apply
EDIT src/index.css                     hide Excalidraw hamburger; keep sloppiness-fieldset hide
DEL  src/app/CustomMenu.tsx            replaced by MenuBar
NEW  tests alongside the above (*.test.ts / *.test.tsx)
DEP  add @radix-ui/react-menubar to package.json
```

## 10. Risks & mitigations

- **View menu API coverage** — zoom/grid controls depend on the installed
  Excalidraw API surface. Mitigation: verify each against v0.18.x in the plan;
  drop any without a clean public hook rather than reaching into internals.
- **Shortcuts dialog trigger** — Excalidraw may not expose opening its help dialog
  programmatically. Mitigation: fall back to a static read-only shortcut list.
- **Hamburger-hide selector** — CSS relies on an Excalidraw class. Mitigation:
  same stable-selector approach already proven for the sloppiness fieldset; a
  broken selector degrades to showing the hamburger, not a crash.
- **Bundle size** — Radix menubar adds a few small packages. Within the app-page
  JS budget; tree-shakeable.
```
