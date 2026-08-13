# Toolbar / shapebar split — design

**Date:** 2026-08-12
**Status:** draft

The left tool rail splits into two rails built from one component: a slim 44px
**toolbar** holding the nine non-shape tools, and an 80px two-column
**shapebar** holding the shape tools. Both dock, float, hide and configure
identically, and — new — both lay out their contents the same way whether docked
or floating.

This is the first of two specs. The eleven new parametric shapes (triangle,
star, cylinder, cube, parallelogram, fat arrow, cloud, trapezoid, tape, summing
junction) are a separate, much larger project; see [Out of scope](#out-of-scope).

## Problem

Three complaints about the single rail as it stands.

1. **It is too wide.** `RAIL_WIDTH = 88` — two 40px columns. Its own comment
   says the second column exists "to make room for the shape tools coming later,
   and for the color control pinned at the bottom". Neither reason survives
   scrutiny: the shapes are moving out, and the compact part chooser measures
   ~31px (`--flow-clr-chip-size: 14px` × 2 + a 3px gap), so it fits a single
   36px column with room to spare.

2. **Docking changes the layout.** Three rules conspire. The docked shell sets
   `bottom: 0`, so it is viewport-tall; `.flow-toolbar__tools` is
   `flex: 1 1 auto`, so the grid absorbs that height; `.flow-toolbar__color` is
   `margin-top: auto`, so the chooser is shoved to the rail's foot. Dock the
   rail and the color control leaps a few hundred pixels down the screen. The
   `1fr` grid tracks resize with the shell for the same reason.

3. **One rail cannot hold the shapes that are coming.** Six shape tools today,
   seventeen after the second spec. Mixed in with the nine everyday tools that
   is an undifferentiated column of two dozen buttons.

## The shape

Two rails, same component, same behaviours:

| | Toolbar | Shapebar |
|---|---|---|
| Width docked | 44px (1 × 36px column) | 80px (2 × 36px columns) |
| Tools | selection, hand, text, freedraw, line, frame, image, eraser, laser | arrow, curved arrow, elbow arrow, rectangle, diamond, ellipse |
| Footer | color part chooser | none |
| Persisted under | `flow.toolbar` | `flow.shapebar` |
| Dock slot | screen edge | right of the toolbar |

Both get: drag-to-tear-off, drag-near-slot-to-redock, a hamburger with
Detach/Dock + Hide + per-tool show/hide, a View menu Show/Dock pair, and
participation in Reset Layout.

### Tool inventory

`tools.ts` splits its single `TOOLS` array into two, plus a union:

```ts
export const TOOLS: readonly ToolDef[]   // 9 non-shape tools
export const SHAPES: readonly ToolDef[]  // 6 shape tools
export const ALL_TOOLS = [...TOOLS, ...SHAPES]
```

`ALL_TOOLS` is not decoration. `src/ui/quickbar/actions.ts` derives the Quick
Actions bar's tool items from `TOOLS`; left alone, the six shapes would silently
disappear from the quickbar as a side effect of this refactor. It reads
`ALL_TOOLS` instead, and the quickbar's persisted `hiddenItems` ids stay valid.

All three arrow variants move to the shapebar. They keep their existing
mechanics: one underlying `"arrow"` tool type, differing by the `arrowType` they
write to `currentItemArrowType`, with the composite active-highlight rule
unchanged.

`ToolId`, `icons.tsx` and `useActiveTool.ts` are untouched — they are keyed by
tool id, and no id changes.

## Architecture

### One component, two instances

`ToolBar.tsx` generalises into `ToolRail`, taking what currently differs between
the two rails as props:

```ts
interface ToolRailProps {
  api: ExcalidrawAPI | null;
  tools: readonly ToolDef[];
  width: number;
  columns: number;
  /** aria-label + the noun in the hamburger's "Hide …" item. */
  label: string;
  /** Left edge when docked, in viewport px. */
  dockLeft: number;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
  footer?: ReactNode;
}
```

The color control stays the toolbar's concern, and getting it there needs one
extra component. `RailColorControl` needs `sel` from `useSelectionStyle`, which
`ToolBar` currently calls in its own body. A generic `ToolRail` should not know
about selection style, and App must not call the hook either — the comment at
`ToolBar.tsx:41` explains why: an onChange-driven bump in App re-renders
`<Excalidraw>`, whose `componentDidUpdate` re-fires `onChange`, which does not
terminate. So a thin `ToolRails` component sits where `<ToolBar>` is mounted
today, receives both rail states from App, calls `useSelectionStyle` itself, and
renders the two `ToolRail`s — passing `footer={<RailColorControl …/>}` to the
toolbar and nothing to the shapebar. It is also the natural home for the
`dockLeft` arithmetic.

`ToolbarConfigMenu` takes its rows from the passed list rather than importing
`TOOLS`, and its "Hide toolbar" item takes its noun from `label`.

Widths live in `rail-layout.ts` as `TOOL_RAIL_WIDTH = 44` and
`SHAPE_RAIL_WIDTH = 80`, replacing `RAIL_WIDTH`. `RailColorControl` imports the
old constant for its popup's fallback anchor and switches to `TOOL_RAIL_WIDTH` —
it is mounted only as the toolbar's footer, so the toolbar's width is the only
correct answer for it.

### Layout that does not shift

The docked shell keeps `bottom: 0` — the surface, background and right hairline
still run to the bottom of the viewport, which is where the accepted white space
comes from. What changes is that the contents no longer stretch into it:

- A content wrapper (tool grid + footer) is `flex: 0 1 auto; overflow-y: auto`.
  It hugs its content, and scrolls only when content exceeds available height —
  so a 17-tool shapebar on a short screen degrades to a scroll rather than
  overflowing.
- The grid goes from `repeat(2, 1fr)` to `repeat(var(--flow-rail-cols), 36px)`
  with `justify-content: center`. Fixed tracks cannot resize with the shell.
- `.flow-toolbar__color` loses `margin-top: auto`. It sits directly under the
  grid in both modes.
- Floating rails get `max-height: calc(100vh - var(--flow-rail-top) - 8px)` so a
  tall floating shapebar scrolls instead of running off-screen.

The invariant this buys, and the one the e2e test asserts: **the tool grid's
bounding box is identical docked and floating.**

### Dock slots

`ToolRails` becomes the single writer of the reserved left gutter:

```
--flow-toolbar-reserved = (toolbar docked ? 44 : 0) + (shapebar docked ? 80 : 0)
```

The effect that sets it moves out of `ToolRail`, which is now
multiply-instantiated and would otherwise have two writers racing over one
variable. It lands on `ToolRails` rather than App for two reasons: App has no
test file, so the assertion that the gutter tracks both rails would have nowhere
to live; and `ToolRails` already holds both states for its `dockLeft`
arithmetic. The variable keeps its name so the canvas padding rule
(`src/App.tsx:424`) and the bottombar's `toolbarReserved` prop
(`src/App.tsx:465`) keep working; the bottombar receives the same sum, so it
still clears both rails.

Each rail's `dockLeft` comes from the same arithmetic, so it lives once as pure
functions in `rail-layout.ts` — `railGutter(toolbar, shapebar)` for the sum and
`shapebarDockLeft(toolbar)` for the offset — read by App (the CSS variable and
the bottombar prop) and by `ToolRails` (the `dockLeft` props). The toolbar's
`dockLeft` is always 0; the shapebar's is 44 when the toolbar is docked and 0
otherwise. **Slots collapse** — hide or float the toolbar and the docked
shapebar slides to the screen edge.

`shouldRedock` gains the slot:

```ts
export function shouldRedock(dropX: number, slotX: number, margin = REDOCK_MARGIN): boolean {
  return dropX - slotX < margin;
}
```

Without this, a floating shapebar could never re-dock: its slot is at x=44, and
the old rule only redocked drops at x<10.

### Persistence

`flow.shapebar`, normalised by the existing `normalizeToolbarState` — the state
shape is identical, so `ToolbarState` is reused as-is rather than renamed, and
`DEFAULT_TOOLBAR_STATE` gets a `DEFAULT_SHAPEBAR_STATE` sibling. The shapebar
defaults to `visible: true`; anything else and the shape tools vanish for
existing users on upgrade.

No migration. An existing `flow.toolbar.hiddenTools` may contain `rectangle` or
`arrow-elbow`; each rail filters `hiddenTools` against its own list, so stale
ids are inert. A user who had hidden the rectangle keeps it hidden only if the
shapebar's own state says so, which it will not — a one-time, harmless reset of
that preference for the six moved tools.

### Menus

View menu gains **Show Shapebar** (checkbox) and **Dock Shapebar** (disabled via
`data-disabled` when already docked), mirroring the toolbar's pair. **Reset
Layout** resets the shapebar too, with a fresh `hiddenTools` array copy like the
other three bars, wiping its drag memory along with everything else.

The shapebar's hamburger is the toolbar's menu with a different list: Detach or
Dock, Hide shapebar, then one checkbox per shape tool.

## Testing

Unit / component:

- `tools.test.ts`: the split — 9 and 6 entries, no id appears in both, every id
  in `ALL_TOOLS` has an icon, shortcuts unchanged (curved/elbow still blank).
- `toolbar-state.test.ts`: `shouldRedock` against a non-zero slot.
- `ToolRail.test.tsx`: renders exactly the tools it is handed, honours
  `hiddenTools`, renders a footer only when given one, applies `columns` and
  `width`.
- `ToolbarConfigMenu.test.tsx`: rows come from the passed list; the Hide item's
  label follows `label`.
- quickbar `actions.test.ts`: tool items still cover all 15 tools.

e2e — the parts jsdom cannot reach (drag, dock geometry, layout):

- New `e2e/shapebar.spec.ts`: visible by default; docked box is flush right of
  the toolbar; canvas left inset is 124px with both docked and 80px with the
  toolbar hidden; tear off and redock; hide from the hamburger and from View.
- `e2e/toolbar.spec.ts`: rail is 44px wide; **the tool grid's bounding box is
  identical docked and floating** (the regression that motivated this work);
  existing tear-off, redock and Reset Layout tests updated for the new width.

## Out of scope

The eleven new shapes and their orange parametric handles. They need a shape
representation, a handle-drag overlay, geometry generation per shape, and a
stored parameter that survives resize, undo and save — none of which exists
upstream (transform handles are 8 directions plus rotation, and there is no
parametric handle concept anywhere in the fork).

The working assumption for that spec, recorded here only so this one does not
foreclose it: flow-generated `line` elements with `polygon: true` (upstream
supports closed fillable polylines — `packages/element/src/types.ts:358`)
carrying a flow-owned parameter, with the orange dots drawn as a DOM overlay
positioned from `scrollX`/`scrollY`/`zoom` rather than as new vendor transform
handles. The shapebar needs only `{id, label, shortcut, icon}` per entry, so
those eleven arrive as additive list entries here.
