# The palette gear menu (the Color panel's palette footer)

Shipped 2026-08-12 (branch `feat/palette-gear-menu`, 6 tasks). The Color
panel's palette footer went from `[palette <select>] [+] [🗑]` to
`[palette <select>] [⚙]`. The gear opens a five-item dropdown — rename palette,
add palette, delete palette, delete selected swatches, copy selected swatches
to another palette — and four of those open dialogs on a shared `PaletteDialog`
shell. Spec: `docs/superpowers/specs/2026-08-12-palette-gear-menu-design.md`.
Build ledger with every reviewer finding:
`.superpowers/sdd/2026-08-12-palette-gear-menu/progress.md`.

Verification at the end of Task 6: unit **936/936 (85 files)**, typecheck exit
0, e2e **137 passed / 2 failed** — the two permanent `text-panel.spec.ts`
container-padding failures and nothing else. No new runtime dependency, zero
fork edits.

Builds directly on [[recent-palette]] and [[color-system]]; it invalidates
parts of [[recent-palette]]'s UI description, which has been corrected in
place.

## Why the footer changed at all

The retired `+` and `🗑` **changed meaning underneath the user based on
whether swatches happened to be selected**: the trash deleted the *palette*
with nothing selected and the *selected swatches* otherwise, from one button
with one label. The gear separates those into two named items that are always
present and go inert rather than silently retargeting.

Note the **grid** still has its own leading `🗑` and `+` tiles
(`.flow-clr-palette__trash`, `.flow-clr-palette__add`). Those are unchanged and
are a different thing from the retired footer pair — the grid trash is the
drag-a-swatch-here drop target, and the grid `+` adds the live color. Only the
*footer* pair went away.

## Three different disabled rules now coexist here, for three different reasons

This is the single most likely thing for a future session to "clean up" and
break. All three live within `PaletteSection`'s subtree, all three look
inconsistent, and **unifying them breaks exactly one of the three**:

1. **Menu items (`PaletteMenu`) — `aria-disabled` + a guard inside every
   handler.** A natively `disabled` button cannot take focus, so a keyboard
   user could never land on the item to discover *why* it is unavailable.
   `aria-disabled` is advisory only — it does not stop a click — which is why
   each `item(...)` handler re-checks its own `enabled` flag and returns.
   Dropping either half is a real hole: drop the attribute and the item lies
   about its state, drop the guard and a forced click actually fires.
2. **`PaletteDialog`'s footer buttons — native `disabled`.** No focusability
   argument applies (the dialog traps focus and there are only two buttons),
   `.flow-btn:disabled` styling already existed, and native `disabled` on a
   `type="submit"` button blocks Enter-to-submit for free — which is the whole
   reason the dialog body is wrapped in a `<form>`.
3. **The swatch grid's trash tile — `aria-disabled`, for an unrelated reason.**
   Chrome delivers **no mouse events at all** to a disabled form control, and
   that tile is an HTML5 drop target. A natively disabled trash would refuse
   drops in precisely the common case: nothing selected, user drags a swatch
   onto it. Pre-existing; documented in [[recent-palette]] too.

`aria-disabled` is invisible without CSS, so both `aria-disabled` cases carry
their own rule in `color.css`
(`.flow-clr-palette__menuitem[aria-disabled="true"]` and its `:hover`
suppression, placed **after** the plain `:hover` so equal-specificity source
order wins — same pattern as the trash tile).

## `flow-clr-palette__gear` is a load-bearing class name, not styling

`PaletteMenu`'s outside-press guard hardcodes that selector:

```ts
if ((e.target as HTMLElement).closest(".flow-clr-palette__gear")) return;
```

Rename the class on the button in `PaletteSection` and the guard stops
matching, so a press on the gear closes the menu on `pointerdown` and the
`click` that follows immediately reopens it — **the toggle's close branch
becomes unreachable** and the gear appears to do nothing on second press. Same
trigger-guard shape `ColorPopup` uses. Covered by a unit test added in Task 3.

## The focus-return bug lived only in the *composition*

`PaletteDialog` originally captured `document.activeElement` at render and
restored it on unmount — correct in isolation, and its own unit tests passed.
`PaletteMenu`'s items were also correct in isolation. Composed, they broke:
`openDialog` calls `setMenuOpen(false)` and `setDialog({kind})` **in one
batch**, so the menu item that was `document.activeElement` at capture time is
already detached by the time focus is handed back. Focusing a detached node is
a silent no-op and the user lands on `<body>`.

Fixed with a `returnFocusTo?: RefObject<HTMLElement|null>` prop that
`PaletteSection` points at its gear. Two details that are easy to undo:

- **It is resolved at teardown, not at mount.** A ref's `.current` mutation is
  not observable to React, so reading it in the mount effect's body would
  freeze whatever value it happened to hold then — possibly `null`.
- The default path still checks `document.contains(target)` before focusing,
  so it declines rather than pretending. Callers with a transient opener must
  pass `returnFocusTo` and not lean on that.

The lesson worth keeping: **both components' unit suites were green while the
feature was broken.** The regression test that matters is the composed one, in
`PaletteSection.test.tsx` ("focus returns to the gear").

## `.flow-clr-palette__menu` is `z-index: 130`, sandwiched deliberately

- Below ~90 it renders **invisibly behind the docked panel** — `.flow-pnl` is
  `z-index: 90` — so the menu opens and the user sees nothing.
- It must stay **under `.flow-dialog-backdrop` (1000)** so the dialogs it opens
  paint above it rather than behind their own trigger.
- 130 also clears the rail (90) and the menu bar (100), matching the sibling
  popup rule in the same file.

Everything in this stack is `position: fixed` with explicit z-indexes, so paint
order is decided entirely by these numbers — there is no DOM-order fallback to
rescue a wrong one.

The menu measures itself in `useLayoutEffect` and clamps on-screen via
`clampMenuPosition` before paint, because the Color panel can be docked against
any edge and the naive "hang off the gear's bottom-left" anchor overflows
routinely.

## `abandonRename` and the blur-ordering workaround are gone

The old inline rename was a bare `<input>` swapped in over the select, which
made "the user pressed Escape" and "the field blurred because it unmounted"
indistinguishable — hence `abandonRename` and a fragile ordering workaround
around blur-vs-keydown. **A dialog with an explicit Cancel has no such
ambiguity**, so both were deleted rather than ported. Do not reintroduce an
inline-edit rename without also reintroducing that problem.

Related retirement: double-click-to-rename on the palette `<select>` is gone.
Rename is the gear's first item.

## `copySwatchesTo` commits once, by design

`palette-store.ts`'s `copySwatchesTo(targetId, colors)` de-dupes against the
target's existing colors, builds an `additions` array, bails if it is empty,
and then makes **one** `commit`. A loop of `addSwatch` per color is the
regression: it would fire N store notifications, N localStorage writes, and N
undo-relevant states for one user action. The e2e test asserts the copied
palette holds exactly one tile partly to pin this.

Two product decisions inside the same flow, both deliberate:

- **The copy dialog's target `<select>` excludes the current palette**, so
  copy-onto-itself is not offerable rather than being a silently swallowed
  no-op.
- **The selection survives a copy.** Copying is non-destructive and sending the
  same swatches to a second palette is a plausible next action.

Also: "delete selected swatches" is the **only** menu item with no dialog. It
is undoable by re-adding the color, and the selection itself is the
confirmation.

## Dialog state is one nullable discriminated field

`useState<null | { kind: "rename"|"add"|"delete"|"copy" }>` rather than four
booleans, which makes "renaming and deleting at once" unrepresentable. Worth
keeping if someone adds a fifth dialog.

## The Shift+Tab-from-container trap gap

`PaletteDialog`'s focus trap compares `document.activeElement` against the
first and last focusable descendants. When the dialog **body has nothing
focusable** — only the delete-confirm dialog, whose body is a bare `<p>` — the
container itself holds focus on open (it has `tabIndex={-1}`), and the
container is in the focusable list at *neither* end. Comparing against `first`
alone therefore left **Shift+Tab as the very first keystroke** unhandled, and
focus walked backward out of the dialog into the page behind an
`aria-modal="true"` backdrop. Fixed by treating the container as a first
boundary too:

```ts
const atFirst = document.activeElement === first || document.activeElement === container;
```

Forward Tab needs no equivalent — the container precedes its own children in
DOM order, so the browser already lands on `first`. **Only the delete dialog
can expose this**, which is why it survived the other three dialogs' tests.

The focusable set is also recomputed on **every** keypress rather than once on
mount, because it changes while the dialog is open (the rename dialog's OK
button flips `disabled` as the user types).

## `PaletteDialog` portals; `LayoutManagerDialog` does not

`PaletteSection` lives inside a scrollable, draggable dock panel, and the dock
applies CSS transforms while dragging. A `position: fixed` backdrop is
positioned against the nearest transformed ancestor rather than the viewport,
so an in-place dialog would be dragged around with the panel. `ColorPopup` and
`PaletteMenu` portal for the same reason. `LayoutManagerDialog` renders as a
sibling of `PanelShell` at `PanelDock`'s root — outside every panel, so no
transformed ancestor, so no portal needed. The inconsistency between the two
dialogs is justified, not an oversight.

## e2e notes

All in `e2e/color-panel.spec.ts` (now 26 tests).

- **`getByLabel("Palette")` needs `{ exact: true }`.** It used to substring-
  match the retired "Add palette" / "Delete palette" buttons; it now
  substring-matches **"Palette actions"**, the gear. Still ambiguous, still
  fatal under strict mode. There is a `selectPalette` helper — use it.
- **`openPaletteMenu(page)` is the shared helper.** Only the gear is scoped to
  `.flow-clr-panel`; the menu **portals to `<body>`**, so every menu-item
  lookup is page-level on purpose.
- **The Recent-cannot-be-deleted test must keep `click({ force: true })`.**
  Playwright's actionability check honours `aria-disabled` and would sit
  retrying "element is not enabled" until the timeout, never dispatching. The
  forced click sends a real mouse event Chrome *does* deliver (the element is
  not natively disabled), so the test proves **the handler declined**, not that
  the browser swallowed the event. Without it the test only detects a missing
  attribute.
- **A guarded menu item leaves the menu open.** Press Escape before reopening,
  or the second `openPaletteMenu` toggles the still-open menu shut.
- `PaletteDialog`'s confirm buttons need scoping and `exact: true` — a bare
  `"OK"` substring-matches "Swap fill and stroke" and "Close Stroke" elsewhere
  on the page. Get the dialog by role+name first.
- **No preset names or hexes.** The copy test creates its own destination
  palette through the Add dialog and reads the prefilled `color set N` name
  back off the dropdown, which also makes "the swatch landed" a tile count
  going 0 → 1 rather than a `toBeVisible` a preset might satisfy for free.
- Both Task 6 tests were **mutation-checked**: `renamePalette` → no-op turns
  the rename test red; `copySwatchesTo` → no-op turns the copy test red at the
  "landed" assertion; adding `removeSwatches(current.id, selected)` after the
  copy (copy → move) turns it red at the source-unchanged assertion.

## Task 6's manual browser smoke was NOT performed

Same as [[recent-palette]]: the agent could not drive a browser by hand and
skipped it rather than claiming it. The e2e tests cover items 1–4 of the brief's
list in substance. **Not covered anywhere:**

- **Enter-to-commit in the rename dialog** (the `<form>`/submit path). Covered
  by a jsdom unit test, never by a real browser keystroke; e2e clicks OK.
- **On-screen clamping of the menu when the Color panel is docked against the
  right edge.** `clampMenuPosition` is unit-tested, but no test docks the panel
  and measures the rendered menu's box.
- The Add dialog's "prefilled name is selected on focus so typing replaces it"
  (`onFocus={(e) => e.target.select()}`) — asserted nowhere.

## Known-good e2e baseline for this tree

- Healthy: **137 passed / 2 failed**. The two failures are
  `e2e/text-panel.spec.ts:201` and `:225` (container padding) — deterministic,
  pre-existing, reproduce on `main` at main's own pinned vendor commit, out of
  scope. **Do not try to fix them.**
- Kill stray dev servers before any run. Careful: `pkill -f vite` **matches the
  shell running it** (its own command line contains the word) and kills your
  own bash. Use `pkill -f '[v]ite'`, and keep the literal word out of the rest
  of the command line.
- The parallel-load flake family from [[recent-palette]] still applies
  (`new-document:60`, `style-memory`, `selection-mode:57`, plus the four more
  the previous branch's Task 6 measured). Re-run a spec alone before believing
  a third failure; `--workers=2` settles it. **Task 6's full default-worker run
  on this branch produced no flakes at all** — a clean 137/2 first time.
</content>
</invoke>
