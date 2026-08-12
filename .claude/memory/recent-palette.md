# The Recent palette (rotating colors → user palette)

Shipped 2026-08-12 (branch `feat/recent-palette`, 6 tasks). flow's private
six-slot recents cache became a real, user-visible, fully editable palette that
appears in the Color panel's dropdown like any other. Spec:
`docs/superpowers/specs/2026-08-12-rotating-colors-user-palette-design.md`.
Build ledger, with every reviewer finding and ruling:
`.superpowers/sdd/2026-08-12-rotating-colors-user-palette/progress.md` — read
it before touching this code again.

Verification at the end of Task 6: unit 885/885 (83 files), typecheck exit 0,
e2e **135 passed / 2 failed** — the two permanent `text-panel.spec.ts`
container-padding failures and nothing else. No new runtime dependency.
Builds on [[color-system]], which this supersedes on recents specifically.

## The load-bearing idea

**The list and the palette are one array.** There is no recents store mirrored
into a synthetic palette, and no sync rule, deliberately. `recordUsedColor` in
`palette-store.ts` writes into the palette with `RECENT_PALETTE_ID`; the rail
popup's six-slot strip is a *view* of that palette's first six entries
(`useRecentPaletteColors` → `RECENT_STRIP_SLOTS = 6`), and the docked panel's
dropdown entry is a view of the same array at capacity 20
(`RECENT_PALETTE_LIMIT`).

The rejected alternative was keeping `flow.recentColors` and mirroring it into
a read-only palette. It was rejected for two sources of truth, and because it
cannot support editing — which is a requirement, not a nicety. **A future
change that reintroduces a separate recents list to "keep the palette clean"
has undone the whole feature.**

## Two constants whose reasons are invisible at the definition site

Both are recorded in `color-palettes.ts` comments, and both fail *silently* if
undone — no crash, no type error, just history quietly gone:

- **`RECENT_PALETTE_ID = "flow-recent"` is fixed, not from
  `generatePaletteId()`, because the user can rename the palette.** Every other
  palette in this store is found by name (`migrateBuiltins` matches builtins by
  name — ids are generated per install). Rename "Recent" to "My colors" and a
  name-based handle stops finding it: capture starts writing into a palette
  that no longer exists, and `recordUsedColor` bails silently on the missing
  palette. `normalizePalettes` preserves arbitrary ids verbatim, so the fixed
  id round-trips through persistence with no special handling.
  **The fixed id alone is not sufficient, though** — `migrateBuiltins` still
  matches everything *else* by name, so it needed its own explicit exemption
  (filtering Recent out of the by-name map, and back into `userMade` by id) or
  a rename to one of the nine `BUILTIN_PALETTE_NAMES` would let a rebuilt
  builtin steal id `flow-recent` on the next migration and silently erase the
  user's history. Fixed in the final review pass; see
  `src/lib/palette-store.test.ts`'s "survives being renamed to a builtin's
  name across a migration".
- **It is deliberately NOT in `BUILTIN_PALETTE_NAMES`.** `migrateBuiltins`
  refreshes every palette named in that list *in place, from its seed colors*.
  Registering Recent as a builtin would wipe the user's entire accumulated
  history on the next `SEED_VERSION` bump — and only then, so it would ship
  green and detonate months later on an unrelated palette change. Left out, it
  is classified as user-made and carried through untouched.

## No `SEED_VERSION` bump — existence is asserted, not seeded

`ensureRecentPalette` runs on **all three** `load()` paths in
`palette-store.ts` (`seedFresh`, `migrateBuiltins`, and the plain stored-state
path), appending the palette whenever no entry carries the id. That is why the
feature needs no seed-version bump: an install at any seed version picks the
palette up on its next boot. Wiring it into only the fresh-install path would
leave every existing install without one, and `recordUsedColor` would no-op
forever with no visible error.

The legacy `flow.recentColors` key is read **only on the run that creates the
palette**, via `getRecentColors()`. Reading it again later would resurrect
colors the user has since deleted, because nothing clears that key — it is left
in place unread, which costs nothing and removes a failure mode from the
migration. `LEGACY_RECENT_LIMIT` in `preferences.ts` is **20, not the retired
system's 6**: a human ruling (Task 4), on the grounds that the one-shot
migration read should match the destination's real capacity rather than bake
the retired system's number in. Unreachable in practice, since the retired
writer capped at 6.

## A hex already present is a no-op — not a move-to-front

`recordUsedColor` bails outright when `palette.colors.includes(hex)`: no
reorder, no commit, no listener notification. This is a **product decision, not
an oversight**, and a deliberate departure from the retired `pushRecent`'s MRU
behaviour. The Recent palette is now a grid the user looks at, drags to
reorder, and curates by hand; re-using a color must not reshuffle it under
them. Anyone "fixing" this into a proper MRU is changing the product.

The practical consequence to know: clicking a slot in the popup's own strip
writes that color and therefore re-records it on close — and lands on exactly
this no-op, which is why the strip does not reorder as you use it.

## Capture lives in `RailColorControl`, not `useColorTarget`

The **only automatic route into the list is the rail popup's picker, when that
session closes.** That is the whole point of the feature: the old
`recordRecent` sat in `useColorTarget.setColor`, which *both* color surfaces
share, so six slots filled with colors the user passed through rather than
chose.

`RailColorControl` owns the popup's open/close state, so it is the only place
that knows when a session ended. It passes `ColorPopup` a **wrapped target**
whose `setColor` stashes the hex in a `lastHex` ref alongside delegating;
`flushSession()` records it. `ColorPopup` itself knows nothing about recording.

What falls out of that shape, and would be lost by "simplifying" the wrapper
away or moving recording back into the shared write path:

- **A forty-event hue drag contributes one color, not forty.** Transient writes
  simply overwrite the ref.
- **Open-and-close with no edit records nothing** — `lastHex` starts null.
- One ref, not a hex plus a dirty flag: null already means "untouched", and a
  second field is one more thing to strand.
- `flushSession` nulls the ref before recording, so a close followed by an
  unmount records once.

**The unmount flush exists for `View ▸ Show Toolbar`.** Hiding the rail makes
`ToolBar` return `null`, taking `RailColorControl` and the open popup with it —
no close handler ever runs. Without `useEffect(() => () => flushSession(), [])`
the session's color is silently lost. Same hazard, same cleanup-effect shape as
`cancelEyeDropper` in [[color-system]].

There is a **second** close path that also needed the flush explicitly: the
active box's popup toggle in `chooserTarget.setPart`. It used to be a bare
`setOpen((o) => !o)`, which bypasses `closePopup` entirely — and clicking the
active box again is the most common way people close this popup. Missing it
would have dropped the session's color in the commonest case.

> `RailColorControl.tsx`'s toggle comment used to claim `open`'s "only writer is
> this same handler". That was **wrong** and known (ledger, Task 3 minor):
> `closePopup` also writes it via `ColorPopup`'s `onClose` (Escape,
> outside-pointerdown). The correct rationale is that `chooserTarget` is
> rebuilt every render, so the captured `open` is always the latest committed
> value. The conclusion held; the reason given did not — fixed in the final
> review pass, and the comment now states the render-rebuild rationale
> directly instead of the false exclusivity claim.

## `setColor` and `adjustColor` merged — the distinction was recording, nothing else

`useColorTarget` used to expose two write methods. `setColor` was
`adjustColor` plus `recordRecent`; once recording moved out they were
byte-identical, so they collapsed into one `setColor`. Keeping two names for
one behaviour is a trap for the next caller, who would have to choose between
them for no reason. If a future change needs the split back, it needs a *new*
reason — the old one is gone.

White/grey/black still never enter the list, but the mechanism changed: it is
no longer `quickSet` routing around a recording method. The quartet chips live
on the rail **outside** the popup, so no session ever captures them.

## Editability, and the one carve-out

The Recent palette behaves like every other palette — selectable, swatches
apply on click, `+` adds the live color, trash tile and ⌘/Ctrl/Shift-click
delete swatches, drag reorders, double-click renames. Colors can therefore
enter it by hand as well as by capture; that is deliberate. The "popup only"
rule governs *automatic* recording.

**`addSwatch` has no cap, unlike `recordUsedColor`.** `recordUsedColor` slices
to `RECENT_PALETTE_LIMIT` on every write, but the `+` tile's `addSwatch` just
appends — so hand-adding swatches can push the Recent palette above 20 until
the next capture trims it back down. Self-healing, and arguably fine for a
palette the user edits by hand like any other, but worth knowing:
`RECENT_PALETTE_LIMIT`'s comment describes a cap that only one of the
palette's two writers actually enforces. Not changed; recorded here so nobody
"fixes" `addSwatch` believing the cap was meant to be absolute.

**Selecting Recent in the palette dropdown makes it the *default* palette,**
with a real, visible consequence. In this UI "selected" and "default" are one
field — `PaletteSection`'s `choosePalette` calls `setDefaultPalette`, and
`ColorSwatch` (Preferences' laser color, the bottom bar's canvas background)
reads `useDefaultPaletteColors()`, which falls back to `BUILTIN_FALLBACK`
when the default palette is empty. So selecting Recent while it has no colors
yet makes those preset rows fall back to the neutral/hue-wheel default. The
mechanism itself is pre-existing — any empty user-made palette does this, it
is not Recent-specific — but this branch ships the first palette that is
*guaranteed present* and *empty on a fresh install*, so it is newly easy to
hit by simply opening the dropdown. The design doc's and this memory's "it
does not become the default palette" claim (about `ensureRecentPalette`
appending it without changing `defaultPaletteId`) is true only of *automatic*
creation — it says nothing about what happens once the user selects it by
hand, which behaves like selecting any other palette. Not changed; the
carve-out that exists (delete-palette going inert) is about deletion, not
default-selection, and was never meant to cover this.

The single exception: **delete-palette goes inert while Recent is selected**,
in `PaletteSection` *and* in `removePalette` itself. The UI guard alone would
leave the store able to produce a state the app immediately undoes on reload
(ensure-exists hands back an empty palette with the history gone).

Two things about that guard:

- **`aria-disabled`, never `disabled`.** Chrome delivers no mouse events at all
  to a disabled form control, and this grid's tiles are HTML5 drop targets that
  run on mouse events — the same trap already documented on the grid's trash
  tile. jsdom models none of this, so a unit test keeps passing with `disabled`
  swapped back in. `e2e/color-panel.spec.ts`'s "the Recent palette cannot be
  deleted" is the only place the distinction is asserted.
- `aria-disabled` alone is invisible without CSS. Task 5's review caught the
  inert trash still showing the full hover highlight and pointer cursor:
  `.flow-clr-palette__icon[aria-disabled="true"]` is placed **after** `:hover`
  in `color.css` so equal-specificity **source order** wins, matching the
  sibling `__trash` rule. A specificity bump would work today and break the
  moment the rules are reordered.

**`removePalette`'s zero-length reseed branch is now unreachable** and was
deliberately kept as documented defensive code (reviewer-adjudicated, Task 5).
It used to enforce the store's "palettes is never empty" invariant; enforcement
now passes to the Recent palette's guaranteed existence. A dead-code sweep that
deletes it is removing the invariant's last written statement.

## e2e notes a future session will otherwise rediscover the hard way

All in `e2e/color-panel.spec.ts`:

- **Playwright's actionability check honours `aria-disabled`.** A plain
  `.click()` on the inert trash never dispatches anything — it sits retrying
  "element is not enabled" until the 30s test timeout. `click({ force: true })`
  is required, and is the *right* assertion: it sends a real mouse event, which
  Chrome does deliver because the element is not natively disabled, so what the
  test proves is that the handler declines rather than that the browser
  swallowed the event.
- **`getByLabel("Palette")` is ambiguous** — it substring-matches the "Add
  palette" and "Delete palette" buttons beside the select. `exact: true`.
- **The scene's fill hex carries an alpha byte.** A fresh rectangle's fill is
  `"transparent"`, which `splitColorAlpha` reads as alpha 0, so every write
  from the picker recombines to `#rrggbb00` until someone touches opacity.
  Palettes store the six-digit form (`scrubHex` drops the byte), so swatch and
  strip `aria-label`s are always six digits. The `appliedFill` helper asserts
  the shape rather than assuming it.
- The old **`"recents accumulate and survive a reload"` test drove the docked
  panel's Hex field** and had been failing since Task 4 collapsed that
  recording path — the branch's real pre-Task-6 e2e state was 129/3, not
  130/2. Rewritten as "two popup sessions accumulate two colors"; the
  accumulation coverage is unchanged, only the route in moved.
- Never hardcode a preset hex, and don't hardcode a palette *name* either —
  which palettes ship is a product decision that has broken tests before. The
  delete test's control case creates a throwaway palette with the `+` button
  instead of naming a builtin.
- All six Recent-palette tests were mutation-checked at Task 6 (drop the close
  flush; put recording back in `useColorTarget.setColor`; delete the `isRecent`
  guard in `onTrash`). Each mutation turns exactly the expected tests red.

### The parallel-load flake family grew, and `--workers=2` settles it

[[color-system]] lists three specs that flake under parallel load
(`new-document:60`, `style-memory`, `selection-mode:57`). Task 6 measured four
more, over eight full-suite runs on a 16-core box: `tool-override.spec.ts:70`,
`stroke-panel.spec.ts:157`, and two **pre-existing** tests in
`color-panel.spec.ts` itself (`:113` "the panel follows the selection and
writes back" and `:324` "selecting text aims the chooser at text"). Each ran
green in isolation immediately afterwards. Never more than one per run, and a
different one each time.

They clustered entirely in a window where the 1-minute load average had climbed
past 7 from back-to-back suite runs. Three runs of the pre-Task-6 tree in the
same window produced no extras — six fewer tests in the heaviest spec file is
enough to change the outcome, which is the same mechanism [[color-system]]
already predicted for the previous branch. **`npx playwright test --workers=2`
produced a clean 135/2 and is the thing to reach for before believing a third
failure**; so did the three most recent default-worker runs once the machine
settled.

**None of the five new Recent-palette tests flaked in any of the eight runs.**

**Step 5 of the Task 6 brief — the manual browser smoke — was never performed.**
The agent that ran Task 6 could not drive a browser by hand and skipped it
rather than claiming it. The e2e tests cover most of that list; two items are
not covered anywhere: the `View ▸ Show Toolbar` unmount flush (unit-tested in
`RailColorControl.test.tsx`, never exercised in a browser), and renaming the
Recent palette and confirming capture still lands in the renamed palette
(the fixed-id design's whole justification, covered only by unit tests).

## Deferred minors, resolved in the final review pass

- `RailColorControl.test.tsx`'s "does not record twice" was renamed to "a
  close followed by an unmount leaves the palette unchanged" — it cannot
  observe `flushSession`'s null-before-record ordering, because
  `recordUsedColor` dedupes anyway, so both orderings give a byte-identical
  array. Not vacuous (it does catch the flush not firing at all), but the old
  name promised more than it delivered. **Becomes load-bearing the moment
  `recordUsedColor` gains ranking or append-then-trim semantics** — assert the
  call count then, not before; no `vi.mock` partial was added over the store
  for that today, deliberately, per reviewer ruling.
- `RECENT_STRIP_SLOTS` is now actually imported by
  `RailColorControl.test.tsx`'s "renders six recent slots", so its "exported
  so tests share one number" doc comment is honest.

## Deferred minors still open (from the ledger)

- `ensureRecentPalette` persists on top of `seedFresh`/`migrateBuiltins`, which
  already persist: a double localStorage write on fresh install and migration.
  Idempotent, harmless.
- No explicit reorder/rename regression test on the Recent palette specifically
  (those paths carry no `RECENT_PALETTE_ID` branching).
