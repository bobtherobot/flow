---
name: factory-reset
description: "Preferences ▸ Restore Factory Settings — prefix sweep of localStorage + reload, and why the boundary is localStorage vs IndexedDB"
metadata:
  type: project
---

# Restore Factory Settings (shipped 2026-08-25)

A destructive button at the end of Preferences ▸ General, behind a warning
dialog. Wipes every user-configurable setting; keeps saved drawings.

## Why the boundary is exactly localStorage vs IndexedDB

Surveyed before building, and it held: **every** setting flow persists is a
`flow.*` key in localStorage (19 of them, all defined in `src/app/preferences.ts`),
and the **only** IndexedDB database is `flow`, which holds documents. The vendor
package writes nothing to localStorage — probed a live session, the whole store
was 8 `flow.*` keys. That clean split is what lets the reset be a blunt sweep.

## Sweep by prefix, not by list

`resetFactorySettings()` walks `localStorage.key(i)` and removes anything
starting with `FLOW_PREFS_PREFIX` (`"flow."`). An enumerated list would have to
be kept in step with every preference added later, and forgetting one yields a
*partial* reset — the worst outcome, because the surface that kept its old value
reads as a bug in the reset rather than a missing line. The unit test seeds a
`flow.futureSetting` key nobody wrote code for and asserts it goes too.

Two details that are easy to get wrong:
- The key list is collected **before** deleting. Removing during a live `key(i)`
  walk reindexes the store underneath the loop and silently skips entries.
- The prefix carries its dot. `"flow"` alone would also match `flowers`; there is
  a test for that.

## It reloads, deliberately

`App.handleRestoreDefaults` = `resetFactorySettings()` then
`window.location.reload()`. The cleared settings are read **once at mount** by a
dozen independent surfaces (both tool rails, quick bar, bottom bar, panel dock,
palette store), so pushing defaults into all of them by hand is a long list with
a silent-partial-failure mode. A reload cannot miss one.

Consequence worth knowing: flow **never restores the working document on load**
(`initialData` seeds appState only), so the canvas comes back empty — exactly as
it would after any refresh. The scene is safe: `App`'s 800ms debounced autosave
has already written it to IndexedDB, and the warning dialog says so.

## The keys come BACK after the reload — assert content, not absence

Startup re-seeds `flow.colorPalettes`, `flow.toolbar`, `flow.panelLayout` etc. on
their defaults. A first draft of the e2e asserted those keys were absent after the
reset and failed for entirely the right reason. The correct assertion is on
**content**: the e2e captures the actual hex a user pushed into the Recent
palette and asserts the re-seeded blob does not contain it.

## Dialog behaviour

`src/ui/ConfirmDialog.tsx` (new, generic): `role="alertdialog"`, Escape and
backdrop click both **cancel** — a dismissal gesture must never take the action —
and Escape `stopPropagation`s so it does not also close Preferences underneath.
Focus lands on **Cancel** when `destructive`, because this opens on top of
another dialog whose button the user just pressed, so a stray second Enter has to
be harmless. All six behaviours are unit-tested.
