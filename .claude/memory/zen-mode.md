# Zen mode (flow-aware)

Zen mode was a **dead toggle** until 2026-08-22. `executeAction("zenMode")`
(bottom bar, quickbar, View menu, vendor Alt+Z) flipped
`appState.zenModeEnabled`, which only hides *vendor* chrome — and flow already
CSS-hides every vendor surface (see [[bottom-bar]]), so clicking it did nothing
visible. It now hides flow's own chrome and its toggle moved from the bottom bar
to the primary tool rail.

## What zen hides / keeps

| Surface | In zen |
|---|---|
| `MenuBar` | hidden, and collapses `--flow-menubar-h` to `0px` |
| `PanelsRoot` (controls dock) | hidden |
| `QuickBar` | hidden |
| `BottomBar` | hidden |
| Shapes rail | hidden (via `ToolRails`, not its own hook) |
| **Tools rail** | **stays** — grip, hamburger and color footer unchanged |
| `ShapeHandles` | stays (canvas-space manipulation, not chrome) |

## Shipped

- `src/ui/useZenMode.ts` — reactive bridge (`{ zen, toggle }`), mirrors
  `useViewToggles`/`useBottomActions`. **Source of truth stays vendor
  `appState.zenModeEnabled`**, so the rail button, View ▸ Zen Mode, the
  quickbar toggle and Alt+Z all stay in sync with zero flow-owned state and
  zero fork edits.
- `ToolRail` gained `extras?: RailExtra[]` (id/label/shortcut/icon/active/
  onClick), rendered in the tool grid **after** the last tool, plus a `zen`
  prop. `ToolRails` passes one extra (zen) to the Tools rail only.
- The four chrome components each call `useZenMode` themselves and early-return
  `null`. `zenMode` removed from `BOTTOM_ITEMS`; `bottomIcon`'s zen branch and
  `bottombar/icons.tsx`'s `zenIcon` deleted; `toolbar/icons.tsx` gained its own
  `zenIcon` export (not in `TOOL_ICONS` — zen is not a `ToolId`).
- Tests: `src/ui/useZenMode.test.ts`, `src/ui/zen-chrome.test.tsx` (all four
  hides in one file — "what survives zen" is one behaviour), `ToolRail`/
  `ToolRails` extras+gutter cases, `e2e/zen-mode.spec.ts`. Unit 1255, e2e 196.

## Key facts / gotchas

- **App must never subscribe to `onChange`** (documented at `ToolRails.tsx`): an
  App state bump re-renders `<Excalidraw>`, whose `componentDidUpdate` re-fires
  `onChange` — an un-terminating loop. That is *why* zen is not lifted into App:
  every chrome component owns its own subscription and hides itself. Do not
  "simplify" this into a single `zen` prop threaded from `App`.
- **Zen is deliberately NOT a `ToolDef`.** `TOOLS` feeds `ALL_TOOLS` feeds the
  quickbar's tool registry (`quickbar/actions.ts`), so a `zen` entry there would
  mint a bogus quickbar tool item beside that bar's own zen toggle. Hence the
  separate `extras` channel.
- **`railGutter` reads state, not what was mounted.** Hiding the shapebar in the
  JSX alone would leave 80px of dead canvas inset behind it. `ToolRails` derives
  `effectiveShapebar = zen ? {...shapebar, visible:false} : shapebar` and feeds
  the *same* value to both the gutter maths and the render. The user's saved
  shapebar state is never written, so it returns exactly as they left it.
- **Unmounting the menu bar is not enough.** App insets `<Excalidraw>` by
  `var(--flow-menubar-h)`, defined in `menubar.css` `:root`. `MenuBar`'s effect
  sets it inline on `documentElement` (inline beats the stylesheet) and removes
  it on cleanup. The effect sits **above** the early return, per rules of hooks.
- **`--flow-panel-reserved` is *removed*, not zeroed**, when `PanelDock`
  unmounts; App reads it as `var(--flow-panel-reserved, 0px)`, so `""` is the
  zero case. An e2e assertion of `"0px"` there is wrong — assert the
  `.excalidraw` bounding box instead (that spec does both).
- **Escape hatch:** `ToolRail` renders when `state.visible || zen`. Without it,
  entering zen from the View menu with the Tools rail hidden leaves an empty
  screen and only Alt+Z as a way out. Covered by an e2e test that enters zen
  from the menu and exits from the rail.
- **Rail top stays at the hardcoded `MENUBAR_H = 36`** in zen (explicit product
  choice), while the canvas reclaims up to y=0 — so a 36px sliver of canvas
  shows above the rail by design, not by oversight.
