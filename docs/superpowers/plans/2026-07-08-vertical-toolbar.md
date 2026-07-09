# Vertical Tool Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Excalidraw's horizontal top-center tool island with a flow-native **vertical tool rail** docked to the left edge — detachable/floatable, closeable, toggled from **View ▸ Show Toolbar**, and configurable via a hamburger menu (dock/undock + per-tool show/hide).

**Architecture:** A flow-native React rail (`src/ui/toolbar/`) drives tool selection through the public `excalidrawAPI.setActiveTool` and reads `appState.activeTool` reactively via `onChange` — the exact bridge pattern `useSelectionStyle` uses. The native island is hidden with a CSS rule (same graceful, no-fork approach flow already uses for `.selected-shape-actions`). The rail reuses the panel system's `useDrag` and `clampMenuPosition`, and the global `.flow-pnl-config*` dropdown styles. Toolbar state (visibility, float position, hidden tools) is owned by `App`, persisted to `flow.toolbar`.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + React Testing Library (`@testing-library/user-event`), Playwright (e2e), Radix Menubar, Excalidraw fork (consumed as a built package).

## Global Constraints

- **Zero fork edits.** Everything is flow-level: a CSS hide, flow-native components, and public-API tool dispatch. Do **not** modify anything under `vendor/excalidraw/`.
- **`--flow-*` design tokens only** (defined in `menubar.css`): `--flow-panel-bg`, `--flow-font`, `--flow-ink`, `--flow-ink-muted`, `--flow-border`, `--flow-radius-md`, `--flow-radius-sm`, `--flow-shadow`, `--flow-hover`, `--flow-active`, `--flow-accent`, `--flow-dur-fast`, `--flow-ease`. No hardcoded palette.
- **Immutable state updates** — always return new objects; never mutate `ToolbarState`.
- **Files stay focused** (<400 lines typical, 800 max). One responsibility per file.
- **TDD** — write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **localStorage key:** `flow.toolbar`. Menu-bar height constant: `36`px (`--flow-menubar-h`). Rail width: `48`px.
- **Commit style:** conventional commits (`feat:`, `test:`, `docs:`), no attribution trailer (matches repo history).

---

## File Structure

**New files (all under `src/ui/toolbar/`):**
- `tools.ts` — `ToolId` type, `ToolDef`, ordered `TOOLS`, `LOCK_ID`. Pure data.
- `toolbar-state.ts` — `ToolbarState` type, `DEFAULT_TOOLBAR_STATE`, `normalizeToolbarState`, `withHiddenToggled`, `shouldRedock`. Pure.
- `icons.tsx` — `TOOL_ICONS` map (inline SVG per tool + lock).
- `useActiveTool.ts` — hook bridging to `setActiveTool` / `appState.activeTool`.
- `ToolButton.tsx` — one icon button (active/pressed state).
- `ToolbarConfigMenu.tsx` — hamburger dropdown (Float/Dock + per-tool checkboxes).
- `ToolBar.tsx` — the rail (dock/float/drag/close, publishes reserved gutter, composes buttons + menu).
- `toolbar.css` — rail styles.
- Tests: `tools.test.ts`, `toolbar-state.test.ts`, `useActiveTool.test.tsx`, `ToolButton.test.tsx`, `ToolbarConfigMenu.test.tsx`, `ToolBar.test.tsx`.

**Modified files:**
- `src/app/preferences.ts` — add `getToolbarState` / `setToolbarState`.
- `src/index.css` — hide `.App-toolbar-container`.
- `src/ui/menubar/MenuBar.tsx` (+ `menubar.css`) — "Show Toolbar" checkbox item + two props.
- `src/App.tsx` — own toolbar state, persist, mount `<ToolBar>`, wire MenuBar, inset canvas left.

**New e2e:** `e2e/toolbar.spec.ts`.

---

## Task 1: Tool data model (`tools.ts`)

**Files:**
- Create: `src/ui/toolbar/tools.ts`
- Test: `src/ui/toolbar/tools.test.ts`

**Interfaces:**
- Produces:
  - `type ToolId = "selection" | "hand" | "rectangle" | "diamond" | "ellipse" | "arrow" | "line" | "freedraw" | "text" | "image" | "eraser" | "frame"`
  - `interface ToolDef { id: ToolId; label: string; shortcut: string }`
  - `const TOOLS: readonly ToolDef[]` (12 entries, native order)
  - `const LOCK_ID = "lock"` (string literal; used as a `hiddenTools` member for the lock toggle)

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/toolbar/tools.test.ts
import { describe, it, expect } from "vitest";
import { TOOLS, LOCK_ID } from "./tools";

describe("TOOLS", () => {
  it("lists the 12 native tools in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "line", "freedraw", "text", "image", "eraser", "frame",
    ]);
  });

  it("gives every tool a non-empty label and shortcut", () => {
    for (const t of TOOLS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.shortcut.length).toBeGreaterThan(0);
    }
  });

  it("exposes the lock id constant", () => {
    expect(LOCK_ID).toBe("lock");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/tools.test.ts`
Expected: FAIL — cannot resolve `./tools`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/toolbar/tools.ts

/** The Excalidraw tool types flow surfaces in the rail (subset of the fork's
 *  ToolType). Kept as a local union so the module stays free of vendor imports. */
export type ToolId =
  | "selection"
  | "hand"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "freedraw"
  | "text"
  | "image"
  | "eraser"
  | "frame";

export interface ToolDef {
  id: ToolId;
  /** Accessible name + tooltip. */
  label: string;
  /** Excalidraw's keyboard shortcut, shown in the tooltip. */
  shortcut: string;
}

/** The rail's tools, in Excalidraw's native left-to-right order (rendered
 *  top-to-bottom). Shortcuts mirror Excalidraw's defaults. */
export const TOOLS: readonly ToolDef[] = [
  { id: "selection", label: "Selection", shortcut: "V" },
  { id: "hand", label: "Hand (pan)", shortcut: "H" },
  { id: "rectangle", label: "Rectangle", shortcut: "R" },
  { id: "diamond", label: "Diamond", shortcut: "D" },
  { id: "ellipse", label: "Ellipse", shortcut: "O" },
  { id: "arrow", label: "Arrow", shortcut: "A" },
  { id: "line", label: "Line", shortcut: "L" },
  { id: "freedraw", label: "Draw", shortcut: "P" },
  { id: "text", label: "Text", shortcut: "T" },
  { id: "image", label: "Image", shortcut: "9" },
  { id: "eraser", label: "Eraser", shortcut: "E" },
  { id: "frame", label: "Frame", shortcut: "F" },
];

/** Membership key for the lock toggle within `hiddenTools` (lock is not a
 *  drawing tool, so it is not part of `ToolId`). */
export const LOCK_ID = "lock";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/tools.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/tools.ts src/ui/toolbar/tools.test.ts
git commit -m "feat: add tool-rail data model (TOOLS, ToolId, LOCK_ID)"
```

---

## Task 2: Toolbar state model (`toolbar-state.ts`)

**Files:**
- Create: `src/ui/toolbar/toolbar-state.ts`
- Test: `src/ui/toolbar/toolbar-state.test.ts`

**Interfaces:**
- Produces:
  - `interface ToolbarState { visible: boolean; floating: boolean; x: number; y: number; hiddenTools: string[] }`
  - `const DEFAULT_TOOLBAR_STATE: ToolbarState`
  - `function normalizeToolbarState(raw: unknown): ToolbarState`
  - `function withHiddenToggled(state: ToolbarState, id: string): ToolbarState`
  - `function shouldRedock(x: number, margin?: number): boolean`

- [ ] **Step 1: Write the failing test**

```ts
// src/ui/toolbar/toolbar-state.test.ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_TOOLBAR_STATE,
  normalizeToolbarState,
  withHiddenToggled,
  shouldRedock,
} from "./toolbar-state";

describe("normalizeToolbarState", () => {
  it("returns the default for null/garbage", () => {
    expect(normalizeToolbarState(undefined)).toEqual(DEFAULT_TOOLBAR_STATE);
    expect(normalizeToolbarState("nope")).toEqual(DEFAULT_TOOLBAR_STATE);
    expect(normalizeToolbarState(42)).toEqual(DEFAULT_TOOLBAR_STATE);
  });

  it("keeps valid fields and fills missing ones from defaults", () => {
    const s = normalizeToolbarState({ visible: false, floating: true, x: 120, y: 80 });
    expect(s).toEqual({ visible: false, floating: true, x: 120, y: 80, hiddenTools: [] });
  });

  it("coerces hiddenTools to an array of strings", () => {
    expect(normalizeToolbarState({ hiddenTools: ["frame", 5, "image"] }).hiddenTools)
      .toEqual(["frame", "image"]);
    expect(normalizeToolbarState({ hiddenTools: "frame" }).hiddenTools).toEqual([]);
  });
});

describe("withHiddenToggled", () => {
  it("adds an id not present (immutably)", () => {
    const s = { ...DEFAULT_TOOLBAR_STATE, hiddenTools: [] };
    const next = withHiddenToggled(s, "frame");
    expect(next.hiddenTools).toEqual(["frame"]);
    expect(s.hiddenTools).toEqual([]); // original untouched
  });

  it("removes an id already present", () => {
    const s = { ...DEFAULT_TOOLBAR_STATE, hiddenTools: ["frame", "image"] };
    expect(withHiddenToggled(s, "frame").hiddenTools).toEqual(["image"]);
  });
});

describe("shouldRedock", () => {
  it("re-docks when the left edge is within the margin", () => {
    expect(shouldRedock(20)).toBe(true);
    expect(shouldRedock(200)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/toolbar-state.test.ts`
Expected: FAIL — cannot resolve `./toolbar-state`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/toolbar/toolbar-state.ts

/** Persisted layout/config of the tool rail. */
export interface ToolbarState {
  /** Whether the rail is shown at all (View ▸ Show Toolbar / close button). */
  visible: boolean;
  /** Docked to the left edge (false) vs free-floating (true). */
  floating: boolean;
  /** Floating top-left, viewport pixels. Ignored while docked. */
  x: number;
  y: number;
  /** Tool ids (and LOCK_ID) the user has hidden from the rail. */
  hiddenTools: string[];
}

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  visible: true,
  floating: false,
  x: 0,
  y: 0,
  hiddenTools: [],
};

/** Distance (px) from the left edge within which a dropped floating rail
 *  re-docks. Mirrors the panel dock's TEAR_OFF_MARGIN. */
const REDOCK_MARGIN = 48;

/** Coerce an unknown persisted blob into a valid ToolbarState, filling any
 *  missing/invalid field from the default. Never throws. */
export function normalizeToolbarState(raw: unknown): ToolbarState {
  if (typeof raw !== "object" || raw === null) return DEFAULT_TOOLBAR_STATE;
  const r = raw as Record<string, unknown>;
  return {
    visible: typeof r.visible === "boolean" ? r.visible : DEFAULT_TOOLBAR_STATE.visible,
    floating: typeof r.floating === "boolean" ? r.floating : DEFAULT_TOOLBAR_STATE.floating,
    x: typeof r.x === "number" ? r.x : DEFAULT_TOOLBAR_STATE.x,
    y: typeof r.y === "number" ? r.y : DEFAULT_TOOLBAR_STATE.y,
    hiddenTools: Array.isArray(r.hiddenTools)
      ? r.hiddenTools.filter((t): t is string => typeof t === "string")
      : [],
  };
}

/** Toggle a tool id's presence in `hiddenTools`, returning a new state. */
export function withHiddenToggled(state: ToolbarState, id: string): ToolbarState {
  const hidden = state.hiddenTools.includes(id)
    ? state.hiddenTools.filter((t) => t !== id)
    : [...state.hiddenTools, id];
  return { ...state, hiddenTools: hidden };
}

/** Whether a floating rail dropped with its left edge at `x` should re-dock. */
export function shouldRedock(x: number, margin: number = REDOCK_MARGIN): boolean {
  return x < margin;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/toolbar-state.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/toolbar-state.ts src/ui/toolbar/toolbar-state.test.ts
git commit -m "feat: add pure toolbar state model (normalize, toggle, redock)"
```

---

## Task 3: Toolbar persistence (`preferences.ts`)

**Files:**
- Modify: `src/app/preferences.ts`
- Test: `src/app/preferences.test.ts` (append)

**Interfaces:**
- Consumes: `ToolbarState`, `normalizeToolbarState`, `DEFAULT_TOOLBAR_STATE` from Task 2.
- Produces:
  - `function getToolbarState(): ToolbarState`
  - `function setToolbarState(value: ToolbarState): void`

- [ ] **Step 1: Write the failing test** (append to `src/app/preferences.test.ts`)

```ts
// append inside src/app/preferences.test.ts
import { getToolbarState, setToolbarState } from "./preferences";
import { DEFAULT_TOOLBAR_STATE } from "../ui/toolbar/toolbar-state";

describe("toolbar state persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default when nothing is stored", () => {
    expect(getToolbarState()).toEqual(DEFAULT_TOOLBAR_STATE);
  });

  it("round-trips a stored state", () => {
    const state = { visible: false, floating: true, x: 33, y: 44, hiddenTools: ["frame"] };
    setToolbarState(state);
    expect(getToolbarState()).toEqual(state);
  });

  it("falls back to the default on malformed JSON", () => {
    localStorage.setItem("flow.toolbar", "{not json");
    expect(getToolbarState()).toEqual(DEFAULT_TOOLBAR_STATE);
  });
});
```

> If `src/app/preferences.test.ts` does not already import `describe/it/expect/beforeEach` from vitest, add them to its existing import line.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getToolbarState` is not exported.

- [ ] **Step 3: Write minimal implementation** (append to `src/app/preferences.ts`)

Add the import at the top of the file (next to the existing `units`/`roughness` imports):

```ts
import { normalizeToolbarState, type ToolbarState } from "../ui/toolbar/toolbar-state";
```

Append near the other `flow.*` keys (uses the file's existing private `readJson`/`writeJson`):

```ts
const TOOLBAR_KEY = "flow.toolbar";

/** Read the persisted tool-rail state, normalized (default on miss/parse error). */
export function getToolbarState(): ToolbarState {
  return normalizeToolbarState(readJson(TOOLBAR_KEY));
}

/** Persist the tool-rail state. */
export function setToolbarState(value: ToolbarState): void {
  writeJson(TOOLBAR_KEY, value);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: PASS (including the 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat: persist tool-rail state under flow.toolbar"
```

---

## Task 4: Active-tool bridge hook (`useActiveTool.ts`)

**Files:**
- Create: `src/ui/toolbar/useActiveTool.ts`
- Test: `src/ui/toolbar/useActiveTool.test.tsx`

**Interfaces:**
- Consumes: `ToolId` from Task 1; `ExcalidrawAPI` from `src/lib/excalidraw-scene.ts`.
- Produces:
  - `interface ActiveTool { activeType: string; locked: boolean; setTool: (type: ToolId) => void; toggleLock: () => void }`
  - `function useActiveTool(api: ExcalidrawAPI | null): ActiveTool`

> Note: this hook imports only *types* from `@excalidraw/excalidraw` (erased at runtime), so — unlike `useSelectionStyle.test` — it needs **no** `vi.mock("@excalidraw/excalidraw")`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/toolbar/useActiveTool.test.tsx
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActiveTool } from "./useActiveTool";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(activeTool: { type: string; locked: boolean }) {
  return {
    getAppState: () => ({ activeTool }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("useActiveTool", () => {
  it("reads the active tool type and lock flag", () => {
    const api = fakeApi({ type: "rectangle", locked: true });
    const { result } = renderHook(() => useActiveTool(api));
    expect(result.current.activeType).toBe("rectangle");
    expect(result.current.locked).toBe(true);
  });

  it("defaults to selection/unlocked when api is null", () => {
    const { result } = renderHook(() => useActiveTool(null));
    expect(result.current.activeType).toBe("selection");
    expect(result.current.locked).toBe(false);
  });

  it("setTool dispatches setActiveTool with the type", () => {
    const api = fakeApi({ type: "selection", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.setTool("diamond"));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("toggleLock flips the lock flag on the current tool", () => {
    const api = fakeApi({ type: "arrow", locked: false });
    const { result } = renderHook(() => useActiveTool(api));
    act(() => result.current.toggleLock());
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow", locked: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/useActiveTool.test.tsx`
Expected: FAIL — cannot resolve `./useActiveTool`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/ui/toolbar/useActiveTool.ts
import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { ToolId } from "./tools";

/** The public `setActiveTool` takes a discriminated union keyed on `type`;
 *  our ToolId is a subset, so we cast at this single boundary. */
type SetToolArg = Parameters<ExcalidrawAPI["setActiveTool"]>[0];

export interface ActiveTool {
  /** The current tool's type (e.g. "rectangle"); "selection" when unavailable. */
  activeType: string;
  /** Whether "keep selected tool active" is on. */
  locked: boolean;
  /** Switch the active tool. */
  setTool: (type: ToolId) => void;
  /** Toggle the lock flag on the current tool. */
  toggleLock: () => void;
}

/**
 * Reactive bridge to Excalidraw's active tool. Subscribes to `onChange` so the
 * rail re-renders when the tool changes (including via keyboard shortcuts), and
 * dispatches switches through the public `setActiveTool` API. Mirrors the
 * `useSelectionStyle` subscription shape.
 */
export function useActiveTool(api: ExcalidrawAPI | null): ActiveTool {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const at = api?.getAppState().activeTool;
  const activeType = at?.type ?? "selection";
  const locked = at?.locked ?? false;

  const setTool = (type: ToolId) => {
    api?.setActiveTool({ type } as SetToolArg);
  };

  const toggleLock = () => {
    api?.setActiveTool({ type: activeType, locked: !locked } as SetToolArg);
  };

  return { activeType, locked, setTool, toggleLock };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/useActiveTool.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/useActiveTool.ts src/ui/toolbar/useActiveTool.test.tsx
git commit -m "feat: add useActiveTool hook bridging the rail to setActiveTool"
```

---

## Task 5: Tool icons (`icons.tsx`)

**Files:**
- Create: `src/ui/toolbar/icons.tsx`
- Test: `src/ui/toolbar/icons.test.tsx`

**Interfaces:**
- Consumes: `ToolId`, `LOCK_ID` from Task 1.
- Produces: `const TOOL_ICONS: Record<ToolId | typeof LOCK_ID, ReactNode>`

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/toolbar/icons.test.tsx
import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { TOOL_ICONS } from "./icons";
import { TOOLS, LOCK_ID } from "./tools";

describe("TOOL_ICONS", () => {
  it("has a React element icon for every tool and the lock", () => {
    for (const t of TOOLS) {
      expect(isValidElement(TOOL_ICONS[t.id])).toBe(true);
    }
    expect(isValidElement(TOOL_ICONS[LOCK_ID])).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/icons.test.tsx`
Expected: FAIL — cannot resolve `./icons`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/toolbar/icons.tsx
import type { ReactNode } from "react";
import type { ToolId } from "./tools";
import { LOCK_ID } from "./tools";

/** Shared wrapper: 20×20, stroked with currentColor so the button controls color. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Inline SVG icon per tool (+ lock). Hand-rolled to stay fork-independent,
 *  matching the AlignPanel/TextPanel convention. */
export const TOOL_ICONS: Record<ToolId | typeof LOCK_ID, ReactNode> = {
  selection: (
    <Svg>
      <path fill="currentColor" stroke="none" d="M5 3l0 12 3-3 2 4 2-1-2-4 4 0z" />
    </Svg>
  ),
  hand: (
    <Svg>
      <path d="M7 11V6.5a1 1 0 012 0V6a1 1 0 012 0v.5a1 1 0 012 0V11a4 4 0 01-4 4h-1a3 3 0 01-2.6-1.5L4.5 11a1 1 0 011.6-1.2L7 11z" />
    </Svg>
  ),
  rectangle: (
    <Svg>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
    </Svg>
  ),
  diamond: (
    <Svg>
      <path d="M10 3l7 7-7 7-7-7z" />
    </Svg>
  ),
  ellipse: (
    <Svg>
      <ellipse cx="10" cy="10" rx="7" ry="5.5" />
    </Svg>
  ),
  arrow: (
    <Svg>
      <path d="M4 16L16 4" />
      <path d="M16 4h-5M16 4v5" />
    </Svg>
  ),
  line: (
    <Svg>
      <path d="M4 16L16 4" />
    </Svg>
  ),
  freedraw: (
    <Svg>
      <path d="M3 14c2-1 3-6 4.5-6S9 13 11 13s2-7 3.5-7 1.5 4 2.5 5" />
    </Svg>
  ),
  text: (
    <Svg>
      <path d="M5 5h10M10 5v10" />
    </Svg>
  ),
  image: (
    <Svg>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
      <circle cx="7.5" cy="8.5" r="1.2" />
      <path d="M4 14l4-4 3 3 2-2 3 3" />
    </Svg>
  ),
  eraser: (
    <Svg>
      <path d="M4 13l6-6a1.5 1.5 0 012 0l2 2a1.5 1.5 0 010 2l-5 5H7z" />
      <path d="M7 16h9" />
    </Svg>
  ),
  frame: (
    <Svg>
      <path d="M6 3v14M14 3v14M3 6h14M3 14h14" />
    </Svg>
  ),
  [LOCK_ID]: (
    <Svg>
      <rect x="5" y="9" width="10" height="7" rx="1" />
      <path d="M7 9V7a3 3 0 016 0v2" />
    </Svg>
  ),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/icons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/icons.tsx src/ui/toolbar/icons.test.tsx
git commit -m "feat: add inline SVG tool icons for the rail"
```

---

## Task 6: Tool button (`ToolButton.tsx`)

**Files:**
- Create: `src/ui/toolbar/ToolButton.tsx`
- Test: `src/ui/toolbar/ToolButton.test.tsx`

**Interfaces:**
- Produces:
  - `interface ToolButtonProps { icon: ReactNode; label: string; shortcut?: string; active: boolean; onClick: () => void }`
  - `function ToolButton(props: ToolButtonProps)` — a `<button>` with `aria-label={label}`, `aria-pressed={active}`, `data-active` when active, `title` = `label` + shortcut.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/toolbar/ToolButton.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolButton } from "./ToolButton";

describe("ToolButton", () => {
  it("exposes the label as its accessible name", () => {
    render(<ToolButton icon={<i />} label="Rectangle" active={false} onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
  });

  it("reflects active state via aria-pressed", () => {
    render(<ToolButton icon={<i />} label="Rectangle" active onClick={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toHaveAttribute("aria-pressed", "true");
  });

  it("fires onClick when pressed", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<ToolButton icon={<i />} label="Rectangle" active={false} onClick={onClick} />);
    await user.click(screen.getByRole("button", { name: "Rectangle" }));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/ToolButton.test.tsx`
Expected: FAIL — cannot resolve `./ToolButton`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/toolbar/ToolButton.tsx
import type { ReactNode } from "react";

interface ToolButtonProps {
  icon: ReactNode;
  /** Accessible name + tooltip base. */
  label: string;
  /** Optional shortcut appended to the tooltip. */
  shortcut?: string;
  /** Highlighted (selected tool, or lock engaged). */
  active: boolean;
  onClick: () => void;
}

/** One square icon button in the rail. Presentational — the parent owns state. */
export function ToolButton({ icon, label, shortcut, active, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className="flow-toolbar__btn"
      aria-label={label}
      aria-pressed={active}
      data-active={active || undefined}
      title={shortcut ? `${label} — ${shortcut}` : label}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/ToolButton.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/ToolButton.tsx src/ui/toolbar/ToolButton.test.tsx
git commit -m "feat: add ToolButton (icon button with active state)"
```

---

## Task 7: Config menu (`ToolbarConfigMenu.tsx`)

**Files:**
- Create: `src/ui/toolbar/ToolbarConfigMenu.tsx`
- Test: `src/ui/toolbar/ToolbarConfigMenu.test.tsx`

**Interfaces:**
- Consumes: `TOOLS`, `LOCK_ID` (Task 1); `clampMenuPosition`, `MenuPoint` from `src/ui/panels/dock/menu-position.ts`.
- Produces:
  - `interface ToolbarConfigMenuProps { floating: boolean; hiddenTools: string[]; anchor: MenuPoint; onToggleFloating: () => void; onToggleTool: (id: string) => void }`
  - `function ToolbarConfigMenu(props)` — renders a `.flow-pnl-config` dropdown (reusing the panel config styles): a Float/Dock action, a separator, then a checkbox row per tool + a Lock row.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/toolbar/ToolbarConfigMenu.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";

const base = {
  floating: false,
  hiddenTools: [] as string[],
  anchor: { top: 40, left: 60 },
  onToggleFloating: () => {},
  onToggleTool: () => {},
};

describe("ToolbarConfigMenu", () => {
  it("shows 'Detach toolbar' when docked and 'Dock toolbar' when floating", () => {
    const { rerender } = render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
    rerender(<ToolbarConfigMenu {...base} floating />);
    expect(screen.getByRole("menuitem", { name: "Dock toolbar" })).toBeInTheDocument();
  });

  it("renders a checked row per visible tool and Lock", () => {
    render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("checkbox", { name: "Rectangle" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Lock" })).toBeChecked();
  });

  it("unchecks a hidden tool", () => {
    render(<ToolbarConfigMenu {...base} hiddenTools={["frame"]} />);
    expect(screen.getByRole("checkbox", { name: "Frame" })).not.toBeChecked();
  });

  it("calls onToggleTool with the id when a row is toggled", async () => {
    const user = userEvent.setup();
    const onToggleTool = vi.fn();
    render(<ToolbarConfigMenu {...base} onToggleTool={onToggleTool} />);
    await user.click(screen.getByRole("checkbox", { name: "Frame" }));
    expect(onToggleTool).toHaveBeenCalledWith("frame");
  });

  it("calls onToggleFloating when the dock action is clicked", async () => {
    const user = userEvent.setup();
    const onToggleFloating = vi.fn();
    render(<ToolbarConfigMenu {...base} onToggleFloating={onToggleFloating} />);
    await user.click(screen.getByRole("menuitem", { name: "Detach toolbar" }));
    expect(onToggleFloating).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/ToolbarConfigMenu.test.tsx`
Expected: FAIL — cannot resolve `./ToolbarConfigMenu`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/toolbar/ToolbarConfigMenu.tsx
import { useLayoutEffect, useRef, useState } from "react";
import { clampMenuPosition, type MenuPoint } from "../panels/dock/menu-position";
import { TOOLS, LOCK_ID } from "./tools";

interface ToolbarConfigMenuProps {
  floating: boolean;
  hiddenTools: string[];
  /** Ideal top-left (near the hamburger); clamped into the viewport on mount. */
  anchor: MenuPoint;
  onToggleFloating: () => void;
  onToggleTool: (id: string) => void;
}

/**
 * The rail's hamburger dropdown: dock/detach the rail, and show/hide each tool.
 * Reuses the panel config-menu styles (`.flow-pnl-config*`, global in panels.css)
 * and the shared `clampMenuPosition` so it stays fully on-screen.
 */
export function ToolbarConfigMenu({
  floating,
  hiddenTools,
  anchor,
  onToggleFloating,
  onToggleTool,
}: ToolbarConfigMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<MenuPoint>(anchor);

  // Pull the menu fully on-screen before paint (useLayoutEffect = pre-paint).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos(
      clampMenuPosition(
        anchor,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchor]);

  const rows = [...TOOLS.map((t) => ({ id: t.id as string, label: t.label })), { id: LOCK_ID, label: "Lock" }];

  return (
    <div
      ref={ref}
      className="flow-pnl-config"
      style={{ top: pos.top, left: pos.left }}
      role="menu"
    >
      <button
        type="button"
        className="flow-pnl-config__action"
        role="menuitem"
        onClick={onToggleFloating}
      >
        {floating ? "Dock toolbar" : "Detach toolbar"}
      </button>
      <div className="flow-pnl-config__sep" />
      {rows.map((r) => (
        <label key={r.id} className="flow-pnl-config__item">
          <input
            type="checkbox"
            checked={!hiddenTools.includes(r.id)}
            onChange={() => onToggleTool(r.id)}
          />
          {r.label}
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/ToolbarConfigMenu.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/toolbar/ToolbarConfigMenu.tsx src/ui/toolbar/ToolbarConfigMenu.test.tsx
git commit -m "feat: add ToolbarConfigMenu (dock/undock + per-tool show/hide)"
```

---

## Task 8: The rail (`ToolBar.tsx` + `toolbar.css`)

**Files:**
- Create: `src/ui/toolbar/ToolBar.tsx`, `src/ui/toolbar/toolbar.css`
- Test: `src/ui/toolbar/ToolBar.test.tsx`

**Interfaces:**
- Consumes: `useActiveTool` (T4), `TOOLS`/`LOCK_ID` (T1), `TOOL_ICONS` (T5), `ToolButton` (T6), `ToolbarConfigMenu` (T7), `useDrag` (`src/ui/panels/dock/useDrag.ts`), `MenuPoint` (`menu-position.ts`), `ToolbarState`/`withHiddenToggled`/`shouldRedock` (T2), `ExcalidrawAPI`.
- Produces:
  - `interface ToolBarProps { api: ExcalidrawAPI | null; state: ToolbarState; onChange: (next: ToolbarState) => void }`
  - `function ToolBar(props)` — the rail. Returns `null` when `!state.visible`. Publishes `--flow-toolbar-reserved`.

> Drag/float/dock behavior is verified in e2e (Task 11), not here — pointer-drag + real layout are unreliable in jsdom (the panel dock follows the same split). This task's component test covers rendering, tool click, close, hidden-tool filtering, and menu open.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/toolbar/ToolBar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolBar } from "./ToolBar";
import { DEFAULT_TOOLBAR_STATE } from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(type = "selection", locked = false) {
  return {
    getAppState: () => ({ activeTool: { type, locked } }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("ToolBar", () => {
  it("renders nothing when not visible", () => {
    render(
      <ToolBar api={fakeApi()} state={{ ...DEFAULT_TOOLBAR_STATE, visible: false }} onChange={() => {}} />,
    );
    expect(screen.queryByRole("toolbar", { name: "Tools" })).toBeNull();
  });

  it("renders a button for every visible tool plus lock", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep tool active" })).toBeInTheDocument();
  });

  it("omits a hidden tool", () => {
    render(
      <ToolBar api={fakeApi()} state={{ ...DEFAULT_TOOLBAR_STATE, hiddenTools: ["frame"] }} onChange={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: "Frame" })).toBeNull();
  });

  it("dispatches setActiveTool when a tool is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ToolBar api={api} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Diamond" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("marks the active tool as pressed", () => {
    render(<ToolBar api={fakeApi("ellipse")} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Ellipse" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the rail via onChange when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Close toolbar" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("opens the config menu from the hamburger", async () => {
    const user = userEvent.setup();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/toolbar/ToolBar.test.tsx`
Expected: FAIL — cannot resolve `./ToolBar`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/toolbar/ToolBar.tsx
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./toolbar.css";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { MenuPoint } from "../panels/dock/menu-position";
import { useDrag } from "../panels/dock/useDrag";
import { TOOLS, LOCK_ID } from "./tools";
import { TOOL_ICONS } from "./icons";
import { ToolButton } from "./ToolButton";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { useActiveTool } from "./useActiveTool";
import { shouldRedock, withHiddenToggled, type ToolbarState } from "./toolbar-state";

const RAIL_WIDTH = 48;
const MENUBAR_H = 36;

interface ToolBarProps {
  api: ExcalidrawAPI | null;
  state: ToolbarState;
  onChange: (next: ToolbarState) => void;
}

/** Anchor the config dropdown just to the right of the rail's top-left. */
function configAnchor(el: HTMLElement | null): MenuPoint {
  const r = el?.getBoundingClientRect();
  return { top: r?.top ?? MENUBAR_H, left: (r?.right ?? RAIL_WIDTH) + 4 };
}

/**
 * Flow-native vertical tool rail. Docked to the left edge by default; can be
 * torn off into a floating strip (drag the top bar) or docked/undocked and have
 * tools shown/hidden from the hamburger menu. Drives tool selection through the
 * public Excalidraw API; the native island is hidden via CSS.
 */
export function ToolBar({ api, state, onChange }: ToolBarProps) {
  const { activeType, locked, setTool, toggleLock } = useActiveTool(api);
  const [menuOpen, setMenuOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const origin = useRef({ x: 0, y: 0 });

  // Reserve the left gutter so the canvas insets around a docked rail (keeping
  // Excalidraw's bottom-left zoom/undo controls clear). Floating/hidden = 0.
  useEffect(() => {
    const root = document.documentElement;
    const reserved = state.visible && !state.floating ? RAIL_WIDTH : 0;
    root.style.setProperty("--flow-toolbar-reserved", `${reserved}px`);
    return () => root.style.removeProperty("--flow-toolbar-reserved");
  }, [state.visible, state.floating]);

  // Close the config menu on any outside pointer press (mirrors PanelShell).
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest(".flow-pnl-config") || t.closest(".flow-toolbar__hamburger")) return;
      setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onTopbarPointerDown = useDrag({
    onStart: (e) => {
      // Don't start a drag from the hamburger/close buttons.
      if ((e.target as HTMLElement).closest("button")) return false;
      const r = shellRef.current?.getBoundingClientRect();
      origin.current = { x: r?.left ?? 0, y: r?.top ?? MENUBAR_H };
    },
    onMove: (m) => {
      onChange({ ...state, floating: true, x: origin.current.x + m.dx, y: origin.current.y + m.dy });
    },
    onEnd: (m) => {
      if (!m.moved) return;
      if (shouldRedock(origin.current.x + m.dx)) onChange({ ...state, floating: false });
    },
  });

  if (!state.visible) return null;

  const shellStyle: CSSProperties = state.floating
    ? { width: RAIL_WIDTH, top: state.y, left: state.x }
    : { width: RAIL_WIDTH, top: MENUBAR_H, left: 0, bottom: 0 };

  return (
    <div
      ref={shellRef}
      className={`flow-toolbar ${state.floating ? "flow-toolbar--floating" : "flow-toolbar--docked"}`}
      style={shellStyle}
      role="toolbar"
      aria-label="Tools"
      aria-orientation="vertical"
    >
      <div className="flow-toolbar__topbar" onPointerDown={onTopbarPointerDown}>
        <button
          type="button"
          className="flow-toolbar__iconbtn flow-toolbar__hamburger"
          aria-label="Toolbar options"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ☰
        </button>
        <button
          type="button"
          className="flow-toolbar__iconbtn"
          aria-label="Close toolbar"
          onClick={() => onChange({ ...state, visible: false })}
        >
          ✕
        </button>
      </div>

      <div className="flow-toolbar__tools">
        {TOOLS.filter((t) => !state.hiddenTools.includes(t.id)).map((t) => (
          <ToolButton
            key={t.id}
            icon={TOOL_ICONS[t.id]}
            label={t.label}
            shortcut={t.shortcut}
            active={activeType === t.id}
            onClick={() => setTool(t.id)}
          />
        ))}
      </div>

      {!state.hiddenTools.includes(LOCK_ID) && (
        <div className="flow-toolbar__foot">
          <ToolButton
            icon={TOOL_ICONS[LOCK_ID]}
            label="Keep tool active"
            active={locked}
            onClick={toggleLock}
          />
        </div>
      )}

      {menuOpen && (
        <ToolbarConfigMenu
          floating={state.floating}
          hiddenTools={state.hiddenTools}
          anchor={configAnchor(shellRef.current)}
          onToggleFloating={() => {
            onChange({ ...state, floating: !state.floating });
            setMenuOpen(false);
          }}
          onToggleTool={(id) => onChange(withHiddenToggled(state, id))}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the stylesheet**

```css
/* src/ui/toolbar/toolbar.css
 * Flow-native vertical tool rail. Built on the shared --flow-* tokens (defined
 * in menubar.css) so it matches the app's quiet-chrome language: white surface,
 * indigo accent, hairline borders. Docks to the left edge below the menu bar;
 * floats and tears off. The config dropdown reuses .flow-pnl-config* (panels.css). */

.flow-toolbar {
  position: fixed;
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--flow-panel-bg);
  font-family: var(--flow-font);
  color: var(--flow-ink);
}
.flow-toolbar--docked {
  border-right: 1px solid var(--flow-border);
}
.flow-toolbar--floating {
  border: 1px solid var(--flow-border);
  border-radius: var(--flow-radius-md);
  box-shadow: var(--flow-shadow);
  bottom: auto;
}

/* Top bar = drag handle (hamburger + close). */
.flow-toolbar__topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 28px;
  flex-shrink: 0;
  padding: 0 4px;
  border-bottom: 1px solid var(--flow-border);
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.flow-toolbar__iconbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--flow-ink-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  border-radius: var(--flow-radius-sm);
}
.flow-toolbar__iconbtn:hover {
  background: var(--flow-hover);
  color: var(--flow-ink);
}

/* Tool button column. */
.flow-toolbar__tools {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  overflow-y: auto;
}
.flow-toolbar__foot {
  margin-top: auto;
  padding: 4px 0;
  border-top: 1px solid var(--flow-border);
}
.flow-toolbar__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: var(--flow-radius-sm);
  background: transparent;
  color: var(--flow-ink);
  cursor: pointer;
  transition: background var(--flow-dur-fast) var(--flow-ease),
    color var(--flow-dur-fast) var(--flow-ease);
}
.flow-toolbar__btn:hover {
  background: var(--flow-hover);
}
.flow-toolbar__btn[data-active] {
  background: var(--flow-active);
  color: var(--flow-accent);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/ui/toolbar/ToolBar.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/ui/toolbar/ToolBar.tsx src/ui/toolbar/toolbar.css src/ui/toolbar/ToolBar.test.tsx
git commit -m "feat: add the vertical tool rail (dock/float/close + config menu)"
```

---

## Task 9: "Show Toolbar" menu item (`MenuBar.tsx`)

**Files:**
- Modify: `src/ui/menubar/MenuBar.tsx`, `src/ui/menubar/menubar.css`
- Test: `src/ui/menubar/MenuBar.test.tsx` (extend shared props + add a test)

**Interfaces:**
- Produces (added to `MenuBarProps`): `isToolbarVisible?: boolean; onToggleToolbar?: () => void`.
- The View menu gains a `Menubar.CheckboxItem` labeled "Show Toolbar" (role `menuitemcheckbox`), reflecting `isToolbarVisible`, calling `onToggleToolbar` on change.

> The two props are **optional** so the tree keeps building between this task and Task 11 (where `App` supplies them). `App` always passes both.

- [ ] **Step 1: Write the failing test**

First extend the shared `props` object at the top of `MenuBar.test.tsx` so all renders compile:

```ts
// in src/ui/menubar/MenuBar.test.tsx — add to the `props` object literal:
  isToolbarVisible: true, onToggleToolbar: noop,
```

Then add this test inside the `describe("MenuBar", ...)` block:

```tsx
  it("toggles the toolbar from the View menu", async () => {
    const user = userEvent.setup();
    const onToggleToolbar = vi.fn();
    render(<MenuBar {...props} isToolbarVisible onToggleToolbar={onToggleToolbar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const item = await screen.findByRole("menuitemcheckbox", { name: "Show Toolbar" });
    expect(item).toBeInTheDocument();
    await user.click(item);
    expect(onToggleToolbar).toHaveBeenCalledOnce();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/menubar/MenuBar.test.tsx`
Expected: FAIL — no `menuitemcheckbox` named "Show Toolbar" (and a TS error until the props are added).

- [ ] **Step 3: Add the props to the interface**

In `MenuBar.tsx`, add to `MenuBarProps` (after `onToggleGrid`):

```ts
  onToggleGrid: () => void;
  /** Whether the tool rail is currently shown (drives the View checkbox).
   *  Optional so the tree builds before App wires it (Task 11); App always sets it. */
  isToolbarVisible?: boolean;
  /** Toggle the tool rail's visibility. */
  onToggleToolbar?: () => void;
```

- [ ] **Step 4: Add the checkbox item to the View menu**

In `MenuBar.tsx`, inside the View `Menubar.Content`, after the "Toggle Grid" item, add:

```tsx
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isToolbarVisible ?? true}
              onCheckedChange={() => props.onToggleToolbar?.()}
            >
              <Menubar.ItemIndicator className="flow-menu__check">✓</Menubar.ItemIndicator>
              Show Toolbar
            </Menubar.CheckboxItem>
```

- [ ] **Step 5: Add minimal indicator CSS**

Append to `src/ui/menubar/menubar.css`:

```css
/* Checkbox menu items (e.g. View ▸ Show Toolbar) reserve room for the tick. */
.flow-menu__item--check {
  position: relative;
  padding-left: 22px;
}
.flow-menu__check {
  position: absolute;
  left: 6px;
  display: inline-flex;
  align-items: center;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/ui/menubar/MenuBar.test.tsx`
Expected: PASS (all existing tests + the new one).

- [ ] **Step 7: Commit**

```bash
git add src/ui/menubar/MenuBar.tsx src/ui/menubar/menubar.css src/ui/menubar/MenuBar.test.tsx
git commit -m "feat: add View ▸ Show Toolbar checkbox to the menu bar"
```

---

## Task 10: Hide the native island (`index.css`)

**Files:**
- Modify: `src/index.css`

> No unit test — this is a CSS hide verified visually / in e2e (Task 11). Folded into its own tiny commit because it's an independently reviewable, self-contained change.

- [ ] **Step 1: Append the hide rule**

Add to `src/index.css` (after the existing `.selected-shape-actions` block):

```css
/*
 * flow replaces Excalidraw's horizontal tool island (top-center) with its own
 * vertical tool rail (src/ui/toolbar). `.App-toolbar-container` is the stable
 * wrapper Excalidraw puts around the shapes toolbar (see vendor LayerUI.tsx);
 * it is separate from the hamburger/menu, so hiding it suppresses only the tool
 * island and degrades gracefully (worst case the island reappears). This also
 * removes the in-island HintViewer text and pen/lock buttons — flow surfaces
 * lock in its own rail.
 */
.excalidraw .App-toolbar-container {
  display: none;
}
```

- [ ] **Step 2: Verify the app still builds/type-checks**

Run: `npm run build`
Expected: build succeeds (no TS/CSS errors).

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: hide Excalidraw's native tool island (replaced by flow rail)"
```

---

## Task 11: App integration (`App.tsx`)

**Files:**
- Modify: `src/App.tsx`

> Wiring task — behavior is verified by the e2e suite (Task 12) and the component tests already written. No new unit test here; the deliverable is the running app with the rail mounted, toggled, persisted, and the canvas inset on the left.

**Interfaces:**
- Consumes: `ToolBar` (T8), `getToolbarState`/`setToolbarState` (T3), `ToolbarState` (T2); MenuBar props (T9).

- [ ] **Step 1: Add imports**

In `src/App.tsx`, extend the preferences import and add the ToolBar + type imports:

```ts
import {
  getSloppiness, setSloppiness, getUnits, setUnits,
  getToolbarState, setToolbarState,
} from "./app/preferences";
import { ToolBar } from "./ui/toolbar/ToolBar";
import { type ToolbarState } from "./ui/toolbar/toolbar-state";
```

- [ ] **Step 2: Own + persist toolbar state**

After the `units` state block (around line 76-80), add:

```ts
  // Tool-rail layout/config. App owns it so the View menu can read visibility;
  // ToolBar mutates it via onChange. Persisted to flow.toolbar.
  const [toolbar, setToolbar] = useState<ToolbarState>(() => getToolbarState());
  useEffect(() => {
    setToolbarState(toolbar);
  }, [toolbar]);
```

- [ ] **Step 3: Wire the MenuBar props**

In the `<MenuBar ... />` element, after `onToggleGrid={withApi(toggleGrid)}`, add:

```tsx
        isToolbarVisible={toolbar.visible}
        onToggleToolbar={() => setToolbar((s) => ({ ...s, visible: !s.visible }))}
```

- [ ] **Step 4: Inset the canvas on the left + mount the rail**

Change the Excalidraw wrapper `inset` (currently `"var(--flow-menubar-h) var(--flow-panel-reserved, 0px) 0 0"`) to reserve the left gutter:

```tsx
      <div
        style={{
          position: "fixed",
          inset:
            "var(--flow-menubar-h) var(--flow-panel-reserved, 0px) 0 var(--flow-toolbar-reserved, 0px)",
        }}
      >
```

Then mount `<ToolBar>` as a sibling right after that wrapper `</div>` (before the `{saveOpen && (...)}` block):

```tsx
      <ToolBar api={excalidrawApi} state={toolbar} onChange={setToolbar} />
```

- [ ] **Step 5: Verify build + full unit suite**

Run: `npm run build && npx vitest run`
Expected: build succeeds; all unit/component tests pass.

- [ ] **Step 6: Manually smoke-test**

Run: `npm run dev`, open the app. Confirm: the vertical rail is on the left below the menu bar; the native top-center island is gone; clicking Rectangle then dragging on the canvas draws a rectangle; View ▸ Show Toolbar hides/shows the rail; the hamburger opens the config menu; dragging the top bar floats the rail; reload preserves visibility/float/hidden tools.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: mount the tool rail, wire View toggle, inset canvas left"
```

---

## Task 12: End-to-end coverage (`e2e/toolbar.spec.ts`)

**Files:**
- Create: `e2e/toolbar.spec.ts`

**Interfaces:**
- Consumes: the running app (Playwright dev server on port 5173, per `playwright.config.ts`).

> Assertions are deterministic without a scene API: rail position, `aria-pressed` for active tool, visibility toggle + persistence, and hidden-tool persistence. No geometry/drawing assertions (flaky; the align/panels specs follow the same rule).

- [ ] **Step 1: Write the e2e spec**

```ts
// e2e/toolbar.spec.ts
import { test, expect } from "@playwright/test";

test.describe("vertical tool bar", () => {
  test("renders docked on the left, below the menu bar", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(5); // flush to the left edge
    expect(box!.y).toBeGreaterThanOrEqual(30); // below the 36px menu bar
  });

  test("selecting a tool marks it active", async ({ page }) => {
    await page.goto("/");
    const rect = page.getByRole("button", { name: "Rectangle" });
    await rect.click();
    await expect(rect).toHaveAttribute("aria-pressed", "true");
  });

  test("View ▸ Show Toolbar hides the rail and persists across reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("toolbar", { name: "Tools" })).toBeVisible();

    await page.getByRole("menuitem", { name: "View" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Show Toolbar" }).click();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("toolbar", { name: "Tools" })).toHaveCount(0);
  });

  test("the hamburger hides a tool and the choice persists", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Frame" })).toBeVisible();

    await page.getByRole("button", { name: "Toolbar options" }).click();
    await page.getByRole("checkbox", { name: "Frame" }).uncheck();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: "Frame" })).toHaveCount(0);
  });

  test("tearing off the top bar floats the rail", async ({ page }) => {
    await page.goto("/");
    const rail = page.getByRole("toolbar", { name: "Tools" });
    const before = await rail.boundingBox();

    // Drag the top bar (avoid the hamburger/close buttons: grab its right-ish gap).
    const topbar = page.locator(".flow-toolbar__topbar");
    const tb = await topbar.boundingBox();
    await page.mouse.move(tb!.x + tb!.width / 2, tb!.y + tb!.height / 2);
    await page.mouse.down();
    await page.mouse.move(tb!.x + 220, tb!.y + 160, { steps: 8 });
    await page.mouse.up();

    const after = await rail.boundingBox();
    expect(after!.x).toBeGreaterThan(before!.x + 100); // moved right, now floating
  });
});
```

- [ ] **Step 2: Run the e2e spec**

Run: `npm run test:e2e -- toolbar.spec.ts`
Expected: PASS (5 tests). If the drag test is flaky on the topbar center (buttons occupy the ends), nudge the grab point to `tb!.x + tb!.width * 0.5` remains between the hamburger (left) and close (right) — the gap is the `justify-content: space-between` middle.

- [ ] **Step 3: Commit**

```bash
git add e2e/toolbar.spec.ts
git commit -m "test: e2e for the vertical tool bar (dock, active, toggle, hide, float)"
```

---

## Task 13: Update project memory

**Files:**
- Create: `.claude/memory/vertical-toolbar.md`
- Modify: `.claude/memory/MEMORY.md`

- [ ] **Step 1: Write the memory file**

```markdown
# Vertical tool bar (floatable left rail)

Flow-native vertical tool rail replacing Excalidraw's top-center tool island.
Spec/plan: `docs/superpowers/specs|plans/2026-07-08-vertical-toolbar*.md`.

## Shipped
- `src/ui/toolbar/`: `tools.ts` (TOOLS/ToolId/LOCK_ID), `toolbar-state.ts` (pure
  state: normalize/withHiddenToggled/shouldRedock), `useActiveTool.ts` (onChange
  bridge → setActiveTool; types-only vendor import so NO vi.mock needed),
  `icons.tsx`, `ToolButton.tsx`, `ToolbarConfigMenu.tsx`, `ToolBar.tsx`, `toolbar.css`.
- Persistence in `src/app/preferences.ts`: `get/setToolbarState` (`flow.toolbar`).
- `App.tsx` owns `toolbar` state (so View menu reads visibility), persists via
  effect, mounts `<ToolBar>`, insets the canvas left by `--flow-toolbar-reserved`.
- MenuBar: View ▸ Show Toolbar (`Menubar.CheckboxItem`).
- Native island hidden via `index.css` `.App-toolbar-container { display:none }`.

## Key facts
- ZERO fork edits — `setActiveTool`/`appState.activeTool` are public API.
- Reuses panel infra: `useDrag`, `clampMenuPosition`, global `.flow-pnl-config*`.
- Rail width 48px; docks left below the 36px menu bar; symmetric with the
  right-docked controls panel (`--flow-panel-reserved`).
- Drag/float/dock is e2e-tested only (jsdom can't do pointer-drag + layout) —
  same split as the panel dock. Unit/component tests cover the rest.
- Config menu: dock/undock + per-tool show/hide (incl. lock), persisted in
  `hiddenTools`.
```

- [ ] **Step 2: Add the index pointer**

Append to `.claude/memory/MEMORY.md`:

```markdown
- [Vertical toolbar](vertical-toolbar.md) — flow-native left tool rail (float/close/configurable), replaces Excalidraw's island; shipped 2026-07-08
```

- [ ] **Step 3: Commit**

```bash
git add .claude/memory/vertical-toolbar.md .claude/memory/MEMORY.md
git commit -m "docs: record vertical toolbar in project memory"
```

---

## Self-Review

**1. Spec coverage:**
- Left-docked vertical rail → Tasks 8, 11 (dock geometry + left inset). ✓
- Detach/drag + re-dock → Task 8 (`useDrag`, `shouldRedock`), e2e float in Task 12. ✓
- Close + View ▸ Show Toolbar toggle → Tasks 8 (close), 9 (menu), 11 (wiring), 12 (e2e). ✓
- Configurable hamburger (dock/undock + per-tool show/hide) → Tasks 2 (`hiddenTools`, `withHiddenToggled`), 7 (menu), 8 (integration). ✓
- Mirror native tool set + lock → Task 1 (12 tools), 5 (icons incl. lock), 8 (lock button). ✓
- Tool dispatch via public API + reactive active state → Task 4. ✓
- Persistence (`{visible,floating,x,y,hiddenTools}`) → Tasks 2, 3; restore in Task 11. ✓
- Hide native island (`.App-toolbar-container`) → Task 10. ✓
- Zero fork edits → honored throughout (Global Constraints). ✓
- Testing (unit/component/e2e) → Tasks 1–9 unit/component, Task 12 e2e. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; no "similar to Task N" references. ✓

**3. Type consistency:**
- `ToolbarState` shape identical across Tasks 2, 3, 8, 11. ✓
- `useActiveTool` returns `{ activeType, locked, setTool, toggleLock }` — consumed exactly in Task 8. ✓
- `setActiveTool` called with `{ type }` / `{ type, locked }` — matches Task 4 test expectations and the ToolBar test. ✓
- `TOOL_ICONS` keyed by `ToolId | typeof LOCK_ID` — indexed with `t.id` and `LOCK_ID` in Task 8. ✓
- `ToolButton` prop `label` used as accessible name — e2e/component queries use the same labels ("Rectangle", "Keep tool active", "Close toolbar", "Toolbar options"). ✓
- `ToolbarConfigMenu` action label "Detach toolbar"/"Dock toolbar" — asserted identically in Tasks 7 and 12. ✓
