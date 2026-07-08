# Align sub-panel — design

Date: 2026-07-08
Status: Approved (pending spec review)

## Summary

Add a new dockable controls sub-panel **Align** to flow's Illustrator-style
accordion (`src/ui/panels/`). It surfaces Excalidraw's align and distribute
actions as two rows of momentary icon buttons, always visible in the dock
(greyed when the selection is too small). This complements — does not replace —
the existing **Edit ▸ Align** submenu.

The dockable-panel system it plugs into is complete (see
`2026-07-08-dockable-panels-design.md` and `.claude/memory/left-panel-accordion.md`).

## Goals

- A new "Align" sub-panel sitting **after Text, before Layers** in the dock:
  `Style · Stroke · Text · Align · Layers`.
- **Align** row: left / horizontal-center / right / top / vertical-center / bottom.
- **Distribute** row: horizontal / vertical (new to flow — the fork already ships
  the actions, they were never surfaced).
- Buttons grey out when the selection has too few elements.
- No new fork edits.

## Non-goals

- Removing or changing the Edit ▸ Align submenu (kept as-is; both call the same
  `executeAction`, so no divergence).
- Adding Distribute to the Edit menu (panel-only for now).
- A general "arrange / spacing" toolset beyond align + distribute (YAGNI).

## Actions used (all already registered in the vendored fork)

| Row | Button | Action name |
|-----|--------|-------------|
| Align | Left | `alignLeft` |
| Align | Center (horizontal) | `alignHorizontallyCentered` |
| Align | Right | `alignRight` |
| Align | Top | `alignTop` |
| Align | Middle (vertical) | `alignVerticallyCentered` |
| Align | Bottom | `alignBottom` |
| Distribute | Horizontal | `distributeHorizontally` |
| Distribute | Vertical | `distributeVertically` |

All dispatched via the existing `sel.executeAction(name)` bridge
(`useSelectionStyle` → the `executeAction` fork export), which reuses each
action's correct `perform` + history. **No fork changes.**

## Architecture

### 1. New primitive — `IconActionGroup`

`src/ui/panels/controls/IconActionGroup.tsx`

A sibling to `IconToggleGroup`, for **momentary** actions that hold no selected
state (unlike stroke-style / text-align, which are radio groups). Chosen over
extending `IconToggleGroup` (which would add a dead `value` prop and two behavior
modes to a currently-clean primitive) and over inlining buttons in the panel
(no isolated test target, markup duplicated on reuse).

```ts
export interface ActionOption {
  key: string;
  /** Accessible name / tooltip. */
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface IconActionGroupProps {
  options: readonly ActionOption[];
  ariaLabel: string;
  disabled?: boolean;
}
```

- Renders `<div role="group" aria-label={ariaLabel}>` containing one plain
  `<button type="button">` per option (NOT `role="radio"`, no `aria-checked`).
- Reuses the existing `.flow-ctl-icons` / `.flow-ctl-icons__btn` CSS — no new CSS
  expected; add only if a visual tweak is needed.
- `disabled` disables every button and sets `aria-disabled` on the group.

### 2. New panel — `AlignPanel`

`src/ui/panels/AlignPanel.tsx`, props `{ sel: SelectionStyle }`.

Two `.flow-ctl-row` rows (label + control), matching `TextPanel`'s layout:

- **Align** row → `IconActionGroup` with the 6 align options. `disabled` when
  `sel.selectedCount < 2`.
- **Distribute** row → `IconActionGroup` with the 2 distribute options.
  `disabled` when `sel.selectedCount < 3`.

Each option's `onClick` is `() => sel.executeAction(name)`.

### 3. Hook — add `selectedCount`

`src/ui/panels/useSelectionStyle.ts` gains a derived
`selectedCount: number` on `SelectionStyle`, computed from the same
`selectedIds` that already backs `hasSelection`:

```ts
const selectedCount = Object.values(selectedIds).filter(Boolean).length;
```

Thresholds mirror Excalidraw's own predicates (align needs >1, distribute needs
>2 selected elements).

**Known edge case (accepted):** this counts raw selected element ids, so two
elements inside a single group counts as 2 and enables the buttons, while the
align action treats the group as one unit and no-ops. This matches Excalidraw's
own enable-then-noop behavior closely enough; not worth group-flattening here.

### 4. Registration

One entry in `src/ui/panels/PanelsRoot.tsx` `defs`, between `text` and `layers`:

```ts
{ id: "align", label: "Align", render: () => <AlignPanel sel={sel} /> },
```

No dock changes: `syncPanelDefs` (`panel-dock-state.ts`) already keeps known
panels and appends any def id missing from a persisted layout. So the new panel
appears for fresh users in-order (after Text) and for users with a saved
`flow.panelLayout` appended at the end. Accepted.

### 5. Icons

8 hand-rolled inline SVGs in `AlignPanel.tsx`, following the `alignIcon` helper
style already in `TextPanel.tsx` (small `currentColor` strokes, `aria-hidden`).
Align icons: a bar with shapes flush to an edge/center. Distribute icons: evenly
spaced marks along an axis.

## Data flow

Selection change → Excalidraw `onChange` → `useSelectionStyle` re-renders (bumps)
→ `PanelsRoot` re-renders all panels → `AlignPanel` reads `sel.selectedCount`,
greys rows accordingly. Button click → `sel.executeAction(name)` →
`api.executeAction` (fork export) → action `perform` mutates scene + records one
undo step. No flow-side scene writes; align/distribute geometry is entirely the
action's responsibility.

## Testing

- **Unit** (`IconActionGroup.test.tsx`): renders one button per option; click
  fires the matching `onClick`; `disabled` disables all buttons and sets
  `aria-disabled`; `role="group"` (not radiogroup) and no `aria-checked`.
- **Unit** (`useSelectionStyle` / selection): `selectedCount` reflects the number
  of truthy `selectedElementIds` (mock-api test, matching the existing
  `useSelectionStyle.test.tsx` pattern that must `vi.mock("@excalidraw/excalidraw")`).
- **e2e** (`e2e/align-panel.spec.ts`): draw 2 rectangles at different x, select
  both, click **Align Left** in the panel, assert their left edges match (read
  scene via the same approach other panel specs use). Draw 3 rectangles, click
  **Distribute Horizontally**, assert equal gaps. Reuse the spec conventions from
  `e2e/text-panel.spec.ts` (`getByTestId("toolbar-rectangle").click({force:true})`,
  panel buttons by accessible name/title).

## Files touched

New:
- `src/ui/panels/controls/IconActionGroup.tsx`
- `src/ui/panels/controls/IconActionGroup.test.tsx`
- `src/ui/panels/AlignPanel.tsx`
- `e2e/align-panel.spec.ts`

Modified:
- `src/ui/panels/useSelectionStyle.ts` (+ `selectedCount`)
- `src/ui/panels/PanelsRoot.tsx` (+ `align` def, import)
- (optional) `src/ui/panels/panels.css` only if a visual tweak is needed

Fork: none.

## Risks

- **Icon legibility** at panel size — verify the 8 SVGs read clearly; iterate on
  the paths during implementation (screenshot check).
- **Distribute enablement** — confirm `distributeHorizontally/Vertically` behave
  as expected via `executeAction` (they were never exercised in flow before);
  covered by the e2e.
- **Persisted-layout order** for existing users (Align appended at end, not after
  Text) — accepted, documented above.
