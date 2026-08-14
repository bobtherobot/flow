# Vertical tool bar (floatable left rail)

Flow-native vertical tool rail replacing Excalidraw's top-center tool island.
Spec/plan: `docs/superpowers/specs|plans/2026-07-08-vertical-toolbar*.md`.

## Shipped
- `src/ui/toolbar/`: `tools.ts` (TOOLS/ToolId/LOCK_ID), `toolbar-state.ts` (pure
  state: normalize/withHiddenToggled/shouldRedock), `useActiveTool.ts` (onChange
  bridge → setActiveTool; types-only vendor import so NO vi.mock needed),
  `icons.tsx`, `ToolButton.tsx`, `ToolbarConfigMenu.tsx`, `toolbar.css`.
  **`ToolBar.tsx` no longer exists** — replaced 2026-08-12 by `ToolRail.tsx` +
  `ToolRails.tsx`, see the split section below.
- Persistence in `src/app/preferences.ts`: `get/setToolbarState` (`flow.toolbar`).
- `App.tsx` owns `toolbar` state (so View menu reads visibility), persists via
  effect, mounts `<ToolRails>` (was `<ToolBar>`), insets the canvas left by
  `--flow-toolbar-reserved`.
- MenuBar: View ▸ Show Toolbar (`Menubar.CheckboxItem`).
- Native island hidden via `index.css` `.App-toolbar-container { display:none }`.
- Arrow-shape tools added (2026-07-09): the single Arrow rail tool split into
  three — `arrow` (sharp), `arrow-curved` (round), `arrow-elbow` (elbow), grouped
  before `line`. ZERO fork edits. `ToolDef` gained optional `toolType` (all three
  map to Excalidraw's `"arrow"`) + `arrowType`. `useActiveTool.setTool(type,
  arrowType?)` sets `currentItemArrowType` via `updateScene({appState})` (public
  API, like `currentItemRoughness`) THEN `setActiveTool` — new arrows read
  `currentItemArrowType` at creation (vendor App.tsx ~L7729/7741). Rail highlight
  is composite: `activeType==="arrow" && currentItemArrowType===tool.arrowType`,
  so exactly one arrow variant lights up. Curved/elbow have NO shortcut (empty
  string; `tools.test` special-cases them); icons reuse Excalidraw's own
  arrow-type glyphs (ported from StrokePanel). Clicking a tool = deterministic
  shape; pressing `A` while arrow active CYCLES sharp→round→elbow→sharp (native
  Excalidraw, vendor App.tsx:4466) and the rail follows via `onChange`. Vendor
  default `currentItemArrowType` is `round` (appState.ts:43) — left as-is, so a
  fresh canvas highlights Curved. Stroke ▸ Type row KEPT (it converts a *selected*
  arrow via `changeArrowType`; new division: rail = new-arrow shape, panel =
  convert selection). e2e keyboard note: shortcuts are container-bound
  (`handleKeyboardGlobally` off), so tests must `canvas.interactive` click to
  focus before `keyboard.press`; and `drawWith` helpers need `{exact:true}` now
  that "Arrow" ⊂ "Curved arrow"/"Elbow arrow".
- Laser pointer added as a rail tool (2026-07-08): `"laser"` is the LAST entry
  in `TOOLS` (shortcut `K`, label "Laser pointer") + a `laser` icon in
  `TOOL_ICONS`. No other code touched — selection/highlight/config-menu/persist
  all derive from `TOOLS`. Dispatches `setActiveTool({type:"laser"})` (public
  API, zero fork edits). Spec/plan: `docs/superpowers/{specs,plans}/2026-07-08-laser-tool-rail*.md`.

## Key facts
- ZERO fork edits — `setActiveTool`/`appState.activeTool` are public API.
- Reuses panel infra: `useDrag`, `clampMenuPosition`, global `.flow-pnl-config*`.
- **SUPERSEDED by the 2026-08-12 split below**: this used to be one 88px rail
  holding all 15 tools. It is now two rails, 44px + 80px.
- Docks left below the 36px menu bar; symmetric with the right-docked controls
  panel (`--flow-panel-reserved`).
- Drag/float/dock is e2e-tested only (jsdom can't do pointer-drag + layout) —
  same split as the panel dock. Unit/component tests cover the rest.
- Config menu: dock/undock + per-tool show/hide (incl. lock), persisted in
  `hiddenTools`.
- **View menu layout controls** (2026-07-09): MenuBar ▸ View adds **Dock Toolbar /
  Dock Quick Actions / Dock Bottom Bar** (each disabled via `data-disabled` when
  that bar is already docked — App passes `isXFloating` + `onDockX` = set
  `floating:false`) and **Reset Layout** (`onResetLayout` → `setToolbar/Quickbar/
  Bottombar(DEFAULT_*_STATE)` with fresh `hidden*` array copies). Reset wipes the
  drag x/y memory too, so a later detach starts from the default spot rather than
  the last-dragged position. `DEFAULT_{TOOLBAR,QUICKBAR,BOTTOMBAR}_STATE` are the
  factory source. Mirrored intent across all three bars. e2e:
  `toolbar.spec.ts` "Reset Layout … wipes its drag memory".
- **Header = grip THEN hamburger (stacked vertically); no close (✕)** (2026-07-09):
  `.flow-toolbar__topbar` is now a `flex-direction: column` — `⠿` grip on top
  (`pointer-events:none` so drags fall through to the topbar drag surface),
  hamburger `☰` below. Removed the ✕ close button; hiding is a **"Hide toolbar"**
  action at the top of the hamburger menu (below Detach/Dock) via a new `onHide`
  prop on `ToolbarConfigMenu`. Mirrors [[quick-actions-bar]]/[[bottom-bar]].
- **Detach clears the menu bar** (2026-07-09): `onToggleFloating` (docked→floating)
  seeds `{x: rail.left, y: max(rail.top, MENUBAR_H + DETACH_GAP)}` (DETACH_GAP=12)
  instead of reusing a possibly-`0` `state.y` — otherwise the floating rail (and
  its top grip) lands under the 36px main menu and is unreachable. e2e tear-off
  test now drags `.flow-toolbar__grip` (was topbar center, which the vertical
  stack put over the hamburger).

## The toolbar/shapebar split (2026-08-12)

The single 88px, 15-tool rail became two docked rails: a 44px "Tools" toolbar
(9 non-shape tools, color part-chooser at its foot) and an 80px two-column
"Shapes" shapebar (arrow ×3, rectangle, diamond, ellipse) docked flush to its
right. Docked and floating layouts are identical for both. Spec/plan:
`docs/superpowers/specs|plans/2026-08-12-toolbar-shapebar-split*.md`.

- **One `ToolRail` component, two instances, mounted by `ToolRails`.**
  `ToolRails` (`src/ui/toolbar/ToolRails.tsx`) is the single writer of
  `--flow-toolbar-reserved` — two `ToolRail` instances writing it independently
  would race — and is also the home of the `useSelectionStyle` call the
  toolbar's color control needs. That call cannot live in `App`: an
  onChange-driven state bump there re-renders `<Excalidraw>`, whose
  `componentDidUpdate` re-fires `onChange` regardless of whether anything
  changed, producing a tight, un-terminating loop. Every onChange bridge in
  this codebase lives in a sibling of `<Excalidraw>`, never in `App` itself —
  same rule `useActiveTool`'s call site already followed.
- **`TOOLS` (9) / `SHAPES` (6) / `ALL_TOOLS` (15)** in `tools.ts`. The quickbar
  (`src/ui/quickbar/actions.ts`) reads `ALL_TOOLS` for its item registry, and
  **that is load-bearing** — reading `TOOLS` there instead would silently drop
  the six shape tools from the quickbar with no type error and no test
  failure unless the quickbar's own coverage checks for all fifteen.
- **Widths and the gutter**: `TOOL_RAIL_WIDTH = 44`, `SHAPE_RAIL_WIDTH = 80`
  (`src/ui/toolbar/rail-layout.ts`), gutter sum 124 with both docked. Dock
  slots collapse: hide or float the toolbar and the docked shapebar slides to
  the screen edge rather than leaving a hole (`shapebarDockLeft`). `railGutter`
  and `shapebarDockLeft` are pure functions — `ToolRails` is the only caller
  that turns them into a DOM write, and `App` passes the same number to the
  bottom bar so its own dock offset clears both rails.
- **`shouldRedock(dropX, slotX)`** — the slot argument (not a hardcoded
  screen-edge test like `x < 10`) is what makes a floating shapebar
  re-dockable at all, since its docked slot sits at `x ≈ 44`, not `x ≈ 0`.
- **The docked/floating layout fix** (carried from Task 6, restated here since
  it's the invariant Task 8's e2e test exists to guard): `.flow-toolbar__content`
  is `flex: 0 1 auto`, the tool grid uses fixed 36px tracks (not `1fr`), and
  `.flow-toolbar__color` lost `margin-top: auto`. Restoring any one of those
  three brings back the original bug — a docked (viewport-tall) shell whose
  grid stretched to fill it, riding the color footer down to the bottom of the
  screen, while the floating shell hugged its content. Measured pre-fix:
  534.5px docked vs 196px floating grid height (`e2e/toolbar.spec.ts` still
  names 534.5 in the comment at its height assertion) — caused by the
  `flex: 1 1 auto` + `1fr` tracks + `margin-top: auto` combination named
  above, NOT by `--flow-toolbar-reserved` disagreeing with the visible dock
  width; that variable plays no part in the tool grid's own layout.
- **`e2e/helpers/rails.ts`** (`railButton`/`pickTool`) scopes to `.flow-toolbar`
  rather than to either rail's `aria-label`, so one locator spans both rails —
  the reason the split only had to touch ten existing e2e specs once, instead
  of every future shape tool touching every spec that picks a shape tool again.
- **`flow.shapebar`** persistence key, independent of `flow.toolbar`, no
  migration between them. A stale tool id surviving in either rail's
  `hiddenTools` array is inert — it just never matches anything in that rail's
  own tool list.
- **`z-index: 91` via `.flow-toolbar--menu-open`, and why it was needed**: the
  two rails are equal-`z-index` fixed siblings. A rail's own (non-portaled)
  config menu is `z-index: 130`, but that number only orders it *within its
  own rail's* stacking context — it does not lift the whole rail above its
  sibling. With the toolbar and shapebar both at the same base z-index, the
  later-painted shapebar sat on top of the toolbar's open menu regardless of
  the menu's own z-index. The fix raises the *open rail's shell* (not the
  menu) via `.flow-toolbar--menu-open { z-index: 91 }`, which lifts the whole
  stacking context the menu paints inside. Same class of bug as commit
  `1d37e5e` (PaletteMenu) — a z-index war only within a stacking context is
  invisible to, and unfixable from, inside that context; it has to be fixed on
  the ancestor that creates the context. e2e:
  `toolbar.spec.ts` "the Tools rail's open hamburger menu paints above the
  docked Shapes rail" (asserts `document.elementFromPoint` resolves inside the
  menu, not the sibling rail, rather than trusting a click succeeded).
- **The permanent 1px docked-vs-floating delta, and why it must stay**:
  `.flow-toolbar--docked` carries only a `border-right`; `.flow-toolbar--floating`
  carries a full 1px border on all four sides (a torn-off panel legitimately
  gets a complete border) — measured docked `43×348` at y-offset 47 vs.
  floating `42×348` at y-offset 48. The cause is NOT the border *count*: the
  shell is `box-sizing: border-box` with its width/height set inline, so the
  declared size is authoritative regardless of how many borders it carries —
  a docked rail's outer box agrees with `--flow-toolbar-reserved` no matter
  how many borders it has, and equalising them would not change that. The
  actual cause is which SIDES gain a border: a floating shell has a top and a
  left border that a docked one has neither of, and those are exactly what
  push the floating content box 1px right and 1px down from its own shell's
  top-left corner — one px narrower, one px lower. This is correct and must
  not be "fixed" by equalising the borders: doing so would paint hairlines
  against the viewport edges themselves, since the docked rail sits flush at
  the viewport's own x=0/y=36 with nothing beyond them to visually separate
  from, and flush again at the viewport floor. `toolbar.spec.ts`'s "lays its
  tools out identically docked and floating" test therefore asserts the
  grid's **height** exactly (that's the axis the real bug lived on) and
  allows ±1px on width and on both y-offsets, with this border asymmetry
  named in a comment at the assertion site.
- **Shape extension: listing is additive, activation is not.** `ToolDef` carries
  only `{id, label, shortcut, toolType?, arrowType?}`. Adding ten new shapes
  as `line` elements with `polygon: true` will require a third optional field
  (e.g., `shapeType?`) in `ToolDef` and a matching branch in `useActiveTool.setTool`
  — same pattern as `arrowType`, so no architectural corners painted. Work lands in
  activation, not in the shape list itself.
- **Tripwire for new shapes: `src/ui/toolbar/tools.test.ts` checks every non-arrow
  tool has a non-empty shortcut.** All ten new shapes will carry `shortcut: ""`,
  so the assertion fails on the first additive entry. This is healthy tooling, not a
  bug — widen the assertion deliberately rather than being surprised by it.
