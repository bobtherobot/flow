# Palette gear menu — design

**Date:** 2026-08-12
**Status:** draft

The Color panel's palette footer loses its `+` and `🗑` buttons and gains a single
gear dropdown holding five palette actions, four of which open a dialog. This
makes renaming discoverable, retires a hidden gesture, and adds one genuinely new
capability: copying swatches between palettes.

Builds directly on [the Recent palette](2026-08-12-rotating-colors-user-palette-design.md).

## Problem

Three complaints, one root cause: the footer row is two icon buttons trying to
carry five actions.

1. **Renaming a palette is undiscoverable and barely works.** The only route is
   double-clicking the palette `<select>`, advertised by nothing but a `title`
   tooltip. On a native `<select>` the first click opens the dropdown and the
   second lands on the option list, so in a real browser the gesture is
   unreliable as well as hidden. The project owner concluded the feature had
   been removed; it had not.

2. **The footer trash silently changes meaning.** It removes the selected
   swatches when swatches are selected and deletes the entire palette when none
   are — two actions of wildly different consequence behind one control whose
   `aria-label` and `title` change underneath the user.

3. **There is no way to move a color from one palette to another.** With the
   Recent palette now accumulating colors automatically, the obvious next want
   is promoting a few of them into a curated palette. Today that means reading
   a hex off a swatch and retyping it.

## The shape

The footer row becomes `[palette select] [⚙]`.

The gear opens a dropdown with five items:

| Item | Opens | Inert when |
|---|---|---|
| Rename palette… | dialog | never |
| Add palette… | dialog | never |
| Delete palette… | confirm dialog | the current palette is Recent |
| Delete selected swatches | — | nothing is selected |
| Copy selected swatches to… | dialog | nothing is selected, or no other palette exists |

`Delete selected swatches` acts immediately; it is the one item with no dialog,
because it is undoable in practice (the swatches are still in whatever palette
they came from) and it duplicates the grid's trash tile, which is already a
one-click action.

## The menu

Built on `PanelConfigMenu`'s pattern, not Radix. Radix (`@radix-ui/react-menubar`)
is used by exactly one surface in this app — the desktop menu bar — and this is
the same kind of small anchored popup `PanelConfigMenu` already solves without
it: `role="menu"` on the container, `role="menuitem"` buttons, and a
`useLayoutEffect` that measures the rendered menu and runs `clampMenuPosition`
before paint so it stays fully on-screen regardless of which edge the panel is
docked against.

**Inert items use `aria-disabled`, not the native `disabled` attribute.** For
menu items this is right on its own merits — a disabled button is unfocusable,
so a keyboard user cannot land on the item to discover *why* it is unavailable —
and it matches how menu libraries model disabled items. It is *also* the rule
`PaletteSection` already documents, but note the reason there is different (that
one is about Chrome suppressing mouse events on disabled controls, which breaks
HTML5 drop targets). **Do not flatten the two rules into one**; see *Dialog
buttons* below, where the native attribute is correct.

## The dialogs

All four reuse the existing shared modal system in `src/ui/dialogs.css` —
`.flow-dialog-backdrop`, `.flow-dialog`, `.flow-dialog__header`, `__title`,
`__body`, `__footer`, and `.flow-btn` with its `--ghost` / `--primary` variants.
`LayoutManagerDialog` is the reference implementation.

**They portal to `document.body`.** `LayoutManagerDialog` does not, and does not
need to — it is rendered near the top of the tree. `PaletteSection` sits deep
inside a scrollable, draggable dock panel, and a `position: fixed` backdrop is
positioned relative to the nearest ancestor with a `transform`, `filter`, or
`will-change` rather than the viewport. The dock uses transforms while dragging.
`ColorPopup` already portals for the same reason.

Shared behavior: autofocus the primary field, Enter submits, Escape cancels,
backdrop click cancels, and focus returns to the gear button on close.

- **Rename palette** — text field prefilled with the current name. OK inert when
  the trimmed value is empty.
- **Add palette** — text field prefilled with `nextSetName(palettes)`, the same
  auto-name the `+` button used, with the text selected so typing replaces it. OK
  creates the palette **and switches to it**, matching what `+` did.
- **Delete palette** — "Delete the "X" palette?" with Cancel / Delete. Replaces
  the inline `role="alertdialog"` confirm currently rendered inside the panel.
- **Copy selected swatches to** — a `<select>` of every palette except the
  current one, by name, plus Cancel / Copy.

### Dialog buttons use the native `disabled` attribute

`.flow-btn:disabled` already exists in `dialogs.css` and `LayoutManagerDialog`
relies on it. Dialog buttons are not drop targets and not menu items, so neither
reason for `aria-disabled` applies. Use `disabled`.

## Copying semantics

**Only colors the target does not already have are copied.** A target palette
never gains a duplicate swatch, which matches how `recordUsedColor` already
treats a color that is present as a no-op. Selecting five and copying may
therefore add fewer than five; that is accepted without extra reporting UI.

**The selection survives the copy.** Copying is non-destructive and copying the
same set into a second palette is a plausible next action, so clearing the
selection would cost a re-selection for no safety benefit.

One new store mutation:

```ts
copySwatchesTo(targetId: string, colors: string[]): void
```

It scrubs each color, drops those already present in the target, appends the
rest, and commits **once**. Looping `addSwatch` would fire one notification and
one `localStorage` write per swatch for a single user action.

## What this retires

- **Double-click-to-rename**, and with it the entire `abandonRename` ref and its
  blur-ordering workaround. That flag exists only to distinguish "Escape was
  pressed" from "the input blurred as it unmounted", so that unmounting could not
  commit an edit Escape had just discarded. A dialog with an explicit Cancel
  button has no such ambiguity, so the state disappears rather than moving.
- **The footer trash's dual role.** Removing selected swatches keeps two routes —
  the grid's trash tile and the new menu item — but neither changes meaning
  underneath the user.
- **The inline `role="alertdialog"` confirm** and its `.flow-clr-palette__confirm`
  styles, replaced by the shared modal.
- **The footer `+` and `🗑` buttons** themselves.

**The grid's leading trash tile and its `+` tile both stay exactly as they are.**
Drag-a-swatch-onto-the-trash keeps working, and the `aria-disabled`-never-
`disabled` rule on that tile is unchanged and still load-bearing.

## Interaction with the Recent palette

`Delete palette…` is inert whenever the current palette is Recent, replacing the
`aria-disabled` currently carried by the footer trash. The store-level guard in
`removePalette` stays as it is — it is the backstop that keeps the UI and the
store from disagreeing.

Every other item works normally on Recent: it can be renamed, it can receive
copied swatches, its swatches can be deleted, and it can be the source of a copy.
Renaming it remains safe because `RECENT_PALETTE_ID` is fixed and
`migrateBuiltins` exempts that id from name matching.

## Testing

**Unit — the menu:** each item appears; each conditional item is `aria-disabled`
under its stated condition and live otherwise; clicking an inert item does
nothing; the menu closes after an action; `Delete selected swatches` removes
exactly the selected indices.

**Unit — the dialogs:** each opens from its item and closes on Cancel, Escape,
and backdrop click; Rename commits the typed name and Cancel discards it; Add
creates *and* switches; Delete removes the palette only on confirm; Copy moves
only the non-duplicate colors and leaves the source untouched. Rename's OK is
`disabled` on an empty/whitespace name.

**Unit — `copySwatchesTo`:** appends non-duplicates; skips duplicates; commits
once for a multi-swatch copy (assert via subscriber call count, which is the only
way to catch a loop-of-`addSwatch` regression); no-ops on an unknown target id;
scrubs forgiving input.

**Unit — Recent:** `Delete palette…` is inert when Recent is current and live
for others; renaming Recent still leaves capture working (this already has a
test — keep it, it now covers a user-reachable path rather than a store-only one).

**e2e:** rename a palette through the gear and see the dropdown update; copy a
swatch from Recent into another palette and see it land; confirm `Delete
palette…` is inert for Recent. The existing e2e that force-clicks the footer
trash and the one covering Escape-abandons-rename both get rewritten against the
menu.

**Tests pinned to the retired gestures** — `renames in place on double-click`,
the two `abandonRename` regression tests, the footer-trash dual-role tests, and
the Recent-cannot-be-deleted e2e — are rewritten, not deleted, unless the
behavior they cover genuinely no longer exists.

## Out of scope

- Moving swatches between palettes (this copies; the source is untouched).
- Reordering palettes in the dropdown.
- Copying *whole* palettes, or duplicating a palette.
- Any change to the grid's tiles, to the picker, or to how colors are captured.
- Undo integration for palette operations — palettes have never participated in
  the canvas undo stack and this does not change that.
