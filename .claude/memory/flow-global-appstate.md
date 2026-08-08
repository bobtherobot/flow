---
name: flow-global-appstate
description: "flow-owned global appState: stripped on document open, and re-seeded after File ▸ New's resetScene"
metadata:
  type: project
---

# Flow-owned global appState (doc-open protection + New re-seed)

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

## The second consumer: `flowSeedAppState` (added 2026-08-08)

`flowSeedAppState(prefs)` in the same file is the **single source of truth for
every appState value flow seeds into the canvas**. Two callers: `initialData.appState`
at mount, and `handleNew` (File ▸ New). Both must stay on it.

**Why New needs it:** `handleNew` calls Excalidraw's `resetScene()`, which does
`setState({...getDefaultAppState(), …})` — it replaces appState *wholesale*, so
every flow-seeded value reverts to Excalidraw's. flow's per-pref `useEffect`s do
not re-run (their deps didn't change), so nothing put them back.

**That was not cosmetic — it broke drawing outright.** `currentItemRoughness`
reverted to Excalidraw's 1 while `sloppinessRef.current` stayed at the flow
preference (0), so `App.handleChange`'s stray-roughness normalizer matched on the
very first onChange of a drag and called `updateScene({elements: normalizeRoughness(…)})`.
That pushes a **cloned** element array into the scene, while `appState.newElement`
still references the pre-clone object — so every later drag mutation landed on an
orphan and the box in the scene stayed **0×0**. Symptom as reported: "after File ▸
New the height is zero and things don't work right at all."

**Latent hazard, still open:** that normalizer can clone mid-drag for its *intended*
trigger too (a foreign pasted element whose roughness differs). Guarding it — skip
while `appState.newElement` is in flight — was left out of this fix deliberately.

The seed is also why the list below matters twice over: a key missing from
`FLOW_GLOBAL_APP_STATE_KEYS` is clobbered by opening a doc, and a value missing
from `flowSeedAppState` is lost on File ▸ New. A unit test asserts the seed covers
every key in the list.

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

- `src/lib/flow-app-state.test.ts` — the pure helpers. Note it must
  `vi.mock("@excalidraw/excalidraw")` now that the module imports `FONT_FAMILY`:
  the barrel drags in `ImageExportDialog`, which throws on import under jsdom
  ("Cannot use 'in' operator to search for 'filter' in null"). Same stub approach
  as `excalidraw-scene.test.ts`.
- `e2e/new-document.spec.ts` — File ▸ New: a box drawn afterwards gets its dragged
  dimensions, every seeded pref survives, and the canvas still clears. There was
  **zero** coverage of File ▸ New before 2026-08-08, which is how this shipped.
- `src/lib/excalidraw-scene.test.ts` — new; mocks `loadFromBlob` via
  `vi.hoisted` (the real package throws in jsdom), asserts the four keys never
  reach `updateScene` while doc-owned state still does.
- `e2e/open-document-prefs.spec.ts` — end-to-end proof: set grid size 40 in
  Preferences, open a foreign doc carrying `gridSize: 20` + the other three,
  assert all four survive and `viewBackgroundColor` still lands. Drives the
  file picker with `page.waitForEvent("filechooser")` + `setFiles({buffer})`,
  which works against `openLocalFile`'s detached `<input type="file">`.
  Verified RED before the fix (40 → 20).
