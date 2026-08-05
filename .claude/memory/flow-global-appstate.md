---
name: flow-global-appstate
description: "flow-owned global appState keys must be stripped from a scene's appState on document open"
metadata:
  type: project
---

# Flow-owned global appState (doc-open protection)

Shipped 2026-08-04. Fixes the long-standing "opening a doc clobbers my
preferences" bug tracked in [[pending-followups]].

## The rule

`src/lib/flow-app-state.ts` owns `FLOW_GLOBAL_APP_STATE_KEYS` — the Excalidraw
`appState` fields flow treats as **app-wide preferences** rather than document
state. Currently: `bindingMode`, `laserColor`, `selectionMode`, `gridSize`.

**When you add a new global preference that lives in `appState`, add its key to
that list.** Otherwise opening a `.excalidraw` authored elsewhere silently
overrides it — the doc's value wins and sticks until the user re-touches the
control.

`withoutFlowGlobals(appState)` returns a copy minus those keys; `updateScene`
merges the partial it is handed, so an omitted key leaves the live
(preference-driven) value alone. Used at the single restore site,
`applyContentsToScene` (`src/lib/excalidraw-scene.ts`).

## Deliberate exclusions

- `objectsSnapModeEnabled`, `gridModeEnabled`, `zenModeEnabled` — **not** flow
  globals. No localStorage key backs them; they are session/document state
  (snap is seeded `true` at init, toggled via Alt+S / View menu, lost on reload).
  A saved doc restoring its own value is intended. Decided 2026-08-04; the
  original follow-up note wrongly lumped `objectsSnapModeEnabled` in with the
  four real prefs. See [[view-menu-toggles]].
- `currentItemRoughness` — re-asserted from the sloppiness preference at the
  call site instead, alongside the element normalization it drives.

## Gotchas

- `withoutFlowGlobals` returns `Omit<T, K>`, **not** `Partial<T>`. `Partial`
  widens every surviving field to `| undefined` and `updateScene`'s appState
  param rejects that on its known fields (tsc TS2322).
- The fork fields (`bindingMode` / `laserColor` / `selectionMode`) *are* visible
  to the type system here via `src/excalidraw-fork.d.ts`, so no cast is needed —
  unlike the `updateScene` write sites in `App.tsx`.

## Tests

- `src/lib/flow-app-state.test.ts` — the pure helper.
- `src/lib/excalidraw-scene.test.ts` — new; mocks `loadFromBlob` via
  `vi.hoisted` (the real package throws in jsdom), asserts the four keys never
  reach `updateScene` while doc-owned state still does.
- `e2e/open-document-prefs.spec.ts` — end-to-end proof: set grid size 40 in
  Preferences, open a foreign doc carrying `gridSize: 20` + the other three,
  assert all four survive and `viewBackgroundColor` still lands. Drives the
  file picker with `page.waitForEvent("filechooser")` + `setFiles({buffer})`,
  which works against `openLocalFile`'s detached `<input type="file">`.
  Verified RED before the fix (40 → 20).
