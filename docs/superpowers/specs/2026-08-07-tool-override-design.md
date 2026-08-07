# Illustrator-style tool override — design

**Date:** 2026-08-07
**Status:** approved, ready to plan

Hold Cmd (Ctrl on Windows/Linux) to suspend the active drawing tool and drop into the
selection tool for as long as the key is down. Release it and the drawing tool
comes back, with whatever you just selected still selected. Tools stop
auto-reverting to selection after each draw, and the "keep tool active" padlock
leaves the UI entirely.

## Problem

flow's tool model is Excalidraw's: pick a tool, draw one thing, and unless the
tool lock is on you are silently returned to the selection tool. Reaching the
selection tool deliberately means clicking the rail or pressing `V`, which
means losing your place in the tool you were using.

Illustrator solved this decades ago with a modal-tool workflow: the chosen tool
stays chosen, and the modifier key gives you a momentary selection tool for the
one click you need. flow already has both halves of the machinery lying around
unused:

1. **Tool lock exists but is off by default and buried in three UIs.** It lives
   in the rail (`src/ui/toolbar/ToolBar.tsx`, the `flow-toolbar__lock` block),
   the quick-actions bar (`src/ui/quickbar/actions.ts`, `LOCK_ID`), and
   View ▸ Tool Lock (`src/ui/menubar/MenuBar.tsx`), plus the native `Q`
   shortcut. Four surfaces for a boolean that, under a modal-tool workflow,
   only ever wants one value.
2. **Excalidraw already ships this exact override pattern.** Holding Space
   gives a temporary hand tool and releasing restores the previous one —
   `isHoldingSpace` at
   `vendor/excalidraw/packages/excalidraw/components/App.tsx:536`, restored in
   `onKeyUp` at `:4602`. The precedent is native; only the modifier and the
   target tool differ.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Where it lives | flow-level hook, zero fork edits | `setActiveTool` / `getAppState` / `updateScene` / `onChange` cover it, same surface [[vertical-toolbar]] and [[view-menu-toggles]] ride on |
| Modifier | `KEYS.CTRL_OR_CMD` semantics — Cmd on macOS, Ctrl elsewhere | Matches both Illustrator's per-platform binding and the vendor's own convention |
| Tool lock | Always on, all UI removed | A modal-tool workflow has no use for the off state; the override replaces "draw one then back to select" |
| How lock is forced | `onChange` normalizer | Catches `Q`, opened documents, and any future source in one place; swallowing `Q` at the window would eat the letter in the text editor |
| Selection on restore | Preserved | Cmd-hold exists to grab something and restyle it; dropping the selection defeats the purpose |
| Selection capture point | At **release**, read fresh | A snapshot taken at engage time would clobber an undo performed while the key was held |
| Cmd+key combos | Override stays engaged, combos pass through | Illustrator behaviour, and release-time capture makes it safe |
| User preference | None | YAGNI — this is the behaviour, not an option |

## Mechanism

A new hook, `src/ui/toolbar/useToolOverride.ts`, mounted once from
`src/App.tsx`. It owns three responsibilities.

### 1. Engage

One `window` keydown listener in **capture** phase — the same pattern as the
existing Ctrl/Cmd+F repoint at `src/App.tsx:153`. On the modifier going down:

- remember `getAppState().activeTool.type`
- `setActiveTool({ type: "selection", locked: true })`

The vendor preserves `selectedElementIds` when the target tool *is* selection
(`App.tsx:4758` — the reset branch is guarded on
`nextActiveTool.type !== "selection"`), and sets the cursor itself, so the
swap-in needs nothing further.

### 2. Restore

On the modifier going up, in order:

1. Read `selectedElementIds`, `selectedGroupIds`, `editingGroupId` **fresh**
   from `getAppState()`.
2. `setActiveTool({ type: remembered, locked: true })` — this gives the correct
   crosshair cursor, and clears the selection as a side effect.
3. `updateScene({ appState: { selectedElementIds, selectedGroupIds,
   editingGroupId } })` to put the selection back.

Two renders rather than one. The single-render alternative is a
`preserveSelection` flag on the vendor's `setActiveTool`, rejected because it
is an invasive edit inside `App.tsx`, the ~7k-line hot file the fork strategy
names explicitly.

### 3. Force the lock

Subscribe to `api.onChange`; if `activeTool.locked === false`, write it back
with `setActiveTool({ type: activeTool.type, locked: true })`. The write
converges — once locked, no further writes fire. `initialData.appState` also
seeds `activeTool: { type: "selection", locked: true }` so the first paint is
already correct rather than correcting itself a frame later.

### Un-sticking

`blur` and `visibilitychange` listeners run the restore path. Without them,
Cmd+Tab (or Cmd+Space on macOS) steals focus before the keyup arrives and the
override stays engaged forever.

## Suppression guards

Engage is skipped entirely when any of these hold. Each is a concrete failure,
not defensive padding.

| Guard | Why |
|---|---|
| `activeTool.type === "selection"` | Nothing to suspend |
| `activeTool.type === "image"` | Restoring re-fires `onImageAction` and re-opens the OS file picker (`App.tsx:4741`) |
| A pointer is down, or `newElement` / `multiElement` is live | The vendor reads Cmd mid-drag to bypass grid snap (`event[KEYS.CTRL_OR_CMD] ? null : this.getEffectiveGridSize()`, many sites) and to finish elbow arrows (`App.tsx:5918`); hijacking it mid-gesture breaks drawing |
| Text editing, or focus in a flow panel input | Reuse `isTextEntry` from `src/lib/history-shortcuts.ts` |

While engaged, a second engage is a no-op (keydown auto-repeats while a
modifier is held).

## Accepted consequences

1. **Cmd+drag with a shape tool no longer draws snap-free.** It selects
   instead. Cmd+drag with the selection tool is untouched, so snap-bypass
   survives where it is actually used.
2. **Cmd-hold + click always drills into groups.** The vendor's pointerdown
   treats Cmd/Ctrl+click as "drill down to hit element regardless of groups"
   (`App.tsx:6936`), so the override picks the element inside a group rather
   than the group. Defensible — Illustrator's Cmd is likewise "last-used
   selection tool", which is often Direct Selection — but it is a real
   behavioural difference from clicking the rail's selection tool.
3. **Every Cmd shortcut flaps the tool** through selection and back, costing
   two extra state updates per Cmd+key. Harmless given release-time selection
   capture.

## Removal: tool lock UI

| Surface | What goes |
|---|---|
| Tool rail | the `flow-toolbar__lock` block in `ToolBar.tsx`, `LOCK_ID` from `tools.ts`, its `TOOL_ICONS` glyph, its `ToolbarConfigMenu` row, `toggleLock` from `useActiveTool`, `.flow-toolbar__lock` CSS |
| Quick actions | the `LOCK_ID` item in `actions.ts`, the lock branch in `useQuickActions`, its icon in `icons.tsx` |
| View menu | the **Tool Lock** `CheckboxItem` in `MenuBar.tsx`, `toolLock` from `useViewToggles` |

**No storage migration.** A stale `"lock"` string left in a persisted
`hiddenTools` / `hiddenItems` array is simply never matched —
`normalizeToolbarState` keeps unknown strings
(`src/ui/toolbar/toolbar-state.ts:36`) and rendering is driven off `TOOLS`.

The native `Q` shortcut is not removed; it toggles the lock off and the
normalizer immediately puts it back, which is a no-op with one wasted render.

## Testing

Follows the repo's existing unit/e2e split — jsdom cannot do real modifier-held
pointer interaction, so the round-trip is proven in the browser.

**Unit** — `src/ui/toolbar/useToolOverride.test.tsx`, against a fake api with a
types-only vendor import (the `useActiveTool.test` pattern, so no `vi.mock`):

- engage sets selection and remembers the previous tool
- restore re-applies the previous tool and re-applies the selection read at
  release time, not at engage time
- each suppression guard, one test apiece
- blur and `visibilitychange` restore
- the lock normalizer flips `locked: false` back to `true` and then stops

Trim the lock assertions from `tools.test`, `ToolBar.test`,
`ToolbarConfigMenu.test`, `actions.test`, `useQuickActions.test`,
`MenuBar.test`, `useViewToggles.test`.

**e2e** — `e2e/tool-override.spec.ts`: pick the rectangle tool, hold the
modifier, click an existing shape, release, and poll `window.h.state` for both
the restored tool and the surviving selection. Also assert a drawn shape leaves
the tool active (lock forced on). Per the [[vertical-toolbar]] gotcha,
shortcuts are container-bound, so click `canvas.interactive` to focus before
any `keyboard` call. Remove the Tool-Lock case from `view-toggles.spec.ts`.

Two pre-existing e2e failures are unrelated to this work and stay red:
`menu-preferences.spec.ts` (About link text) and `quickbar.spec.ts`
(snap-to-objects default).

## Out of scope

- A preference to disable the override.
- Any second override key (Space already gives the temporary hand tool).
- Changing what the selection tool does under Cmd+click — the group-drill
  behaviour is inherited as-is.
