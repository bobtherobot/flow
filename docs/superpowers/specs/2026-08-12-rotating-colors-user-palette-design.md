# Rotating colors → user palette — design

**Date:** 2026-08-12
**Status:** draft

The rotating color list (today's "recents") stops being a private six-slot
cache fed by every color surface, and becomes a real, user-visible, fully
editable palette that the rail's popup picker appends to when it closes.

Two changes with one shared cause: **the list and the palette become the same
array.** Everything else follows from that.

## Problem

Two complaints, both about the same list.

1. **It records too eagerly, from too many places.** `recordRecent` is called
   from `useColorTarget.setColor`, which both color surfaces share. Committing
   a hex field in the docked panel, clicking a palette swatch, eyedropping,
   even clicking a slot in the recents strip itself — all of them push. Six
   slots fill with colors the user passed through rather than chose, and the
   ones they actually settled on get evicted by the traffic.

2. **It is invisible unless the rail popup is open.** The list is the one place
   flow accumulates a picture of what colors this person actually works in, and
   it is reachable only from a compact transient popup. The docked Color panel
   — which is where palette curation lives — cannot see it at all.

## The load-bearing decision

**One array, stored as a real `ColorPalette`.** There is no separate recents
list synced against a palette; the palette *is* the list. The rail popup's
six-slot strip is a view of its first six entries.

The alternative — keep `flow.recentColors` and mirror it into a synthetic
read-only palette — was rejected. Mirroring means two sources of truth and a
sync rule to get wrong, and it cannot support editing the palette, which is a
requirement (see *Editability* below).

## Data model

The palette carries a **fixed id**, `RECENT_PALETTE_ID = "flow-recent"`, rather
than one from `generatePaletteId()`. That is what makes it findable by code
after the user renames it. `normalizePalettes` preserves arbitrary ids
verbatim, so a fixed id round-trips through persistence without special
handling.

Its default name is `"Recent"`.

**It must NOT join `BUILTIN_PALETTE_NAMES`.** `migrateBuiltins` refreshes every
palette named in that list *in place, from its seed colors* — a Recent palette
registered as a builtin would have its entire history overwritten on the next
`SEED_VERSION` bump. Left out of the list, `migrateBuiltins` classifies it as
user-made and carries it through untouched, which is exactly right. **This
feature requires no `SEED_VERSION` bump**, because the palette's existence is
guaranteed by an ensure-exists step rather than by seeding.

### Ensure-exists

A new step in `palette-store.ts` runs on all three `load()` paths — `seedFresh`,
`migrateBuiltins`, and the plain stored-state path — appending the palette when
no entry with `RECENT_PALETTE_ID` is present.

On the run that creates it, and only then, it seeds its colors from the legacy
`flow.recentColors` key so an existing install's six colors carry forward.
After that the key is never read again and nothing writes it.

It is appended last and does **not** become the default palette; Pastel keeps
that job.

### Capacity

- `RECENT_PALETTE_LIMIT = 20` — the stored cap, matching the builtin palettes
  so the Recent palette reads as a peer in the dropdown rather than a stub.
- `RECENT_STRIP_SLOTS = 6` — the rail popup's strip, unchanged in size and
  still a fixed six slots so it never reflows as it fills.

These replace the single `RECENT_LIMIT = 6`.

Eviction is from the **tail**. A consequence worth stating plainly: `addSwatch`
appends, so a hand-added swatch sits at the back and is the first thing dropped
once the list reaches 20.

### `recordUsedColor(hex)`

New mutation in `palette-store.ts`:

1. `scrubHex(hex)`; bail on `null` (this is what keeps `"transparent"` out —
   that is the quartet's *none* chip's job, not the list's).
2. Resolve the palette by `RECENT_PALETTE_ID`; bail if absent.
3. **If the hex is already in `colors`, do nothing** — not even a reorder.
   Reusing a color must not reshuffle the user's grid, which it would if this
   were the usual move-to-front MRU. This is a deliberate departure from the
   retired `pushRecent`.
4. Otherwise unshift and `slice(0, RECENT_PALETTE_LIMIT)`.
5. Commit only if the array actually changed.

## Capture: the last color the popup session wrote

`RailColorControl` owns the popup's open/close state, so it owns capture.
`ColorPopup` itself learns nothing about recording.

`RailColorControl` passes the popup a **wrapped target** whose write methods,
alongside delegating to the real ones, stash the written hex in a ref and set a
`dirty` flag. On close it calls `recordUsedColor(lastHex)` when `dirty`, then
clears both.

Behavior that falls out of this:

- **A hue drag contributes one color, not forty.** Transient mid-drag writes
  overwrite the ref; only the last survives to the close.
- **Open-and-close with no edit records nothing.** The `dirty` flag, not the
  displayed color, is what gates the write.
- **Alpha is dropped**, via `scrubHex`. Unchanged from today: nudging opacity
  on a color already in the list is a no-op rather than a slot spent on a
  near-duplicate.
- **The part chooser lives outside the popup**, so a session can switch parts
  and write to more than one. The rule is "the last color this session wrote",
  which equals "the final color of the active part" in every case where the
  last write went to the part that is active at close.

### Capture must survive an unmount

Closing is not only the close button, Escape, and outside-click. The popup can
be unmounted out from under an open session — `View ▸ Show Toolbar` makes
`ToolBar` return `null`, taking `RailColorControl` and the popup with it. This
is the same hazard `cancelEyeDropper` already guards in these two files, and
capture uses the same cleanup-effect pattern: an unmount with `dirty` set still
records.

## Editability

The Recent palette behaves like any other palette in `PaletteSection`, with
exactly one exception.

Works unchanged: appears in the dropdown, is selectable, swatches apply on
click, `+` adds the live color, the trash tile and ⌘/Ctrl/Shift-click-then-
delete remove swatches, drag reorders, double-click renames.

The exception: **delete-palette goes inert while the Recent palette is
selected.** Deleting a palette the app maintains and will silently recreate is
incoherent — the user would get an empty one back on next load with their
history gone. The button carries `aria-disabled` and a `title` saying why.

`aria-disabled`, **never** `disabled`: Chrome delivers no mouse events at all to
a disabled form control, and this grid's drop targets run on mouse events. That
trap is documented on the trash tile in `PaletteSection.tsx` and applies to
every inert control in this component.

This does mean colors can enter the list by hand, via `+`, alongside the popup.
That is a deliberate acceptance: the "popup only" rule governs *automatic*
recording — it exists to stop incidental traffic from evicting real choices —
and does not extend to a user deliberately curating a palette.

## Retirement

Deleted outright:

- `src/lib/recent-colors.ts` in full — `pushRecent`, `normalizeRecents`,
  `RECENT_LIMIT`, and their tests. The two surviving constants move:
  `RECENT_STRIP_SLOTS` to the popup's module, `RECENT_PALETTE_LIMIT` to
  `color-palettes.ts` beside the other palette constants. `normalizeRecents`'s
  ten lines fold into `getRecentColors` as a private helper.
- `setRecentColors` in `app/preferences.ts`. **`getRecentColors` stays** — it is
  the migration's only reader, and localStorage access belongs in
  `preferences.ts` rather than being reached into from the store.
- `ColorUiState.recents` and `recordRecent` in `color-store.ts`, leaving that
  store holding `activePart` and `numericMode`.

Collapsed:

- `useColorTarget`'s `setColor` and `adjustColor` become byte-identical once
  `recordRecent` leaves — the recording call was their only difference. They
  merge into one `setColor`, and the call sites in `ColorPanel`, `ColorPopup`,
  `NumericFields`, and the eyedropper handlers update to it. Keeping two names
  for one behavior is a trap for the next caller, who would have to pick
  between them for no reason.

The `flow.recentColors` localStorage key is left in place but unread after
migration. Nothing clears it; it costs nothing and removes a failure mode from
the migration.

## Testing

**Unit — `palette-store`:**
`recordUsedColor` unshifts a new hex; is a no-op (no reorder, no commit) for a
hex already present; evicts from the tail at `RECENT_PALETTE_LIMIT`; rejects a
bad hex and `"transparent"`; no-ops when the palette is missing. Ensure-exists
creates the palette on each of the three load paths; seeds from
`flow.recentColors` on creation and only on creation; leaves an existing
palette's colors alone; survives a `migrateBuiltins` pass with its colors
intact.

Store-backed vitest files need the `mockLocalStorage` + `vi.stubGlobal` shim
(jsdom's native `localStorage` is non-functional here) and a `beforeEach` of
`localStorage.clear()` + `reloadPaletteStore()` — copy from
`preferences.test.ts`.

**Unit — `RailColorControl`:**
Records on close after a write; records on unmount while open after a write;
records nothing when the session wrote nothing; records the *last* hex after
several writes; records once, not per write.

**Unit — `PaletteSection`:**
Delete-palette is `aria-disabled` for the Recent palette and live for others;
the other controls stay live for the Recent palette.

**e2e — the full loop:**
Pick a color in the rail popup, close it, and assert the color appears both in
the popup's strip and as a swatch in the Recent palette in the docked Color
panel. Assert a color set from the *docked* panel does not enter the list.

Per [[color-swatches]], never hardcode a preset hex in a test — read
`getDefaultPaletteColors()` in unit tests, and pin a fixture palette via
`page.addInitScript` in e2e.

**Fixture check:** `e2e/laser-color.spec.ts` (`pinPresets`) and
`e2e/bottombar.spec.ts` pin `flow.colorPalettes` to a single palette.
Ensure-exists will append a second one there. Confirm neither spec asserts on
palette count or on the dropdown's contents before assuming they are unaffected.

**Baseline:** the suite's healthy state is 130 passed / 2 failed, the two
permanent `text-panel.spec.ts` container-padding failures. `pkill -f vite`
before any e2e run. See [[color-system]] for both.

## Out of scope

- Any change to how color is derived from the selection, to `useColorDraft`, or
  to the write path's stroke-revival rule.
- Any change to the docked panel's picker chrome.
- Making the Recent palette the default palette.
- Showing the list anywhere other than the popup strip and the palette
  dropdown.
