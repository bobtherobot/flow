# Left-panel accordion (Illustrator-style dockable panels)

Replacing Excalidraw's context-aware properties island with an always-visible,
dockable accordion of sub-panels (Style/Stroke/Text; Layers later). Plan:
`.claude/plans/left-panel-accordion.plan.md`. Ported docking model from the
`draw` project (`~/Desktop/projects/draw/src/controls/panel-manager.js`, vanilla
JS → reimplemented in React/TS).

## Locked decisions
- Flow-native controls; **one** fork export planned = font registry (Phase 5).
- Full draw-parity docking (float/tear-off/reorder/resize/named-layouts).
- Layers deferred; z-order + actions move to a reintroduced Edit menu (Phase 6).

## Status (2026-07-08)
- **Phase 0 DONE**: island hidden via CSS (`src/index.css` → `.selected-shape-actions`);
  `src/lib/selection-style.ts` pure read/write core (MIXED marker, common-value,
  immutable `applyToSelection`) + tests. `CaptureUpdateAction` already exported by
  the fork — no fork edit needed. The React `useSelectionStyle` hook that wires
  `applyToSelection`→`updateScene({captureUpdate})` is deferred to Phase 3 (first
  consumer); verify undo/redo there.
- **Phase 1 DONE**: docking engine under `src/ui/panels/`. Pure reducer
  `dock/panel-dock-state.ts` (26 tests). React: `PanelDock` (reducer + persistence),
  `PanelShell` (all pointer logic: topbar dock/float, tear-off/reorder w/ drop
  indicator, docked+float resize, config menu), `SubPanel`, `PanelConfigMenu`,
  `LayoutManagerDialog`, `useDrag`. Stub content in `PanelsRoot.tsx`. e2e:
  `e2e/panels.spec.ts`. Mounted in `App.tsx` beside `<Excalidraw>`.

## Recent tweaks
- **Sub-panel reorder fix + drag ghost** (2026-07-09): two bugs in docked
  reorder. (1) **Drop never persisted** — `useDrag` snapshotted `onEnd` at
  pointer-down, so `onSubDragEnd` read a stale `dropIndex===null` and skipped the
  `reorderSub` dispatch. Fixed by having `useDrag` invoke callbacks through
  `optsRef.current` (latest closure) in both `handleMove`/`handleUp`, not a
  pointer-down snapshot. `onEnd` is used ONLY by the sub-panel header drag, so
  zero blast radius. (2) **No drag feedback** — added a pointer-following ghost:
  the dragged docked panel stays MOUNTED in `docked.map` (critical — its `useDrag`
  window listeners live inside the SubPanel, so unmounting it mid-drag by
  excluding it from the list tore the drag down after one move) and instead gets
  `.flow-pnl-sub--dragging` (`position:fixed` + `opacity:.5` + `pointer-events:none`).
  Fixed positioning lifts it out of flow so the accordion closes the gap; the drop
  indicator indices track `flowDocked` (dragged excluded) to match `computeDropIndex`.
  Ghost is cleared on tear-off (real float takes over) and drop. `PanelShell` `ghost`
  state {id,left,top,width}; `SubPanel` gained `isDragging`/`dragStyle` props. Tests:
  `useDrag.test.tsx` (latest-closure regression) + panels e2e reorder-persists-after-reload.
- **Drag grips** (2026-07-09): a leading `⠿` grip on the controls-panel topbar
  (`.flow-pnl__grip`, shown only when `showBody` — hidden on the collapsed docked
  strip) and on every sub-panel header (`.flow-pnl-sub__grip`). Both are 16px,
  `pointer-events:none` so clicks/drags fall through to the existing header drag
  surface (shared style block in panels.css). Mirrors the tool/quick/bottom bar
  grips.

## Key gotchas / architecture
- flow consumes the **built** vendor dist (`vendor/excalidraw/.../dist/prod/index.js`).
  Adding a fork export requires editing source **and** `npm run build:excalidraw`.
- flow docks **right** (below the 36px menu bar), same as draw. (Originally docked
  left; moved to the right 2026-07-08.) Docked geometry lives in `PanelShell.tsx`
  `shellStyle` (`right:0`), the docked resize handle is on the panel's **inner/left**
  edge (`.flow-pnl__resize--left`, width delta negated: `dockedWidth - m.dx`), tear-off
  fires when the cursor crosses `shellR.left - TEAR_OFF_MARGIN`, `.flow-pnl--docked`
  has `border-left`, and `App.tsx` insets the canvas on the **right** by
  `--flow-panel-reserved`. Right-dock also naturally clears Excalidraw's bottom-left
  zoom/undo controls (the old left-dock UX regression from Phase 7 is moot). Floating
  panels are side-agnostic. To mirror back to the left, invert those five spots.
- **Config-menu clamping (2026-07-08):** the hamburger dropdown is anchored under
  the button but now clamps itself fully on-screen (`src/ui/panels/dock/menu-position.ts`
  pure `clampMenuPosition` + tests; `PanelConfigMenu` measures itself in
  `useLayoutEffect` and shifts before paint). Needed because right-docking put the
  hamburger near the right edge and the old `left: r.left` ran the menu off-screen.
  `PanelShell` passes `anchor={configAnchor()}` (was `style={configStyle()}`).
- **Floating sub-panel font (2026-07-08):** torn-off sub-panels render OUTSIDE the
  `.flow-pnl` shell, so they didn't inherit `--flow-font` (fell back to Excalidraw's).
  Fixed by making `.flow-pnl-sub` self-sufficient (`font-family: var(--flow-font)` +
  `color: var(--flow-ink)` on the base class) — any future element rendered outside
  the shell now stays on-brand automatically.
- Persistence: effect on committed state writes `flow.panelLayout`. Do NOT persist
  imperatively right after dispatch — stateRef is stale until re-render (caused a
  real bug). Named layouts under `flow.panelLayouts`.
- Playwright gives each test a fresh context (empty localStorage); don't clear via
  addInitScript — it re-clears on reload and breaks persistence tests.
- Scene writes go through the public imperative API only (`updateScene`), mirroring
  `App.tsx` `handleChangeSloppiness`. Read selection from `appState.selectedElementIds`;
  set matching `currentItem*` so new elements inherit choices.

- **Phase 2 DONE**: control primitives under `src/ui/panels/controls/` +
  `src/lib/units.ts` (px canonical, 96 DPI) + units pref (`flow.units`,
  `get/setUnits`) + PreferencesDialog selector (wired in App). Primitives:
  `IconToggleGroup` (segmented, radio semantics, MIXED = none selected),
  `SliderInput` (range+numeric+unit, null=mixed), `ColorSwatch` (flow-native
  popover: preset grid + OS picker + hex + optional None). All RTL-tested (126
  tests total). CSS appended to `panels.css` (`.flow-ctl-*`).
  - Consolidated: OpacityInput folded into `SliderInput` (unit="%") — DRY.
  - Deferred: `FontDropdown` → Phase 5 (single consumer + needs the font-registry
    fork export).

- **Phase 3 DONE (Color panel)** — _renamed 2026-07-09 from "Style"; component
  `ColorPanel` in `ColorPanel.tsx`, panel id `color` (label "Color"), css
  `.flow-color-panel`, e2e `color-panel.spec.ts`. Persisted-layout ids migrated
  `style`→`color` via `LEGACY_PANEL_ID_RENAMES` in `panel-dock-state.ts`. The
  shared `useSelectionStyle`/`selection-style` infra kept its name (it serves all
  panels, not just this one)._ Originally `StylePanel.tsx` (Fill/Stroke/Text color rows =
  ColorSwatch hue + SliderInput opacity), `useSelectionStyle.ts` hook (first API
  consumer), `lib/color-alpha.ts` (split/combine hue↔alpha). Wired via api state in
  App → PanelsRoot → hook. 141 unit tests + `e2e/style-panel.spec.ts` (3, incl. a
  canvas pixel-sample proving the opacity blend). **OPACITY MODEL RESOLVED**:
  per-swatch opacity carried as 8-digit hex `#rrggbbaa` in the color string
  (Excalidraw's element `opacity` is single/global; restore.ts doesn't normalize
  colors, canvas honors alpha). Verified rendering with a screenshot (semi-transparent
  fill).
  - **CRITICAL fix**: scene writes MUST use `newElementWith` (exported) to bump
    `version`/`versionNonce`, else Excalidraw never records the edit in history
    (raw spreads read back fine but undo can't revert them). `applyToSelection` now
    takes an optional `make` factory; the hook passes `newElementWith`. Also pass
    `captureUpdate: CaptureUpdateAction.IMMEDIATELY`.
  - Text color = text elements' `strokeColor`; targets resolved by
    `resolveTextTargetIds` (selected text + bound container text); greyed when none.
  - e2e gotcha: select a tool via `getByTestId("toolbar-rectangle").click({force:true})`
    (radio is visually hidden); `keyboard.press("r")` doesn't work (no canvas focus).

## Findings for Phase 7 (polish)
- **Panel covers Excalidraw's bottom-left controls** (zoom %, undo, redo) since it's
  docked full-height left. Real UX regression — need to inset the panel bottom, relocate
  those controls, or surface zoom/undo in flow's own chrome (View menu already has zoom).
- Undo integration verified by construction (newElementWith + captureUpdate) + undo
  button becomes enabled after edits; couldn't click it in e2e (covered by panel) nor
  keyboard-undo reliably (focus). Add a proper undo e2e once controls aren't covered.

- **Phase 4 DONE (Stroke panel)**: `StrokePanel.tsx` — width (units-aware:
  displayValue/toPx, px-canonical), dash style (solid/dashed/dotted), arrow type,
  start/end arrowheads. Arrow controls greyed when selection has no linear element
  (`hasLinear` added to hook). `e2e/stroke-panel.spec.ts` (3, incl. screenshots of
  thick+dashed rect and a filled-triangle arrowhead). All render verified.
  - Refactored the pure write primitive `applyToSelection` → `updateSelected`
    (updater returns a partial → supports multi-prop edits). Hook now exposes
    `update(ids, updater, currentItems)` + `setProp` (thin wrapper).
  - **Arrow type ships sharp/round only. Elbow DEFERRED**: elbow needs Excalidraw's
    `App` instance + LinearElementEditor + binding/routing (see changeArrowType.perform)
    — not reimplementable flow-natively without a 2nd fork export (action dispatch).
    Revisit in Phase 6 if we add an action-dispatch export.
  - Arrowheads: null↔"none" mapping; start/end are separate IconToggleGroups.

- **Phase 5 DONE (Text panel)**: `TextPanel.tsx` (font family / size S-M-L-XL /
  align) + `controls/FontDropdown.tsx` (listbox, options previewed in their own
  font). Targets `textTargetIds`; greyed when no text. `e2e/text-panel.spec.ts` (2,
  incl. screenshot of "Flow" in Comic Shanns XL rendering correctly).
  - **NO fork export needed** (planned one was unnecessary): font list built from the
    public `FONT_FAMILY` (excluding deprecated Virgil/Helvetica/Cascadia →
    Excalifont/Nunito/Lilita One/Comic Shanns/Liberation Sans). Sizes 16/20/28/36.
  - **Re-measurement risk did NOT manifest**: raw fontSize/fontFamily writes render
    with correct bounding boxes — Excalidraw refreshes text dimensions through
    `updateScene`. So `redrawTextBoundingBox` export was NOT required. (Spot-check
    multi-line / bound-container text later if issues surface.)

- **Phase 6 DONE (Edit menu + action-dispatch fork export + Layers slot)**:
  - **THE ONE FORK EXPORT**: added `executeAction(name, value?)` to the imperative
    API — `vendor/.../components/App.tsx` (api object) + `types.ts`
    (ExcalidrawImperativeAPI). Dispatches any registered Excalidraw action by name
    with correct perform + history. flow types it via augmentation in
    `src/lib/excalidraw-scene.ts` (`ExcalidrawAPI = handle & { executeAction }`) and
    casts the excalidrawAPI callback param in App.tsx.
  - **Build note**: `vendor/excalidraw` dist is **gitignored** (build artifact). After
    editing fork source, ran `node scripts/buildPackage.js` directly (yarn blocks on
    Node 25 engine check; `npm run build:excalidraw` fails install). Did NOT regen
    `.d.ts` (tsc also yarn-blocked) — hence the flow-side type augmentation. On fresh
    clone the dist must be rebuilt (existing project assumption).
  - Edit menu in `MenuBar.tsx` (File·Edit·View·Help): duplicate/delete, group/ungroup,
    z-order (front/forward/back/backward), Align submenu (L/C/R + T/M/B). Wired via
    `onEditAction={(name)=>apiRef.current?.executeAction(name)}`.
  - **Arrow elbow UNLOCKED** (P4 deferral resolved): StrokePanel arrow type now
    sharp/round/elbow, all via `sel.executeAction("changeArrowType", value)` — dropped
    the hand-rolled roundness write. Verified elbow routing renders (screenshot).
  - Layers slot reserved: placeholder panel "Layers are coming in a later update."
  - `e2e/edit-actions.spec.ts` (3): Edit menu items, elbow via executeAction, duplicate.

## Fork edits total: ONE (the executeAction export)
Everything else is flow-level. The originally-earmarked font-registry export was never
needed (Phase 5 used public FONT_FAMILY).

- **Phase 7 DONE (polish/tests/docs)**:
  - **UX fix**: dock publishes `--flow-panel-reserved` (docked width / collapsed /
    0 when floating) via an effect in `PanelDock`; App insets the Excalidraw wrapper
    `left` by it. Excalidraw's bottom-left zoom/undo/redo now clear the docked panel
    (verified by screenshot). Undo button is clickable again.
  - Added the **undo e2e** (blocked in P3): `style-panel.spec.ts` clicks Excalidraw's
    Undo → stroke reverts. Proves newElementWith+captureUpdate history integration.
  - Added `useSelectionStyle.test.tsx` (5, mock api — must `vi.mock("@excalidraw/
    excalidraw")` since importing the real package runs UI code that throws in jsdom).
  - Coverage (`@vitest/coverage-v8` added as devDep): src/lib 81%, control primitives
    95–100%, hook covered. Panels/dock/App are e2e-covered (vitest doesn't count e2e;
    unit-testing PanelShell would be brittle — per web/testing rules).
  - Spec: `docs/superpowers/specs/2026-07-08-dockable-panels-design.md`. Plan marked
    COMPLETE.

## PROJECT COMPLETE (2026-07-08)
All 7 phases shipped. ~150 unit tests, 21 e2e. Fork footprint: ONE additive export
(`executeAction`). Remaining follow-up: the actual **Layers panel** (slot reserved;
port from `draw`), and regenerate vendor `.d.ts` when toolchain allows (executeAction
type is flow-side augmented for now).

## Align sub-panel added (2026-07-08, post-completion)
New **Align** sub-panel: `Style · Stroke · Text · Align · Layers`. Spec/plan:
`docs/superpowers/specs|plans/2026-07-08-align-panel*.md`. Merged to main (commits
919d7b7..b0c54f0). NO fork edits — all 6 align + 2 distribute actions dispatch via the
existing `executeAction` bridge (distribute was already registered in the fork, just
never surfaced).
- **New reusable primitive** `controls/IconActionGroup.tsx` — momentary icon-button
  row (`role="group"`, plain buttons, no selected state), sibling to the radio-semantics
  `IconToggleGroup`. Reuses `.flow-ctl-icons` CSS. Use this for any future fire-and-forget
  action rows.
- `useSelectionStyle` now exposes `selectedCount` (truthy `selectedElementIds`); Align
  greys <2, Distribute greys <3.
- `AlignPanel.tsx` = 2 `.flow-ctl-row` rows, hand-rolled inline SVG icons (TextPanel style).
- Dock auto-adopts new panel ids via existing `syncPanelDefs` (keeps known, appends
  missing) — no dock changes needed to add a panel; existing users get it appended last.
- Edit ▸ Align submenu left intact (both surfaces call the same `executeAction`).
- Tests: 173 unit + align e2e (`e2e/align-panel.spec.ts`) — e2e asserts enable/disable
  by selection size + screenshot; NO exact-geometry assertions (no window scene API,
  autosave async → would be flaky; geometry is the action's job).
