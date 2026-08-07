# Illustrator-style tool override — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hold Cmd (Ctrl on Windows/Linux) to suspend the active drawing tool and drop into the selection tool; release to restore the tool *and* the selection. Tool lock becomes permanently on and its three UI surfaces are removed.

**Architecture:** One pure logic module (`tool-override.ts`) plus one React hook (`useToolOverride.ts`) mounted from `src/App.tsx`. The hook attaches capture-phase `keydown`/`keyup` listeners on `window` and drives Excalidraw through the public `setActiveTool` / `getAppState` / `updateScene` / `onChange` API. A second effect in the same hook forces `activeTool.locked` to stay `true`. **Zero fork edits.**

**Tech Stack:** React 18 + TypeScript, Vitest + @testing-library/react (unit), Playwright (e2e), Excalidraw consumed as a `file:` dependency from `vendor/excalidraw`.

**Source spec:** `docs/superpowers/specs/2026-08-07-tool-override-design.md`

## Global Constraints

- **Zero fork edits.** Nothing under `vendor/excalidraw/` may be modified by this plan. Every interaction goes through `ExcalidrawAPI`.
- **No vendor value imports in `src/ui/toolbar/`.** Types only (`import type`), mirroring `useActiveTool.ts` — this is what keeps the unit tests free of `vi.mock`.
- **Modifier is platform-split, not "either key":** Cmd on macOS, Ctrl elsewhere. Mirrors the vendor's `CTRL_OR_CMD: isDarwin ? "metaKey" : "ctrlKey"` (`vendor/excalidraw/packages/excalidraw/keys.ts:38`). On macOS, Control is right-click emulation and must **not** engage the override.
- **Never call `setActiveTool({ type: "image" })` from this feature.** It re-fires `onImageAction` and re-opens the OS file picker (`vendor/excalidraw/packages/excalidraw/components/App.tsx:4741`).
- **Commit after every task.** Conventional commits (`feat:`, `refactor:`, `test:`, `docs:`).
- Validation commands: `npx vitest run <path>` (single file), `npm run typecheck`, `npx playwright test <path>`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/ui/toolbar/tool-override.ts` | CREATE | Pure logic: which key is the modifier, and whether the override may engage. No React, no vendor imports. |
| `src/ui/toolbar/tool-override.test.ts` | CREATE | Unit tests for the pure module. |
| `src/ui/toolbar/useToolOverride.ts` | CREATE | The hook: engage / restore / un-stick listeners, plus the forced-lock normalizer. |
| `src/ui/toolbar/useToolOverride.test.tsx` | CREATE | Unit tests for the hook against a fake api. |
| `src/App.tsx` | MODIFY | Mount the hook; seed `activeTool.locked: true` in `initialData`. |
| `e2e/tool-override.spec.ts` | CREATE | Browser proof of the full round-trip and of the forced lock. |
| `src/ui/toolbar/tools.ts` | MODIFY | Drop `LOCK_ID`. |
| `src/ui/toolbar/icons.tsx` | MODIFY | Drop the padlock glyph and the `LOCK_ID` key from `TOOL_ICONS`. |
| `src/ui/toolbar/ToolBar.tsx` | MODIFY | Drop the `flow-toolbar__lock` block. |
| `src/ui/toolbar/ToolbarConfigMenu.tsx` | MODIFY | Drop the "Lock" row. |
| `src/ui/toolbar/useActiveTool.ts` | MODIFY | Drop `locked` and `toggleLock`. |
| `src/ui/toolbar/toolbar.css` | MODIFY | Drop `.flow-toolbar__lock`. |
| `src/ui/quickbar/actions.ts` | MODIFY | Drop the `LOCK_ID` item and constant. |
| `src/ui/quickbar/icons.tsx` | MODIFY | Drop the `LOCK_ID` icon entry. |
| `src/ui/quickbar/useQuickActions.ts` | MODIFY | Drop the lock branch. |
| `src/ui/menubar/useViewToggles.ts` | MODIFY | Drop `toolLock`. |
| `src/ui/menubar/MenuBar.tsx` | MODIFY | Drop the Tool Lock `CheckboxItem`. |
| Six existing test files + `e2e/view-toggles.spec.ts` | MODIFY | Drop lock assertions. |
| `.claude/memory/tool-override.md` + `MEMORY.md` | CREATE / MODIFY | Repo-local memory per `CLAUDE.md`. |

---

### Task 1: Pure override logic

The decision of *whether* to engage is pure and has five branches, so it lives outside React where it can be tested directly.

**Files:**
- Create: `src/ui/toolbar/tool-override.ts`
- Test: `src/ui/toolbar/tool-override.test.ts`

**Interfaces:**
- Consumes: `isTextEntry` from `src/lib/history-shortcuts.ts` (existing).
- Produces:
  - `overrideKeyFor(platform: string): "Meta" | "Control"`
  - `interface OverrideState { activeTool: { type: string }; cursorButton?: "up" | "down"; newElement?: unknown; multiElement?: unknown; editingTextElement?: unknown }`
  - `canEngage(state: OverrideState | undefined, target: EventTarget | null): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/ui/toolbar/tool-override.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { overrideKeyFor, canEngage, type OverrideState } from "./tool-override";

/** A state where the override is allowed to engage; each test spoils one field. */
const READY: OverrideState = {
  activeTool: { type: "rectangle" },
  cursorButton: "up",
  newElement: null,
  multiElement: null,
  editingTextElement: null,
};

describe("overrideKeyFor", () => {
  it("uses Meta on Apple platforms", () => {
    expect(overrideKeyFor("MacIntel")).toBe("Meta");
    expect(overrideKeyFor("iPhone")).toBe("Meta");
  });

  it("uses Control everywhere else", () => {
    expect(overrideKeyFor("Win32")).toBe("Control");
    expect(overrideKeyFor("Linux x86_64")).toBe("Control");
    expect(overrideKeyFor("")).toBe("Control");
  });
});

describe("canEngage", () => {
  it("engages for a drawing tool with an idle canvas", () => {
    expect(canEngage(READY, null)).toBe(true);
  });

  it("does not engage when there is no state yet", () => {
    expect(canEngage(undefined, null)).toBe(false);
  });

  it("does not engage when the selection tool is already active", () => {
    expect(canEngage({ ...READY, activeTool: { type: "selection" } }, null)).toBe(false);
  });

  it("does not engage from the image tool, whose restore would reopen the file picker", () => {
    expect(canEngage({ ...READY, activeTool: { type: "image" } }, null)).toBe(false);
  });

  it("does not engage while a pointer is down", () => {
    expect(canEngage({ ...READY, cursorButton: "down" }, null)).toBe(false);
  });

  it("does not engage while an element is being drawn", () => {
    expect(canEngage({ ...READY, newElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage during a multi-point line", () => {
    expect(canEngage({ ...READY, multiElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage while a text element is being edited", () => {
    expect(canEngage({ ...READY, editingTextElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage when the key landed in a text field", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(canEngage(READY, input)).toBe(false);
  });

  it("still engages when the key landed on a non-text element", () => {
    expect(canEngage(READY, document.createElement("div"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/toolbar/tool-override.test.ts`
Expected: FAIL — `Failed to resolve import "./tool-override"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/toolbar/tool-override.ts`:

```ts
/** Pure logic behind the temporary-selection override. Kept free of React and
 *  of vendor imports so it can be tested directly (mirrors toolbar-state.ts). */
import { isTextEntry } from "../../lib/history-shortcuts";

/**
 * Which `KeyboardEvent.key` engages the override on a given platform: Cmd on
 * Apple hardware, Ctrl everywhere else. Mirrors the vendor's own
 * `CTRL_OR_CMD: isDarwin ? "metaKey" : "ctrlKey"`
 * (`vendor/excalidraw/packages/excalidraw/keys.ts:38`), including its
 * `navigator.platform` test (`constants.ts:5`).
 *
 * Deliberately NOT "Meta or Control": on macOS, Control is right-click
 * emulation, and engaging on it would suspend the tool every time the user
 * context-clicks.
 */
export function overrideKeyFor(platform: string): "Meta" | "Control" {
  return /Mac|iPod|iPhone|iPad/.test(platform) ? "Meta" : "Control";
}

/** The slice of Excalidraw's appState the engage decision reads. Structural on
 *  purpose — no vendor import, and the test can build one by hand. */
export interface OverrideState {
  activeTool: { type: string };
  cursorButton?: "up" | "down";
  newElement?: unknown;
  multiElement?: unknown;
  editingTextElement?: unknown;
}

/**
 * Whether holding the modifier should suspend the current tool. Every `false`
 * branch prevents a concrete failure, not a hypothetical one:
 *
 * - `selection` — nothing to suspend.
 * - `image` — the restore would call `setActiveTool({type:"image"})`, which
 *   re-fires `onImageAction` and re-opens the OS file picker (vendor
 *   `App.tsx:4741`).
 * - pointer down / `newElement` / `multiElement` — the vendor reads Cmd
 *   mid-drag to bypass grid snapping and to close elbow arrows; stealing the
 *   tool mid-gesture would break drawing outright.
 * - text editing, or a key aimed at a text field — the modifier belongs to
 *   whatever the user is typing into.
 */
export function canEngage(
  state: OverrideState | undefined,
  target: EventTarget | null,
): boolean {
  if (!state) return false;
  const type = state.activeTool.type;
  if (type === "selection" || type === "image") return false;
  if (state.cursorButton === "down") return false;
  if (state.newElement || state.multiElement || state.editingTextElement) return false;
  if (isTextEntry(target)) return false;
  return true;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/toolbar/tool-override.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/tool-override.ts src/ui/toolbar/tool-override.test.ts
git commit -m "feat(toolbar): pure engage logic for the tool override"
```

---

### Task 2: The override hook — engage, restore, un-stick

**Files:**
- Create: `src/ui/toolbar/useToolOverride.ts`
- Test: `src/ui/toolbar/useToolOverride.test.tsx`

**Interfaces:**
- Consumes: `overrideKeyFor`, `canEngage`, `OverrideState` from Task 1; `ExcalidrawAPI` from `src/lib/excalidraw-scene.ts`.
- Produces: `useToolOverride(api: ExcalidrawAPI | null): void`

The forced-lock normalizer is Task 3 and lands in this same file.

- [ ] **Step 1: Write the failing test**

Create `src/ui/toolbar/useToolOverride.test.tsx`. Note the fake api mirrors `useActiveTool.test.tsx` — a plain object cast through `unknown`, so no `vi.mock` and no vendor value import. Tests run in jsdom, where `navigator.platform` is `""`, so the modifier is `Control`.

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useToolOverride } from "./useToolOverride";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

/** Mutable appState behind the fake api, so a test can model the canvas
 *  changing between engage and restore (an undo landing mid-hold). */
function fakeApi(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    activeTool: { type: "rectangle", locked: true },
    cursorButton: "up",
    newElement: null,
    multiElement: null,
    editingTextElement: null,
    selectedElementIds: {},
    selectedGroupIds: {},
    editingGroupId: null,
    ...overrides,
  };
  const api = {
    getAppState: () => state,
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
  return { api, state };
}

/** jsdom's navigator.platform is "", so Control is the modifier here. */
const press = () =>
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", bubbles: true }));
const release = () =>
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "Control", bubbles: true }));

describe("useToolOverride", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suspends the drawing tool for the selection tool while held", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "selection", locked: true });
  });

  it("restores the suspended tool on release", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    release();
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("re-applies the selection read at release time, not at engage time", () => {
    const { api, state } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    // Stand-in for anything that changes the selection mid-hold: a Cmd-click,
    // or a Cmd+Z whose undo restores a different selection.
    state.selectedElementIds = { box: true };
    state.selectedGroupIds = { g1: true };
    state.editingGroupId = "g1";
    release();
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: {
        selectedElementIds: { box: true },
        selectedGroupIds: { g1: true },
        editingGroupId: "g1",
      },
    });
  });

  it("restores the tool before re-applying the selection", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    release();
    // setActiveTool clears the selection for any non-selection tool
    // (vendor App.tsx:4758), so the re-apply MUST come second.
    const toolCall = (api.setActiveTool as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
    const sceneCall = (api.updateScene as ReturnType<typeof vi.fn>).mock.invocationCallOrder.at(-1)!;
    expect(toolCall).toBeLessThan(sceneCall);
  });

  it("ignores the auto-repeat while the key is held down", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    press();
    press();
    expect(api.setActiveTool).toHaveBeenCalledTimes(1);
  });

  it("does nothing on release when it never engaged", () => {
    const { api } = fakeApi({ activeTool: { type: "selection", locked: true } });
    renderHook(() => useToolOverride(api));
    press();
    release();
    expect(api.setActiveTool).not.toHaveBeenCalled();
    expect(api.updateScene).not.toHaveBeenCalled();
  });

  it("ignores a key that is not the platform modifier", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Meta", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Shift", bubbles: true }));
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("does not engage while a pointer is down", () => {
    const { api } = fakeApi({ cursorButton: "down" });
    renderHook(() => useToolOverride(api));
    press();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("restores on window blur, since Cmd+Tab never delivers the keyup", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    window.dispatchEvent(new Event("blur"));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("restores when the tab is hidden", () => {
    const { api } = fakeApi();
    renderHook(() => useToolOverride(api));
    press();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(api.setActiveTool).toHaveBeenLastCalledWith({ type: "rectangle", locked: true });
  });

  it("detaches its listeners on unmount", () => {
    const { api } = fakeApi();
    const { unmount } = renderHook(() => useToolOverride(api));
    unmount();
    press();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("is inert until the api exists", () => {
    renderHook(() => useToolOverride(null));
    expect(() => press()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/toolbar/useToolOverride.test.tsx`
Expected: FAIL — `Failed to resolve import "./useToolOverride"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/toolbar/useToolOverride.ts`:

```ts
import { useEffect, useRef } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { canEngage, overrideKeyFor, type OverrideState } from "./tool-override";

/** `setActiveTool` takes a discriminated union keyed on `type`; our string is a
 *  subset of it, so cast at this single boundary (mirrors useActiveTool). */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

/**
 * Illustrator-style temporary tool override: hold Cmd (Ctrl off Apple
 * hardware) to suspend the active drawing tool and work with the selection
 * tool, release to get the drawing tool back with the selection intact.
 *
 * Mirrors Excalidraw's own Space-for-hand override (`isHoldingSpace`, vendor
 * `App.tsx:536`, restored in `onKeyUp` at `:4602`) but drives it entirely from
 * flow through the public API — no fork edits.
 *
 * Listeners are capture-phase on `window`, the same placement as App's
 * Ctrl/Cmd+F repoint, so the decision is made before Excalidraw's own
 * container-bound handler sees the key.
 */
export function useToolOverride(api: ExcalidrawAPI | null): void {
  // The tool a held modifier is currently suspending, or null when idle. A ref
  // rather than state: nothing renders off it, and keyup must read what keydown
  // wrote without waiting for a re-render.
  const suspended = useRef<string | null>(null);

  useEffect(() => {
    if (!api) return;
    const overrideKey = overrideKeyFor(navigator.platform);

    const restore = () => {
      const type = suspended.current;
      if (!type) return;
      suspended.current = null;
      // Read the selection FRESH. A snapshot taken at engage time would clobber
      // anything that changed during the hold — most sharply a Cmd+Z, whose
      // undo restores its own selection.
      const { selectedElementIds, selectedGroupIds, editingGroupId } = api.getAppState();
      // Restores the tool's own cursor, but clears the selection on the way:
      // the vendor resets it for every non-selection tool (App.tsx:4758) ...
      api.setActiveTool({ type, locked: true } as SetToolArg);
      // ... so put it back. Omitting `elements` leaves the scene alone — the
      // vendor guards the replace on `if (sceneData.elements)` (App.tsx:3972).
      api.updateScene({
        appState: { selectedElementIds, selectedGroupIds, editingGroupId },
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== overrideKey) return;
      // A held modifier auto-repeats keydown; only the first one engages.
      if (suspended.current) return;
      const state = api.getAppState() as unknown as OverrideState;
      if (!canEngage(state, e.target)) return;
      suspended.current = state.activeTool.type;
      // Switching TO selection preserves the selection (vendor App.tsx:4758
      // guards its reset on the target not being selection) and sets the
      // cursor, so the swap-in needs nothing further.
      api.setActiveTool({ type: "selection", locked: true } as SetToolArg);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === overrideKey) restore();
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    // Cmd+Tab and Cmd+Space steal focus before the keyup lands. Without these
    // the override would stay engaged until the next modifier press.
    window.addEventListener("blur", restore);
    document.addEventListener("visibilitychange", restore);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", restore);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [api]);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/toolbar/useToolOverride.test.tsx`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean). If `updateScene` rejects the partial appState, add the same cast the neighbouring `App.tsx` calls use: `as Parameters<ExcalidrawAPI["updateScene"]>[0]`.

- [ ] **Step 6: Commit**

```bash
git add src/ui/toolbar/useToolOverride.ts src/ui/toolbar/useToolOverride.test.tsx
git commit -m "feat(toolbar): hold Cmd/Ctrl for a temporary selection tool"
```

---

### Task 3: Force the tool lock permanently on

flow becomes a modal-tool app: the chosen tool stays chosen. A second effect in the same hook re-asserts `locked: true` whenever anything turns it off — the native `Q` shortcut, an opened document, anything future.

**Files:**
- Modify: `src/ui/toolbar/useToolOverride.ts`
- Test: `src/ui/toolbar/useToolOverride.test.tsx`

**Interfaces:**
- Consumes: everything from Task 2. No new exports — `useToolOverride`'s signature is unchanged.

- [ ] **Step 1: Write the failing test**

The existing `fakeApi` helper has a stub `onChange`. Replace that helper's `onChange` line so tests can fire a change, then append the new describe block. In `src/ui/toolbar/useToolOverride.test.tsx`, change:

```tsx
    onChange: () => () => {},
```

to:

```tsx
    onChange: (cb: () => void) => {
      listeners.push(cb);
      return () => {};
    },
```

and add `const listeners: Array<() => void> = [];` just above `const api = {`, plus return it: change `return { api, state };` to `return { api, state, emit: () => listeners.forEach((cb) => cb()) };`.

Then append this block to the end of the file:

```tsx
describe("useToolOverride — forced tool lock", () => {
  beforeEach(() => vi.clearAllMocks());

  it("locks an unlocked tool as soon as it mounts", () => {
    const { api } = fakeApi({ activeTool: { type: "rectangle", locked: false } });
    renderHook(() => useToolOverride(api));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "rectangle", locked: true });
  });

  it("re-locks when something unlocks the tool, such as the native Q shortcut", () => {
    const { api, state, emit } = fakeApi();
    renderHook(() => useToolOverride(api));
    state.activeTool = { type: "ellipse", locked: false };
    emit();
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "ellipse", locked: true });
  });

  it("writes nothing while the tool is already locked, so it converges", () => {
    const { api, emit } = fakeApi();
    renderHook(() => useToolOverride(api));
    emit();
    emit();
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });

  it("never re-asserts the lock on the image tool, which would reopen the file picker", () => {
    const { api } = fakeApi({ activeTool: { type: "image", locked: false } });
    renderHook(() => useToolOverride(api));
    expect(api.setActiveTool).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/toolbar/useToolOverride.test.tsx`
Expected: FAIL — the four new tests fail (`setActiveTool` never called for the first two).

- [ ] **Step 3: Write the implementation**

Append a second effect inside `useToolOverride` in `src/ui/toolbar/useToolOverride.ts`, immediately after the existing one:

```ts
  // flow is a modal-tool app — the chosen tool stays chosen, and the override
  // above is how you reach selection transiently. So `locked` has exactly one
  // correct value and this effect re-asserts it against every source: the
  // native `Q` shortcut, an opened document's appState, anything future.
  //
  // Chosen over swallowing `Q` at the window, which would also eat the letter
  // in Excalidraw's text editor.
  useEffect(() => {
    if (!api) return;
    const enforce = () => {
      const { type, locked } = api.getAppState().activeTool;
      // Converges: once locked, no further writes, so this cannot loop.
      if (locked) return;
      // Re-activating the image tool re-opens the OS file picker
      // (vendor App.tsx:4741). An unlocked image tool is left alone.
      if (type === "image") return;
      api.setActiveTool({ type, locked: true } as SetToolArg);
    };
    // Run once up front: the api can be handed over already unlocked, and the
    // first `onChange` may be many interactions away.
    enforce();
    return api.onChange(enforce);
  }, [api]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/toolbar/useToolOverride.test.tsx`
Expected: PASS, 16 tests.

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/useToolOverride.ts src/ui/toolbar/useToolOverride.test.tsx
git commit -m "feat(toolbar): keep the active tool permanently locked"
```

---

### Task 4: Wire into the app + prove it in a browser

jsdom cannot do a modifier-held pointer interaction against a real canvas, so the round-trip is proven in Playwright — the same unit/e2e split [[vertical-toolbar]] uses for drag/dock.

**Files:**
- Modify: `src/App.tsx`
- Create: `e2e/tool-override.spec.ts`

**Interfaces:**
- Consumes: `useToolOverride` from Task 3.

- [ ] **Step 1: Mount the hook**

In `src/App.tsx`, add the import alongside the other toolbar imports:

```tsx
import { useToolOverride } from "./ui/toolbar/useToolOverride";
```

and call it in the component body, directly after the `bindingMode` block (any position among the hooks works; keep it with the other api-driven hooks):

```tsx
  // Illustrator-style Cmd/Ctrl-hold override + the permanently-on tool lock.
  useToolOverride(excalidrawApi);
```

- [ ] **Step 2: Seed the lock in initialData**

In `src/App.tsx`, inside the `initialData.appState` object, add after `currentItemRoundness: "sharp",`:

```tsx
              // flow is a modal-tool app: the chosen tool stays chosen and
              // Cmd/Ctrl-hold gives a momentary selection tool. Seed the lock
              // on so the first tool use is already sticky — useToolOverride's
              // normalizer would otherwise correct it a frame later. Shape
              // matches the vendor default (appState.ts:59). Native field.
              activeTool: {
                type: "selection",
                customType: null,
                locked: true,
                lastActiveTool: null,
              },
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: no output (clean).

- [ ] **Step 4: Write the e2e spec**

Create `e2e/tool-override.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

/**
 * The canvas region clear of the tool rail (left) and the docked controls panel
 * (right), matching e2e/style-memory.spec.ts's footprints.
 */
const BOX = [520, 300, 640, 380] as const;
/**
 * A point on BOX's left edge. A plain rectangle has a transparent background,
 * and Excalidraw only hit-tests the outline of a transparent-fill shape — a
 * click at the centre silently misses. Same note as style-memory.spec.ts.
 */
const BOX_EDGE = [520, 340] as const;

type H = {
  state?: {
    activeTool?: { type?: string; locked?: boolean };
    selectedElementIds?: Record<string, boolean>;
  };
};
const readState = (page: Page) =>
  page.evaluate(() => (window as unknown as { h?: H }).h?.state ?? null);

const selectedCount = async (page: Page) =>
  Object.keys((await readState(page))?.selectedElementIds ?? {}).length;

async function pickTool(page: Page, name: string) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name, exact: true })
    .click();
}

async function drawBox(page: Page) {
  await pickTool(page, "Rectangle");
  await page.mouse.move(BOX[0], BOX[1]);
  await page.mouse.down();
  await page.mouse.move(BOX[2], BOX[3], { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();
});

test("the tool lock is on from the first paint", async ({ page }) => {
  expect((await readState(page))?.activeTool?.locked).toBe(true);
});

test("a drawing tool stays active after drawing", async ({ page }) => {
  await drawBox(page);
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
});

test("holding the modifier suspends the tool and releasing restores it", async ({ page }) => {
  await drawBox(page);
  // Shortcuts are container-bound (handleKeyboardGlobally is off), so focus the
  // canvas before any keyboard call — see [[vertical-toolbar]].
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await pickTool(page, "Rectangle");

  await page.keyboard.down("ControlOrMeta");
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("selection");

  await page.keyboard.up("ControlOrMeta");
  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
});

test("a selection made while the modifier is held survives the release", async ({ page }) => {
  await drawBox(page);
  await pickTool(page, "Rectangle");
  // Clear the post-draw selection so the assertion can only pass via the
  // Cmd-held click below.
  await page.mouse.click(900, 600);
  expect(await selectedCount(page)).toBe(0);

  await page.keyboard.down("ControlOrMeta");
  await page.mouse.click(BOX_EDGE[0], BOX_EDGE[1]);
  await expect.poll(() => selectedCount(page)).toBe(1);
  await page.keyboard.up("ControlOrMeta");

  await expect.poll(async () => (await readState(page))?.activeTool?.type).toBe("rectangle");
  expect(await selectedCount(page)).toBe(1);
});

test("the modifier does nothing when the selection tool is already active", async ({ page }) => {
  await page.locator("canvas.interactive").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.down("ControlOrMeta");
  expect((await readState(page))?.activeTool?.type).toBe("selection");
  await page.keyboard.up("ControlOrMeta");
  expect((await readState(page))?.activeTool?.type).toBe("selection");
});
```

- [ ] **Step 5: Run the e2e spec**

Run: `npx playwright test e2e/tool-override.spec.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx e2e/tool-override.spec.ts
git commit -m "feat: mount the tool override and seed the tool lock on"
```

---

### Task 5: Remove the rail's padlock

**Files:**
- Modify: `src/ui/toolbar/tools.ts`, `src/ui/toolbar/icons.tsx`, `src/ui/toolbar/ToolBar.tsx`, `src/ui/toolbar/ToolbarConfigMenu.tsx`, `src/ui/toolbar/useActiveTool.ts`, `src/ui/toolbar/toolbar.css`
- Test: `src/ui/toolbar/tools.test.ts`, `src/ui/toolbar/icons.test.tsx`, `src/ui/toolbar/ToolBar.test.tsx`, `src/ui/toolbar/ToolbarConfigMenu.test.tsx`, `src/ui/toolbar/useActiveTool.test.tsx`

**Interfaces:**
- Produces: `ActiveTool` loses `locked` and `toggleLock`; `TOOL_ICONS` narrows to `Record<ToolId, ReactNode>`; `LOCK_ID` no longer exported from `tools.ts`.

No storage migration: a stale `"lock"` string in a persisted `hiddenTools` array is simply never matched — `normalizeToolbarState` keeps unknown strings (`src/ui/toolbar/toolbar-state.ts:36`) and rendering is driven off `TOOLS`.

- [ ] **Step 1: Delete the lock assertions from the tests**

In `src/ui/toolbar/tools.test.ts`, delete this test and drop `LOCK_ID` from the file's import of `./tools`:

```ts
  it("exposes the lock id constant", () => {
    expect(LOCK_ID).toBe("lock");
  });
```

In `src/ui/toolbar/icons.test.tsx`, replace the whole body so it no longer references `LOCK_ID`:

```tsx
import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { TOOL_ICONS } from "./icons";
import { TOOLS } from "./tools";

describe("TOOL_ICONS", () => {
  it("has a React element icon for every tool", () => {
    for (const t of TOOLS) {
      expect(isValidElement(TOOL_ICONS[t.id])).toBe(true);
    }
  });
});
```

In `src/ui/toolbar/ToolBar.test.tsx`, replace this test:

```tsx
  it("renders a button for every visible tool plus lock", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep tool active" })).toBeInTheDocument();
  });
```

with:

```tsx
  it("renders a button for every visible tool", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep tool active" })).toBeNull();
  });
```

In `src/ui/toolbar/ToolbarConfigMenu.test.tsx`, replace this test:

```tsx
  it("renders a checked row per visible tool and Lock", () => {
    render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("checkbox", { name: "Rectangle" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Lock" })).toBeChecked();
  });
```

with:

```tsx
  it("renders a checked row per visible tool", () => {
    render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("checkbox", { name: "Rectangle" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Lock" })).toBeNull();
  });
```

In `src/ui/toolbar/useActiveTool.test.tsx`, delete this test:

```tsx
  it("toggleLock flips the lock flag on the current tool", () => {
    const api = fakeApi({ type: "arrow", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.toggleLock());
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });
```

and delete the two `expect(result.current.locked)` lines from the "reads the active tool type and lock flag" / "defaults to selection/unlocked when api is null" tests, renaming the first to `"reads the active tool type"` and the second to `"defaults to selection when api is null"`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/toolbar/`
Expected: FAIL — `ToolBar.test.tsx` and `ToolbarConfigMenu.test.tsx` still find the lock button/row; `useActiveTool.test.tsx` may pass already (deletions only).

- [ ] **Step 3: Remove the implementation**

In `src/ui/toolbar/tools.ts`, delete the trailing block:

```ts
/** Membership key for the lock toggle within `hiddenTools` (lock is not a
 *  drawing tool, so it is not part of `ToolId`). */
export const LOCK_ID = "lock";
```

In `src/ui/toolbar/icons.tsx`: drop `LOCK_ID` from the `./tools` import, change the type annotation to `Record<ToolId, ReactNode>`, change the doc comment `/** Inline SVG icon per tool (+ lock). ... */` to `/** Inline SVG icon per tool. ... */`, and delete the final entry:

```tsx
  [LOCK_ID]: (
    <Svg>
      <rect x="5" y="9" width="10" height="7" rx="1" />
      <path d="M7 9V7a3 3 0 016 0v2" />
    </Svg>
  ),
```

In `src/ui/toolbar/ToolBar.tsx`: change the import to `import { TOOLS } from "./tools";`, change the destructure to `const { activeType, arrowType, setTool } = useActiveTool(api);`, and delete the block:

```tsx
      {!state.hiddenTools.includes(LOCK_ID) && (
        <div className="flow-toolbar__lock">
          <ToolButton
            icon={TOOL_ICONS[LOCK_ID]}
            label="Keep tool active"
            active={locked}
            onClick={toggleLock}
          />
        </div>
      )}
```

In `src/ui/toolbar/ToolbarConfigMenu.tsx`: change the import to `import { TOOLS } from "./tools";` and replace the `rows` line:

```tsx
  const rows = [...TOOLS.map((t) => ({ id: t.id as string, label: t.label })), { id: LOCK_ID, label: "Lock" }];
```

with:

```tsx
  const rows = TOOLS.map((t) => ({ id: t.id as string, label: t.label }));
```

In `src/ui/toolbar/useActiveTool.ts`: delete the `locked` field and its doc comment from `ActiveTool`, delete the `toggleLock` field and its doc comment, delete `const locked = at?.locked ?? false;`, delete the `toggleLock` implementation, and change the return to `return { activeType, arrowType, setTool };`.

In `src/ui/toolbar/toolbar.css`, delete:

```css
/* Lock row: pinned above the tool column. Framed by the topbar's bottom border
   (separator above) and its own bottom border (separator below). */
.flow-toolbar__lock {
  display: flex;
  justify-content: center;
  width: 100%;
  padding: 4px 0;
  border-bottom: 1px solid var(--flow-border);
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/ui/toolbar/ && npm run typecheck`
Expected: all toolbar tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/
git commit -m "refactor(toolbar): drop the tool-lock padlock from the rail"
```

---

### Task 6: Remove the quick-actions lock toggle

**Files:**
- Modify: `src/ui/quickbar/actions.ts`, `src/ui/quickbar/icons.tsx`, `src/ui/quickbar/useQuickActions.ts`
- Test: `src/ui/quickbar/actions.test.ts`, `src/ui/quickbar/useQuickActions.test.tsx`

**Interfaces:**
- Produces: `LOCK_ID` no longer exported from `src/ui/quickbar/actions.ts`; `BINDING_ID` stays.

- [ ] **Step 1: Update the tests**

In `src/ui/quickbar/actions.test.ts`, the test at line 34 asserts both special toggles. Open it, drop `LOCK_ID` from the `./actions` import, and rewrite it to cover only the binding toggle:

```ts
  it("marks the arrow-binding toggle without an actionName", () => {
    expect(quickItem(BINDING_ID)?.actionName).toBeUndefined();
    expect(quickItem(BINDING_ID)?.kind).toBe("toggle");
  });

  it("no longer registers a tool-lock item", () => {
    expect(quickItem("lock")).toBeUndefined();
  });
```

In `src/ui/quickbar/useQuickActions.test.tsx`, delete the test starting at line 46:

```tsx
  it("reflects and toggles the tool lock via setActiveTool", () => {
```

(delete the whole `it(...)` block through its closing `});`) and drop `LOCK_ID` from its `./actions` import if present.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/quickbar/`
Expected: FAIL — `quickItem("lock")` still resolves to an item.

- [ ] **Step 3: Remove the implementation**

In `src/ui/quickbar/actions.ts`:
- Change the constants block to drop `LOCK_ID`:

```ts
/** Membership id for the specially-handled arrow-binding toggle. */
export const BINDING_ID = "binding";
```

- Delete this line from `QUICK_ITEMS`:

```ts
  { id: LOCK_ID, label: "Tool lock", kind: "toggle", group: "toggle", shortcut: "Q" },
```

- Update the `actionName` doc comment on the `QuickItem` interface, replacing `Absent for tool-lock and arrow-binding (handled specially)` with `Absent for arrow-binding (handled specially)`.

In `src/ui/quickbar/icons.tsx`, drop `LOCK_ID` from the `./actions` import and delete the entry below. **Keep** the `TOOL_ICONS` import — it is still used by the fallback at `src/ui/quickbar/icons.tsx:148` (`ACTION_ICONS[id] ?? (TOOL_ICONS as Record<string, ReactNode>)[id]`), which keeps working against the narrowed `Record<ToolId, ReactNode>` type because of that cast.

```tsx
  // Tool lock: reuse the rail's padlock glyph.
  [LOCK_ID]: TOOL_ICONS[LOCK_ID],
```

In `src/ui/quickbar/useQuickActions.ts`:
- Change the import to `import { type QuickItem, BINDING_ID } from "./actions";`
- Delete `const locked = appState?.activeTool?.locked ?? false;`
- Delete `if (item.id === LOCK_ID) return locked;` from `isActive`
- Delete this branch from `trigger`:

```ts
    if (item.id === LOCK_ID) {
      api.setActiveTool({ type: activeToolType, locked: !locked } as SetToolArg);
      return;
    }
```

- Update the hook's doc comment: replace `the arrow-binding lock is flow-owned` sentence's surrounding context only if it mentions tool lock; it currently does not, so leave it.

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run src/ui/quickbar/ && npm run typecheck`
Expected: all quickbar tests PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/quickbar/
git commit -m "refactor(quickbar): drop the tool-lock toggle"
```

---

### Task 7: Remove View ▸ Tool Lock

**Files:**
- Modify: `src/ui/menubar/useViewToggles.ts`, `src/ui/menubar/MenuBar.tsx`
- Test: `src/ui/menubar/useViewToggles.test.ts`, `src/ui/menubar/MenuBar.test.tsx`, `e2e/view-toggles.spec.ts`

**Interfaces:**
- Produces: `ViewToggles` loses `toolLock`; remaining keys are `grid`, `objectsSnap`, `zenMode`.

- [ ] **Step 1: Update the tests**

In `src/ui/menubar/useViewToggles.test.ts`, delete every `toolLock` assertion — the `expect(result.current.toolLock.checked)` lines (around 30 and 54), and the whole test `"toggles the tool lock via setActiveTool with the flipped locked flag"` (around line 44, through its closing `});`).

In `src/ui/menubar/MenuBar.test.tsx`:
- At line 153, drop `"Tool Lock"` from the array so it reads:

```tsx
    for (const name of ["Grid", "Snap to Objects", "Arrow Binding", "Zen Mode"]) {
```

- Delete the whole test starting at line 193, `it("flips the tool lock via setActiveTool when Tool Lock is clicked", ...)`, through its closing `});`.
- Add a test asserting the item is gone, next to the remaining View-menu tests:

```tsx
  it("no longer offers a Tool Lock item", async () => {
    const user = userEvent.setup();
    render(<MenuBar {...baseProps} api={fakeApi()} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    expect(screen.queryByRole("menuitemcheckbox", { name: "Tool Lock" })).toBeNull();
  });
```

Match `baseProps` / `fakeApi` to whatever the surrounding tests in that file already use — read the neighbouring test at line 193 before deleting it and copy its setup lines.

In `e2e/view-toggles.spec.ts`, delete this test and simplify the `H` type's `activeTool` member (it exists only for this test):

```ts
test("Tool Lock toggle flips activeTool.locked", async ({ page }) => {
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(false);
  await clickViewToggle(page, "Tool Lock");
  await expect.poll(async () => (await readState(page))?.activeTool?.locked).toBe(true);
});
```

The type line becomes:

```ts
type H = { state?: Record<string, unknown> };
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/menubar/`
Expected: FAIL — the new "no longer offers a Tool Lock item" test finds the checkbox.

- [ ] **Step 3: Remove the implementation**

In `src/ui/menubar/useViewToggles.ts`:
- Delete `toolLock: ViewToggle;` from the `ViewToggles` interface
- Delete `const activeType = appState?.activeTool?.type ?? "selection";` and `const locked = appState?.activeTool?.locked ?? false;`
- Delete the whole `toolLock: { ... },` entry from the returned object
- Delete the now-unused `SetToolArg` type alias and its doc comment

In `src/ui/menubar/MenuBar.tsx`, delete the `CheckboxItem` block at lines 227-234 (the one whose body is `Tool Lock`).

- [ ] **Step 4: Run the tests, typecheck, and the e2e spec**

Run: `npx vitest run src/ui/menubar/ && npm run typecheck`
Expected: menubar tests PASS; typecheck clean.

Run: `npx playwright test e2e/view-toggles.spec.ts`
Expected: PASS, 4 tests (was 5).

- [ ] **Step 5: Commit**

```bash
git add src/ui/menubar/ e2e/view-toggles.spec.ts
git commit -m "refactor(menubar): drop View > Tool Lock"
```

---

### Task 8: Full verification and repo-local memory

`CLAUDE.md` requires substantial sessions to leave a memory file in `.claude/memory/` with a one-line pointer in `MEMORY.md`.

**Files:**
- Create: `.claude/memory/tool-override.md`
- Modify: `.claude/memory/MEMORY.md`

- [ ] **Step 1: Run the whole unit suite**

Run: `npx vitest run`
Expected: all files PASS. The suite was 377 tests / 51 files as of [[view-menu-toggles]] and has grown since; the number matters less than there being **zero failures**.

- [ ] **Step 2: Run the whole e2e suite**

Run: `npx playwright test`
Expected: PASS except two **pre-existing, unrelated** failures that this work does not touch and must not be "fixed" here:
1. `e2e/menu-preferences.spec.ts` "Help ▸ About shows both repo links" — broke in commit `06e568e`.
2. `e2e/quickbar.spec.ts` "toggling snap-to-objects reflects the active state and persists" — broke in commit `41df312`.

If any *other* e2e test fails, it is a regression from this work — fix it before continuing.

- [ ] **Step 3: Write the memory file**

Create `.claude/memory/tool-override.md`:

```markdown
# Tool override (hold Cmd/Ctrl for selection)

Illustrator-style temporary tool override plus a permanently-on tool lock.
Spec/plan: `docs/superpowers/{specs,plans}/2026-08-07-tool-override*.md`.

## Shipped
- `src/ui/toolbar/tool-override.ts` — pure: `overrideKeyFor(platform)` (Meta on
  Apple, Control elsewhere — mirrors the vendor's `KEYS.CTRL_OR_CMD`, and is
  deliberately NOT "either key" because macOS Control is right-click emulation)
  and `canEngage(state, target)`.
- `src/ui/toolbar/useToolOverride.ts` — two effects: (1) capture-phase
  keydown/keyup on `window` + blur/visibilitychange, engaging the selection
  tool and restoring on release; (2) an `onChange` normalizer re-asserting
  `activeTool.locked === true`. Mounted from `App.tsx`; `initialData.appState`
  seeds `activeTool: {type:"selection", customType:null, locked:true,
  lastActiveTool:null}`.
- Tool-lock UI removed from all three surfaces: rail padlock, quick-actions
  toggle, View ▸ Tool Lock. Native `Q` still fires and the normalizer undoes it.

## Key facts / gotchas
- **ZERO fork edits.** Everything routes through `setActiveTool` /
  `getAppState` / `updateScene` / `onChange`.
- **The restore is two calls, in this order.** `setActiveTool` gives the right
  cursor but clears the selection for any non-selection tool (vendor
  `App.tsx:4758`); the follow-up `updateScene({appState:{selectedElementIds,
  selectedGroupIds, editingGroupId}})` puts it back. Selection is read FRESH at
  release — an engage-time snapshot would clobber an undo made mid-hold.
- **Never `setActiveTool({type:"image"})` from this feature** — it re-fires
  `onImageAction` and re-opens the OS file picker (vendor `App.tsx:4741`). Both
  the engage guard and the lock normalizer skip the image tool for this reason.
- **Don't engage mid-gesture.** The vendor reads Cmd during a drag to bypass
  grid snapping and to close elbow arrows, so `canEngage` bails on
  `cursorButton === "down"`, `newElement`, and `multiElement`.
- Accepted consequences: Cmd+drag with a *shape* tool no longer draws
  snap-free; Cmd-hold + click always drills into groups (vendor
  `App.tsx:6936`); every Cmd shortcut flaps the tool through selection and back.
- Related: [[vertical-toolbar]] (the rail this padlock left),
  [[quick-actions-bar]], [[view-menu-toggles]].
```

- [ ] **Step 4: Add the MEMORY.md pointer**

Append to `.claude/memory/MEMORY.md`:

```markdown
- [Tool override](tool-override.md) — hold Cmd/Ctrl for a temporary selection tool (restores tool + selection); tool lock forced permanently on and its three UI surfaces removed; zero fork; shipped 2026-08-07
```

- [ ] **Step 5: Commit**

```bash
git add .claude/memory/
git commit -m "docs(memory): record the tool-override work"
```

---

## Self-Review

**Spec coverage** — every section maps to a task:

| Spec section | Task |
|---|---|
| Mechanism §1 Engage | 1, 2 |
| Mechanism §2 Restore | 2 |
| Mechanism §3 Force the lock | 3 |
| Mechanism §Un-sticking | 2 |
| Suppression guards (all four) | 1 |
| Accepted consequences | documented in Task 8's memory file; no code |
| Removal: tool lock UI (3 surfaces) | 5, 6, 7 |
| No storage migration | stated in Task 5 |
| Testing: unit | 1, 2, 3 |
| Testing: e2e | 4 |
| Testing: trim existing lock assertions | 5, 6, 7 |
| Pre-existing e2e failures stay red | 8 |
| Out of scope (no preference, no second key, no Cmd+click change) | no task, correctly |

**Type consistency** — `overrideKeyFor` / `canEngage` / `OverrideState` are defined in Task 1 and used with those exact names in Task 2. `useToolOverride(api)` is defined in Task 2, extended in Task 3 without a signature change, and called in Task 4. `SetToolArg` is declared once in Task 2 and reused by Task 3's effect in the same file. `LOCK_ID` is removed from `tools.ts` (Task 5) before `src/ui/quickbar/actions.ts`'s own separate `LOCK_ID` (Task 6) — the two are independent constants in different modules, so the order does not matter, but note that `src/ui/quickbar/icons.tsx` imports `TOOL_ICONS` from the toolbar and `LOCK_ID` from quickbar's own `actions.ts`; Task 6 handles both.

**Placeholder scan** — no TBDs. Two spots deliberately say "read the neighbouring code first" rather than quoting it: `MenuBar.test.tsx`'s `baseProps`/`fakeApi` setup (Task 7) and `useQuickActions.test.tsx`'s import line (Task 6), because both depend on local helper shapes that must be copied verbatim from the file rather than guessed.
