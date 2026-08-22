# Paste position

A global **Paste position** preference in File ▸ Preferences ▸ General —
`flow.pastePosition`, four radios, default `original`. Shipped 2026-08-22 on
`feat/paste-position`. It controls where a clipboard paste of *elements* lands:

| value | label | behavior |
| --- | --- | --- |
| `pointer` | At mouse pointer | bbox centered on the last canvas pointer position |
| `viewport` | Center of view | bbox centered in the visible canvas |
| `offset` | Offset 10px from original | copied coords + `10px × N`, **cascading** |
| `original` | Same position as original | copied coords exactly — **the default** |

## The premise was wrong, and the reason matters

The request said "paste currently centers in the viewport"; reading the code
said otherwise — `insertClipboardContent` passed
`formFactor === "desktop" ? "cursor" : "center"`, i.e. paste-at-cursor on
desktop. **Both were right, and the fork's own chrome is why.** flow's rails
(124px) and right dock (260px) shrink the Excalidraw container to ~896×684 in a
1280×720 window, and `getFormFactor` (`packages/common/src/editorInterface.ts`)
calls anything with `minSide >= 600 && maxSide <= 1180` a **tablet**. So on
ordinary desktop windows flow was already taking the non-desktop branch and
centering. This was found by an e2e failure asserting the pasted center against
the pointer — expected 276, got 448, which is exactly `width / 2`.

Consequence for the implementation: `pointer` mode does **not** re-apply the
`formFactor` gate. An explicit preference has to mean what it says, and
`viewport` is right there for anyone who wants the other behavior. If a future
change reintroduces that gate "for parity with upstream", paste-at-cursor
silently stops working at most flow window sizes with no test failure outside
`e2e/paste-position.spec.ts`.

Anything else that reads `formFactor` in flow is worth re-checking for the same
reason: flow is a desktop app whose editor is frequently tablet-sized.

## Fork edits (4 sites, all additive)

Follows the `selectionMode` precedent exactly — see [[flow-global-appstate]].

1. `packages/excalidraw/types.ts` — `pastePosition?: "pointer" | "viewport" | "offset" | "original"` on `AppState`
2. `packages/excalidraw/appState.ts` — default `"original"` + `{ browser: false, export: false, server: false }` (flow owns persistence)
3. `packages/common/src/constants.ts` — `PASTE_OFFSET_STEP = 10`
4. `packages/excalidraw/components/App.tsx` — `resolvePastePositioning()` + cascade
   fields, the one call site in `insertClipboardContent`, and a `"keep"` member on
   `addElementsFromPasteOrLibrary`'s `position` union

`pastePosition` is registered in the build script's stage-4 `FORK_EDITS` list, so
a submodule rebase that drops it fails `npm run build:excalidraw`.

## Why the preference is read at the CALL SITE, not inside the paste function

`addElementsFromPasteOrLibrary` also serves library insertion, drag-drop of
`.excalidrawlib` payloads, and `onInsertElements`. Library elements carry
arbitrary authoring coordinates, so honoring "same position as original" there
would fling them off-screen. Only `insertClipboardContent`'s elements branch
calls `resolvePastePositioning`; every other caller keeps its own placement.
Same reasoning excludes text/image/SVG/mermaid pastes — they have no "original".

## `"keep"` and the grid

The new `position: "keep"` expresses "the elements' own coordinates plus
`offset`" as a *target bbox center*, so the existing `dx = x - elementsCenterX`
maths stays shared across all modes. It also **skips `getGridPoint`** — grid
snapping would defeat both exact placement and the fixed-step cascade. (Moot at
flow's defaults: `getEffectiveGridSize()` returns null with grid mode off, so
snapping never ran here anyway; the skip matters only with the grid on.)

## Cascade keying

`offset` cascades off `lastPasteFingerprint` — the joined element ids of the
incoming payload — plus `pasteCascadeStep`. Same payload → step++; different
payload → reset to 1. Session state on the `App` instance; never persisted,
never in appState. Re-copying the same selection produces the same ids, so it
keeps fanning out rather than restacking on the previous paste. e2e proves three
pastes of one payload land at +10/+20/+30.

## `PASTE_OFFSET_STEP` exists twice, on purpose

The fork's copy (`packages/common/src/constants.ts`) is the one the paste path
applies; flow's copy (`src/lib/paste-position.ts`) exists only so the
Preferences label can name the number. flow's copy is NOT imported from
`@excalidraw/excalidraw`: `paste-position.ts` is imported by
`PreferencesDialog.tsx`, and pulling the Excalidraw barrel into that import
graph blows up its jsdom tests (the same reason `flow-app-state.test.ts` has to
mock the barrel for one `FONT_FAMILY` import). A first draft did re-export the
constant through `index.tsx`; it was reverted for exactly this. The two copies
are kept honest by `e2e/paste-position.spec.ts`, which derives its expected
coordinates from flow's constant and measures them against the fork's.

## The Preferences dialog now scrolls

Adding a fourth field group pushed the dialog past a 720px-tall viewport and put
the **Done button off-screen** — four e2e tests failed on an unclickable button
before anything about paste was even exercised. `.flow-prefs` is now
`max-height: calc(100dvh - 2rem)` + flex column, with `.flow-prefs__panel`
scrolling (`min-height: 0`, since a grid item's automatic minimum size would
otherwise stretch the row and leave nothing to scroll). `.flow-prefs__body`
keeps its explicit `min-height: 220px`, which is also what lets it shrink below
its content at all — an explicit min-height overrides the flex default `auto`.

Any future preference added to the General panel inherits this. The panel is now
a scroll container, so a popover that opens *downward* off a late field will be
clipped; the laser swatch already opens upward for the older `overflow: clip`
reason and is unaffected.

## Verification

Unit 1232/1232 (7 new in `src/lib/paste-position.test.ts`, 3 in
`preferences.test.ts`, 3 in `PreferencesDialog.test.tsx`), e2e 191/191 including
5 new in `e2e/paste-position.spec.ts`. The e2e copies via real `Ctrl+C` then
replays the payload through a synthetic `paste` ClipboardEvent — Chromium under
Playwright does not deliver clipboard contents to `Ctrl+V` (same workaround as
`drawing-defaults.spec.ts`).
