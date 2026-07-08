# Desktop Menu Bar + Preferences (global sloppiness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a traditional desktop menu bar (File / View / Help) with a Preferences dialog whose first setting is a global, app-wide sloppiness control that restyles the whole canvas at once.

**Architecture:** All flow-level — no Excalidraw fork edits. A Radix-based menu bar owns a 36px top strip; the Excalidraw canvas shifts down beneath it. Global sloppiness generalizes the existing lock-to-Architect enforcement into a `localStorage`-backed preference applied to all existing + new elements. Business logic lives in small pure modules (`roughness.ts`, `preferences.ts`, `view-actions.ts`); `App.tsx` owns state and wires callbacks to presentational components.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library, Playwright, `@excalidraw/excalidraw` (v0.18.1 fork via `file:` dep), `@radix-ui/react-menubar`.

## Global Constraints

- **No Excalidraw fork edits.** Every change is a new flow file, a flow file edit, the public `excalidrawAPI`, or CSS. Nothing under `vendor/excalidraw/`.
- **Light theme only** for this pass. No theme toggle.
- **Sloppiness is app-wide**, persisted in `localStorage` key `flow.sloppiness`, values `0` Architect / `1` Artist / `2` Cartoonist, default `0`.
- **Font:** Nunito for the menu bar (already self-hosted).
- **Menu-bar accent:** Excalidraw indigo `#6965db` for interactive states only; bar recedes (flat white) at rest. Tokens namespaced `--flow-*`.
- **Menus for this pass:** File (full), View, Help. **No Edit menu** (deferred — omit entirely).
- **Accessibility:** Radix supplies the WAI-ARIA menubar pattern; dialogs keep `role="dialog" aria-modal="true"`; external links use `target="_blank" rel="noopener noreferrer"`; WCAG AA contrast.
- **Excalidraw API facts (verified against the installed v0.18.1 source):**
  - `api.updateScene({ elements?, appState? })`
  - `api.getSceneElements()`, `api.getAppState()`
  - `api.scrollToContent(target, { fitToContent: true, animate: true })`
  - Zoom lives at `appState.zoom.value` (branded `NormalizedZoomValue`); set via `updateScene({ appState: { zoom: { value } } })`.
  - Grid: `appState.gridModeEnabled: boolean`.
  - Open built-in shortcuts dialog: `updateScene({ appState: { openDialog: { name: "help" } } })`.
- **About links:** Excalidraw fork `https://github.com/bobtherobot/excalidraw`; flow repo is a clearly-marked **placeholder** constant `FLOW_REPO_URL = "https://github.com/REPLACE-ME/flow"`.

---

## File Structure

```
NEW  src/lib/view-actions.ts          zoom in/out/fit/reset, toggle grid (pure, take API)
NEW  src/app/preferences.ts           localStorage-backed sloppiness get/set
NEW  src/ui/menubar/MenuBar.tsx       Radix menubar: File / View / Help
NEW  src/ui/menubar/menubar.css       --flow-* tokens + menu styling
NEW  src/ui/PreferencesDialog.tsx     General (sloppiness) + Keyboard (show shortcuts)
NEW  src/ui/AboutDialog.tsx           fork description + two repo links
EDIT src/lib/roughness.ts             Sloppiness type/labels + target param (additive)
EDIT src/lib/excalidraw-scene.ts      ImageFormat type; applyContentsToScene(target)
EDIT src/App.tsx                       state, layout inset, mount bar + dialogs, wiring
EDIT src/index.css                     hide Excalidraw hamburger; keep sloppiness hide
DEL  src/app/CustomMenu.tsx            replaced by MenuBar
NEW  tests alongside each module
DEP  @radix-ui/react-menubar
```

---

## Task 1: Sloppiness model + preferences store

**Files:**
- Modify: `src/lib/roughness.ts`
- Test: `src/lib/roughness.test.ts` (extend existing)
- Create: `src/app/preferences.ts`
- Test: `src/app/preferences.test.ts`

**Interfaces:**
- Produces:
  - `type Sloppiness = 0 | 1 | 2`
  - `const DEFAULT_SLOPPINESS: Sloppiness` (= 0)
  - `const SLOPPINESS_LABELS: Record<Sloppiness, string>` (`{0:"Architect",1:"Artist",2:"Cartoonist"}`)
  - `function isSloppiness(v: unknown): v is Sloppiness`
  - `function normalizeRoughness<T extends { roughness?: number }>(elements: readonly T[], target?: Sloppiness): T[]` (target defaults to `DEFAULT_SLOPPINESS` — additive, existing single-arg callers keep working)
  - `getSloppiness(): Sloppiness`, `setSloppiness(value: Sloppiness): void`
- Consumes: nothing (leaf modules).

- [ ] **Step 1: Extend the failing tests in `src/lib/roughness.test.ts`**

Append these cases inside the existing `describe("normalizeRoughness", ...)` block, and add a new `describe` for `isSloppiness`. Add the import for `isSloppiness` and `Sloppiness` at the top.

```ts
// add to imports at top:
import { normalizeRoughness, isSloppiness } from "./roughness";

// add inside describe("normalizeRoughness", ...):
it("normalizes up to Artist (1) when target is 1", () => {
  const input = [
    { id: "a", roughness: 0 },
    { id: "b", roughness: 2 },
  ];
  const result = normalizeRoughness(input, 1);
  expect(result.map((el) => el.roughness)).toEqual([1, 1]);
});

it("returns elements already at the target untouched by identity", () => {
  const clean = { id: "a", roughness: 2 };
  const result = normalizeRoughness([clean], 2);
  expect(result[0]).toBe(clean);
});

it("defaults the target to Architect (0) when omitted", () => {
  const input = [{ id: "a", roughness: 2 }];
  expect(normalizeRoughness(input)[0].roughness).toBe(0);
});
```

```ts
// add as a new top-level describe:
describe("isSloppiness", () => {
  it("accepts 0, 1, 2", () => {
    expect(isSloppiness(0)).toBe(true);
    expect(isSloppiness(1)).toBe(true);
    expect(isSloppiness(2)).toBe(true);
  });
  it("rejects other numbers and non-numbers", () => {
    expect(isSloppiness(3)).toBe(false);
    expect(isSloppiness(-1)).toBe(false);
    expect(isSloppiness("1")).toBe(false);
    expect(isSloppiness(null)).toBe(false);
    expect(isSloppiness(NaN)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/roughness.test.ts`
Expected: FAIL — `isSloppiness is not a function` / target arg not honored.

- [ ] **Step 3: Rewrite `src/lib/roughness.ts`**

```ts
/**
 * Sloppiness enforcement, kept free of Excalidraw imports so it can be unit
 * tested in isolation. Excalidraw's roughness scale is 0=Architect, 1=Artist,
 * 2=Cartoonist. flow controls sloppiness globally (app-wide), not per element.
 */

/** Excalidraw roughness values, named. */
export type Sloppiness = 0 | 1 | 2;

export const SLOPPINESS_ARCHITECT: Sloppiness = 0;
export const SLOPPINESS_ARTIST: Sloppiness = 1;
export const SLOPPINESS_CARTOONIST: Sloppiness = 2;

/** App default when no preference is stored. */
export const DEFAULT_SLOPPINESS: Sloppiness = SLOPPINESS_ARCHITECT;

/** Kept for existing call sites; identical to the Architect value. */
export const ARCHITECT_ROUGHNESS = SLOPPINESS_ARCHITECT;

export const SLOPPINESS_LABELS: Record<Sloppiness, string> = {
  0: "Architect",
  1: "Artist",
  2: "Cartoonist",
};

/** Ordered for rendering a control (crisp → sketchy). */
export const SLOPPINESS_ORDER: readonly Sloppiness[] = [0, 1, 2];

export function isSloppiness(value: unknown): value is Sloppiness {
  return value === 0 || value === 1 || value === 2;
}

/**
 * Force every element to `target` sloppiness, returning new objects only where
 * a change is needed. Elements already at `target` are passed through by
 * identity to avoid needless churn. `target` defaults to Architect.
 */
export function normalizeRoughness<T extends { roughness?: number }>(
  elements: readonly T[],
  target: Sloppiness = DEFAULT_SLOPPINESS,
): T[] {
  return elements.map((el) =>
    el.roughness === target ? el : { ...el, roughness: target },
  );
}
```

- [ ] **Step 4: Run roughness tests to verify they pass**

Run: `npm test -- src/lib/roughness.test.ts`
Expected: PASS (all cases, including the pre-existing ones).

- [ ] **Step 5: Write the failing test `src/app/preferences.test.ts`**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getSloppiness, setSloppiness } from "./preferences";

describe("sloppiness preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to Architect (0) when unset", () => {
    expect(getSloppiness()).toBe(0);
  });

  it("round-trips a set value", () => {
    setSloppiness(2);
    expect(getSloppiness()).toBe(2);
  });

  it("falls back to the default on a corrupt stored value", () => {
    localStorage.setItem("flow.sloppiness", "banana");
    expect(getSloppiness()).toBe(0);
  });

  it("falls back to the default on an out-of-range stored value", () => {
    localStorage.setItem("flow.sloppiness", "7");
    expect(getSloppiness()).toBe(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- src/app/preferences.test.ts`
Expected: FAIL — module `./preferences` not found.

- [ ] **Step 7: Create `src/app/preferences.ts`**

```ts
import { DEFAULT_SLOPPINESS, isSloppiness, type Sloppiness } from "../lib/roughness";

const SLOPPINESS_KEY = "flow.sloppiness";

/** Read the app-wide sloppiness preference, falling back to the default. */
export function getSloppiness(): Sloppiness {
  try {
    const raw = localStorage.getItem(SLOPPINESS_KEY);
    if (raw === null) return DEFAULT_SLOPPINESS;
    const value = Number(raw);
    return isSloppiness(value) ? value : DEFAULT_SLOPPINESS;
  } catch {
    // localStorage can throw (private mode / disabled). Degrade to default.
    return DEFAULT_SLOPPINESS;
  }
}

/** Persist the app-wide sloppiness preference. */
export function setSloppiness(value: Sloppiness): void {
  try {
    localStorage.setItem(SLOPPINESS_KEY, String(value));
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
```

- [ ] **Step 8: Run preferences tests to verify they pass**

Run: `npm test -- src/app/preferences.test.ts`
Expected: PASS.

- [ ] **Step 9: Full test + typecheck**

Run: `npm test && npm run typecheck`
Expected: all green (existing App still compiles — `normalizeRoughness` remained backward-compatible).

- [ ] **Step 10: Commit**

```bash
git add src/lib/roughness.ts src/lib/roughness.test.ts src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat: generalize sloppiness model + app-wide preference store"
```

---

## Task 2: View-menu actions (zoom + grid)

**Files:**
- Create: `src/lib/view-actions.ts`
- Test: `src/lib/view-actions.test.ts`

**Interfaces:**
- Consumes: `ExcalidrawAPI` from `src/lib/excalidraw-scene.ts`.
- Produces: `zoomIn(api)`, `zoomOut(api)`, `resetZoom(api)`, `zoomToFit(api)`, `toggleGrid(api)` — each `(api: ExcalidrawAPI) => void`.

- [ ] **Step 1: Write the failing test `src/lib/view-actions.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { zoomIn, zoomOut, resetZoom, zoomToFit, toggleGrid } from "./view-actions";

function mockApi(state: { zoom?: number; grid?: boolean } = {}) {
  const updateScene = vi.fn();
  const scrollToContent = vi.fn();
  const api = {
    updateScene,
    scrollToContent,
    getSceneElements: () => [] as unknown[],
    getAppState: () => ({
      zoom: { value: state.zoom ?? 1 },
      gridModeEnabled: state.grid ?? false,
    }),
  };
  // Cast: the real ExcalidrawAPI has many more members we don't exercise here.
  return { api: api as never, updateScene, scrollToContent };
}

describe("view-actions", () => {
  it("zoomIn multiplies the zoom by 1.1", () => {
    const { api, updateScene } = mockApi({ zoom: 1 });
    zoomIn(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 1.1 } } });
  });

  it("zoomOut divides the zoom by 1.1", () => {
    const { api, updateScene } = mockApi({ zoom: 1.1 });
    zoomOut(api);
    const arg = updateScene.mock.calls[0][0];
    expect(arg.appState.zoom.value).toBeCloseTo(1);
  });

  it("clamps zoom to a max of 30", () => {
    const { api, updateScene } = mockApi({ zoom: 30 });
    zoomIn(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 30 } } });
  });

  it("clamps zoom to a min of 0.1", () => {
    const { api, updateScene } = mockApi({ zoom: 0.1 });
    zoomOut(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 0.1 } } });
  });

  it("resetZoom sets zoom to 1", () => {
    const { api, updateScene } = mockApi({ zoom: 3 });
    resetZoom(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { zoom: { value: 1 } } });
  });

  it("zoomToFit scrolls to content with fitToContent", () => {
    const { api, scrollToContent } = mockApi();
    zoomToFit(api);
    expect(scrollToContent).toHaveBeenCalledWith([], { fitToContent: true, animate: true });
  });

  it("toggleGrid flips gridModeEnabled", () => {
    const { api, updateScene } = mockApi({ grid: false });
    toggleGrid(api);
    expect(updateScene).toHaveBeenCalledWith({ appState: { gridModeEnabled: true } });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/lib/view-actions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/view-actions.ts`**

```ts
import type { ExcalidrawAPI } from "./excalidraw-scene";

/** Excalidraw's branded zoom object; we only ever set `.value`. */
type Zoom = ReturnType<ExcalidrawAPI["getAppState"]>["zoom"];

const ZOOM_STEP = 1.1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

function setZoom(api: ExcalidrawAPI, value: number): void {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  api.updateScene({ appState: { zoom: { value: clamped } as Zoom } });
}

export function zoomIn(api: ExcalidrawAPI): void {
  setZoom(api, api.getAppState().zoom.value * ZOOM_STEP);
}

export function zoomOut(api: ExcalidrawAPI): void {
  setZoom(api, api.getAppState().zoom.value / ZOOM_STEP);
}

export function resetZoom(api: ExcalidrawAPI): void {
  setZoom(api, 1);
}

export function zoomToFit(api: ExcalidrawAPI): void {
  api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: true });
}

export function toggleGrid(api: ExcalidrawAPI): void {
  api.updateScene({ appState: { gridModeEnabled: !api.getAppState().gridModeEnabled } });
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npm test -- src/lib/view-actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/view-actions.ts src/lib/view-actions.test.ts
git commit -m "feat: view-menu zoom and grid actions"
```

---

## Task 3: Menu bar component + styling (Radix)

**Files:**
- Add dependency: `@radix-ui/react-menubar`
- Modify: `src/lib/excalidraw-scene.ts` (add `ImageFormat` type)
- Create: `src/ui/menubar/menubar.css`
- Create: `src/ui/menubar/MenuBar.tsx`
- Test: `src/ui/menubar/MenuBar.test.tsx`

**Interfaces:**
- Consumes: `ImageFormat` (moved to `excalidraw-scene.ts`).
- Produces: `export type ImageFormat = "png" | "svg" | "jpg"`; `MenuBar` component with props:
  ```ts
  interface MenuBarProps {
    onNew: () => void;
    onOpen: () => void;
    onSave: () => void;
    onExport: (format: ImageFormat) => void;
    onPreferences: () => void;
    onClearCanvas: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomToFit: () => void;
    onResetZoom: () => void;
    onToggleGrid: () => void;
    onAbout: () => void;
  }
  ```

- [ ] **Step 1: Install Radix menubar**

Run: `npm install @radix-ui/react-menubar`
Expected: adds `@radix-ui/react-menubar` to `dependencies`. Confirm `node_modules/@radix-ui/react-menubar` exists.

- [ ] **Step 2: Add `ImageFormat` to `src/lib/excalidraw-scene.ts`**

Add near the top, after the `ExcalidrawAPI` type export:

```ts
/** Raster/vector formats flow can export the canvas to. */
export type ImageFormat = "png" | "svg" | "jpg";
```

- [ ] **Step 3: Create `src/ui/menubar/menubar.css`**

```css
/* "Quiet system chrome" — a flat desktop menu bar that recedes at rest and
   borrows Excalidraw's indigo for interactive states. Tokens namespaced
   --flow-* so they never collide with Excalidraw's --color-*. */
:root {
  --flow-menubar-bg: #ffffff;
  --flow-panel-bg: #ffffff;
  --flow-ink: #2b2b33;
  --flow-ink-muted: #76767f;
  --flow-ink-disabled: #c2c2ca;
  --flow-accent: #6965db;
  --flow-hover: #f1f0fb;
  --flow-active: #e8e7fb;
  --flow-active-strong: #dcdaf6;
  --flow-border: #e9e9ed;
  --flow-shadow: 0 4px 16px rgba(43, 43, 51, 0.12), 0 1px 3px rgba(43, 43, 51, 0.08);
  --flow-menubar-h: 36px;
  --flow-label-h: 28px;
  --flow-item-h: 30px;
  --flow-panel-minw: 200px;
  --flow-radius-sm: 5px;
  --flow-radius-md: 8px;
  --flow-pad-x: 10px;
  --flow-panel-pad: 4px;
  --flow-fs-label: 13px;
  --flow-fs-item: 13px;
  --flow-fs-shortcut: 12px;
  --flow-dur-fast: 90ms;
  --flow-dur-panel: 120ms;
  --flow-ease: cubic-bezier(0.2, 0, 0, 1);
  --flow-font: "Nunito", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}

.flow-menubar {
  position: fixed;
  inset: 0 0 auto 0;
  height: var(--flow-menubar-h);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 8px;
  background: var(--flow-menubar-bg);
  border-bottom: 1px solid var(--flow-border);
  font-family: var(--flow-font);
  z-index: 100;
  user-select: none;
}

.flow-menubar__trigger {
  height: var(--flow-label-h);
  padding: 0 var(--flow-pad-x);
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  border-radius: var(--flow-radius-sm);
  font-family: inherit;
  font-size: var(--flow-fs-label);
  font-weight: 600;
  color: var(--flow-ink);
  cursor: default;
  transition: background var(--flow-dur-fast) var(--flow-ease);
}
.flow-menubar__trigger:hover {
  background: var(--flow-hover);
}
.flow-menubar__trigger[data-state="open"] {
  background: var(--flow-active);
  color: var(--flow-accent);
}
.flow-menubar__trigger:focus-visible {
  outline: 2px solid var(--flow-accent);
  outline-offset: -2px;
}

.flow-menu {
  min-width: var(--flow-panel-minw);
  background: var(--flow-panel-bg);
  border: 1px solid var(--flow-border);
  border-radius: var(--flow-radius-md);
  box-shadow: var(--flow-shadow);
  padding: var(--flow-panel-pad);
  font-family: var(--flow-font);
  z-index: 100;
  animation: flow-menu-in var(--flow-dur-panel) var(--flow-ease);
}
@keyframes flow-menu-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .flow-menu { animation: none; }
}

.flow-menu__item {
  height: var(--flow-item-h);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 var(--flow-pad-x);
  border-radius: var(--flow-radius-sm);
  font-size: var(--flow-fs-item);
  font-weight: 500;
  color: var(--flow-ink);
  cursor: default;
  outline: none;
  user-select: none;
}
.flow-menu__item[data-highlighted] {
  background: var(--flow-active);
  color: var(--flow-accent);
}
.flow-menu__item[data-disabled] {
  color: var(--flow-ink-disabled);
  pointer-events: none;
}

.flow-menu__shortcut {
  margin-left: auto;
  font-size: var(--flow-fs-shortcut);
  color: var(--flow-ink-muted);
}
.flow-menu__item[data-highlighted] .flow-menu__shortcut {
  color: var(--flow-accent);
  opacity: 0.7;
}
.flow-menu__chevron {
  margin-left: auto;
  font-size: var(--flow-fs-shortcut);
  color: var(--flow-ink-muted);
}
.flow-menu__item[data-highlighted] .flow-menu__chevron {
  color: var(--flow-accent);
}

.flow-menu__sep {
  height: 1px;
  margin: 4px 8px;
  background: var(--flow-border);
}
```

- [ ] **Step 4: Create `src/ui/menubar/MenuBar.tsx`**

```tsx
import * as Menubar from "@radix-ui/react-menubar";
import type { ImageFormat } from "../../lib/excalidraw-scene";
import "./menubar.css";

export interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: (format: ImageFormat) => void;
  onPreferences: () => void;
  onClearCanvas: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  onAbout: () => void;
}

const contentProps = { align: "start", sideOffset: 4, className: "flow-menu" } as const;

/**
 * Traditional desktop menu bar (File / View / Help). Radix supplies the
 * WAI-ARIA menubar behavior (roving focus, arrow keys, typeahead, submenu
 * flyout); every action is delegated to a callback owned by App.
 */
export function MenuBar(props: MenuBarProps) {
  return (
    <Menubar.Root className="flow-menubar" aria-label="Application menu">
      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">File</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onNew}>
              New
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onOpen}>
              Open…
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onSave}>
              Save…
            </Menubar.Item>
            <Menubar.Sub>
              <Menubar.SubTrigger className="flow-menu__item">
                Export
                <span className="flow-menu__chevron" aria-hidden="true">›</span>
              </Menubar.SubTrigger>
              <Menubar.Portal>
                <Menubar.SubContent className="flow-menu">
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("png")}>
                    PNG
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("svg")}>
                    SVG
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("jpg")}>
                    JPG
                  </Menubar.Item>
                </Menubar.SubContent>
              </Menubar.Portal>
            </Menubar.Sub>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onPreferences}>
              Preferences…
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onClearCanvas}>
              Clear Canvas
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">View</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomIn}>
              Zoom In
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomOut}>
              Zoom Out
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomToFit}>
              Zoom to Fit
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onResetZoom}>
              Reset Zoom
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onToggleGrid}>
              Toggle Grid
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">Help</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onAbout}>
              About flow…
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
    </Menubar.Root>
  );
}
```

- [ ] **Step 5: Write the render test `src/ui/menubar/MenuBar.test.tsx`**

Radix menu *content* is portalled and relies on real pointer/layout APIs that jsdom lacks, so open/click flows are covered in Playwright (Task 6). Here we assert the bar and its top-level triggers render — a cheap, non-brittle smoke test.

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MenuBar } from "./MenuBar";

const noop = () => {};
const props = {
  onNew: noop, onOpen: noop, onSave: noop, onExport: noop, onPreferences: noop,
  onClearCanvas: noop, onZoomIn: noop, onZoomOut: noop, onZoomToFit: noop,
  onResetZoom: noop, onToggleGrid: noop, onAbout: noop,
};

describe("MenuBar", () => {
  it("renders File, View, and Help triggers", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
  });

  it("exposes an accessible menubar", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menubar", { name: "Application menu" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test**

Run: `npm test -- src/ui/menubar/MenuBar.test.tsx`
Expected: PASS. (If `toBeInTheDocument` is unavailable, confirm `src/test/setup.ts` imports `@testing-library/jest-dom` — it already does per the existing dialog tests.)

- [ ] **Step 7: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/lib/excalidraw-scene.ts src/ui/menubar/
git commit -m "feat: Radix desktop menu bar (File/View/Help) with quiet-chrome styling"
```

---

## Task 4: Preferences + About dialogs

**Files:**
- Create: `src/ui/PreferencesDialog.tsx`
- Test: `src/ui/PreferencesDialog.test.tsx`
- Create: `src/ui/AboutDialog.tsx`
- Test: `src/ui/AboutDialog.test.tsx`

**Interfaces:**
- Consumes: `Sloppiness`, `SLOPPINESS_LABELS`, `SLOPPINESS_ORDER` from `src/lib/roughness.ts`.
- Produces:
  ```ts
  interface PreferencesDialogProps {
    sloppiness: Sloppiness;
    onChangeSloppiness: (value: Sloppiness) => void;
    onShowShortcuts: () => void;
    onClose: () => void;
  }
  interface AboutDialogProps {
    appName: string;
    onClose: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test `src/ui/PreferencesDialog.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesDialog } from "./PreferencesDialog";

function setup(overrides = {}) {
  const onChangeSloppiness = vi.fn();
  const onShowShortcuts = vi.fn();
  const onClose = vi.fn();
  render(
    <PreferencesDialog
      sloppiness={0}
      onChangeSloppiness={onChangeSloppiness}
      onShowShortcuts={onShowShortcuts}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { onChangeSloppiness, onShowShortcuts, onClose };
}

describe("PreferencesDialog", () => {
  it("shows the General category with sloppiness options", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Architect" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Artist" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cartoonist" })).toBeInTheDocument();
  });

  it("fires onChangeSloppiness with the selected value", async () => {
    const { onChangeSloppiness } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Cartoonist" }));
    expect(onChangeSloppiness).toHaveBeenCalledWith(2);
  });

  it("switches to the Keyboard category and fires onShowShortcuts", async () => {
    const { onShowShortcuts } = setup();
    await userEvent.click(screen.getByRole("tab", { name: "Keyboard" }));
    await userEvent.click(screen.getByRole("button", { name: /show keyboard shortcuts/i }));
    expect(onShowShortcuts).toHaveBeenCalled();
  });

  it("closes on the Done button", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- src/ui/PreferencesDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/ui/PreferencesDialog.tsx`**

```tsx
import { useId, useState } from "react";
import {
  SLOPPINESS_LABELS,
  SLOPPINESS_ORDER,
  type Sloppiness,
} from "../lib/roughness";
import "./dialogs.css";
import "./preferences-dialog.css";

export interface PreferencesDialogProps {
  sloppiness: Sloppiness;
  onChangeSloppiness: (value: Sloppiness) => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}

type Category = "general" | "keyboard";

export function PreferencesDialog({
  sloppiness,
  onChangeSloppiness,
  onShowShortcuts,
  onClose,
}: PreferencesDialogProps) {
  const [category, setCategory] = useState<Category>("general");
  const titleId = useId();

  return (
    <div
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flow-dialog flow-prefs"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            Preferences
          </h2>
        </div>

        <div className="flow-prefs__body">
          <nav className="flow-prefs__nav" role="tablist" aria-label="Preferences categories">
            <button
              type="button"
              role="tab"
              aria-selected={category === "general"}
              className="flow-prefs__tab"
              onClick={() => setCategory("general")}
            >
              General
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={category === "keyboard"}
              className="flow-prefs__tab"
              onClick={() => setCategory("keyboard")}
            >
              Keyboard
            </button>
          </nav>

          <div className="flow-prefs__panel">
            {category === "general" && (
              <fieldset className="flow-choice" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#4a5163",
                    marginBottom: "0.375rem",
                  }}
                >
                  Sloppiness
                </legend>
                {SLOPPINESS_ORDER.map((value) => (
                  <label className="flow-option" key={value}>
                    <input
                      type="radio"
                      name="sloppiness"
                      checked={sloppiness === value}
                      onChange={() => onChangeSloppiness(value)}
                    />
                    <span className="flow-option__label">{SLOPPINESS_LABELS[value]}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {category === "keyboard" && (
              <div className="flow-prefs__keyboard">
                <p className="flow-prefs__hint">
                  View the current keyboard shortcuts. Editing shortcuts is coming
                  in a future update.
                </p>
                <button
                  type="button"
                  className="flow-btn flow-btn--ghost"
                  onClick={onShowShortcuts}
                >
                  Show keyboard shortcuts
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/ui/preferences-dialog.css`**

```css
/* Preferences gets a wider dialog with a left category rail. */
.flow-prefs {
  width: min(560px, 100%);
}
.flow-prefs__body {
  display: grid;
  grid-template-columns: 140px 1fr;
  min-height: 220px;
}
.flow-prefs__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0.75rem 0.5rem;
  border-right: 1px solid #eef0f5;
  background: #fbfcfe;
}
.flow-prefs__tab {
  text-align: left;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  color: #4a5163;
  padding: 0.5rem 0.625rem;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.flow-prefs__tab:hover {
  background: #eef0f5;
}
.flow-prefs__tab[aria-selected="true"] {
  background: color-mix(in oklab, #6366f1 10%, #ffffff);
  color: #4338ca;
}
.flow-prefs__panel {
  padding: 1rem 1.25rem;
}
.flow-prefs__keyboard {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: flex-start;
}
.flow-prefs__hint {
  margin: 0;
  font-size: 0.8125rem;
  color: #6b7280;
  line-height: 1.4;
}
```

- [ ] **Step 5: Run the Preferences test**

Run: `npm test -- src/ui/PreferencesDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing test `src/ui/AboutDialog.test.tsx`**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutDialog, FLOW_REPO_URL, EXCALIDRAW_FORK_URL } from "./AboutDialog";

describe("AboutDialog", () => {
  it("names the app and explains the fork", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByText(/forked/i)).toBeInTheDocument();
  });

  it("links to both repos safely", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    const flowLink = screen.getByRole("link", { name: /flow repository/i });
    const forkLink = screen.getByRole("link", { name: /excalidraw fork/i });
    expect(flowLink).toHaveAttribute("href", FLOW_REPO_URL);
    expect(forkLink).toHaveAttribute("href", EXCALIDRAW_FORK_URL);
    for (const link of [flowLink, forkLink]) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("closes on the Close button", async () => {
    const onClose = vi.fn();
    render(<AboutDialog appName="Flow" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- src/ui/AboutDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 8: Create `src/ui/AboutDialog.tsx`**

```tsx
import { useId } from "react";
import "./dialogs.css";

/** Placeholder — replace with the real flow repository URL once it is public. */
export const FLOW_REPO_URL = "https://github.com/REPLACE-ME/flow";
export const EXCALIDRAW_FORK_URL = "https://github.com/bobtherobot/excalidraw";

export interface AboutDialogProps {
  appName: string;
  onClose: () => void;
}

export function AboutDialog({ appName, onClose }: AboutDialogProps) {
  const titleId = useId();
  return (
    <div
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flow-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            About {appName}
          </h2>
        </div>
        <div className="flow-dialog__body">
          <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>
            {appName} is a standalone drawing app built on a <strong>forked</strong>{" "}
            build of Excalidraw.
          </p>
          <p style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <a href={FLOW_REPO_URL} target="_blank" rel="noopener noreferrer">
              flow repository
            </a>
            <a href={EXCALIDRAW_FORK_URL} target="_blank" rel="noopener noreferrer">
              Excalidraw fork
            </a>
          </p>
        </div>
        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the About test**

Run: `npm test -- src/ui/AboutDialog.test.tsx`
Expected: PASS.

- [ ] **Step 10: Typecheck + full test run**

Run: `npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 11: Commit**

```bash
git add src/ui/PreferencesDialog.tsx src/ui/PreferencesDialog.test.tsx src/ui/preferences-dialog.css src/ui/AboutDialog.tsx src/ui/AboutDialog.test.tsx
git commit -m "feat: Preferences (global sloppiness) and About dialogs"
```

---

## Task 5: Wire everything into App + layout + remove CustomMenu

**Files:**
- Modify: `src/lib/excalidraw-scene.ts` (`applyContentsToScene` gains a `target` param)
- Modify: `src/App.tsx`
- Modify: `src/index.css`
- Delete: `src/app/CustomMenu.tsx`

**Interfaces:**
- Consumes: `MenuBar`, `PreferencesDialog`, `AboutDialog`, `getSloppiness`/`setSloppiness`, view-actions, `normalizeRoughness`, `Sloppiness`, `ImageFormat`.
- Produces: the assembled app. No new exported API.

- [ ] **Step 1: Update `applyContentsToScene` in `src/lib/excalidraw-scene.ts`**

Change the signature and body to take a sloppiness target (default keeps current behavior). Also update the import from `./roughness` to pull `DEFAULT_SLOPPINESS` and `Sloppiness`.

```ts
// update the import line near the top:
import { normalizeRoughness, DEFAULT_SLOPPINESS, type Sloppiness } from "./roughness";
// keep the re-export line working — replace it with:
export { ARCHITECT_ROUGHNESS, normalizeRoughness } from "./roughness";
```

```ts
/** Load a `.excalidraw` JSON string onto the canvas, replacing current content.
 *  Imported elements are normalized to the app-wide sloppiness `target`. */
export async function applyContentsToScene(
  api: ExcalidrawAPI,
  contents: string,
  target: Sloppiness = DEFAULT_SLOPPINESS,
): Promise<void> {
  const blob = new Blob([contents], { type: "application/json" });
  const scene = await loadFromBlob(blob, null, null);
  api.updateScene({
    elements: normalizeRoughness(scene.elements, target),
    appState: { ...scene.appState, currentItemRoughness: target },
  });
  if (scene.files) {
    api.addFiles(Object.values(scene.files));
  }
}
```

- [ ] **Step 2: Rewrite `src/App.tsx`**

Full file (replaces the current one). Key changes: sloppiness state + ref, MenuBar mount, `--flow-menubar-h` top inset on the Excalidraw wrapper, Preferences/About dialogs, view-action wiring, New/Clear handlers, and passing the sloppiness target into normalization.

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { Excalidraw, FONT_FAMILY } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { loadConfig } from "./app/config";
import { getSloppiness, setSloppiness } from "./app/preferences";
import { IndexedDbProvider } from "./storage/indexeddb-provider";
import type { DocumentSummary } from "./storage/types";
import { downloadFile, openLocalFile } from "./storage/local-file-provider";
import {
  applyContentsToScene,
  exportJpg,
  exportPng,
  exportSvgString,
  normalizeRoughness,
  serializeScene,
  type ExcalidrawAPI,
  type ImageFormat,
} from "./lib/excalidraw-scene";
import { type Sloppiness } from "./lib/roughness";
import {
  resetZoom,
  toggleGrid,
  zoomIn,
  zoomOut,
  zoomToFit,
} from "./lib/view-actions";
import { ensureExtension, stripExtension } from "./lib/filename";
import { MenuBar } from "./ui/menubar/MenuBar";
import { SaveDialog } from "./ui/SaveDialog";
import { OpenDialog } from "./ui/OpenDialog";
import { PreferencesDialog } from "./ui/PreferencesDialog";
import { AboutDialog } from "./ui/AboutDialog";
import type { SaveDestination } from "./ui/dialog-types";

const AUTOSAVE_DELAY_MS = 800;

/** The element list Excalidraw hands `onChange` on every scene update. */
type SceneChangeElements = Parameters<
  NonNullable<ComponentProps<typeof Excalidraw>["onChange"]>
>[0];

export default function App() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const provider = useMemo(() => new IndexedDbProvider(), []);

  const [currentId, setCurrentId] = useState<string | undefined>(undefined);
  const [currentName, setCurrentName] = useState("Untitled");
  const [saveOpen, setSaveOpen] = useState(false);
  const [openOpen, setOpenOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [internalDocs, setInternalDocs] = useState<DocumentSummary[]>([]);
  const [appName, setAppName] = useState("Flow");

  // App-wide sloppiness preference. `sloppinessRef` mirrors it so the stable
  // onChange handler and async import paths read the current value without
  // stale closures or re-registering the Excalidraw onChange prop.
  const [sloppiness, setSloppinessState] = useState<Sloppiness>(() => getSloppiness());
  const sloppinessRef = useRef(sloppiness);
  sloppinessRef.current = sloppiness;

  // Google Drive is wired in a later phase; sign-in is not available yet.
  const isGoogleConnected = false;
  const googleComingSoon = () =>
    window.alert("Google Drive sync arrives in a later phase.");

  useEffect(() => {
    loadConfig().then((c) => {
      setAppName(c.appName);
      document.title = c.appName;
    });
  }, []);

  // Debounced auto-save of the working document to IndexedDB.
  const autosaveTimer = useRef<number | null>(null);
  const handleChange = useCallback((elements: SceneChangeElements) => {
    // New elements draw at the preference and imports are normalized on load;
    // this only catches stray pasted foreign elements. Cheap scan, and
    // updateScene runs only when a stray exists, so it can't loop.
    const target = sloppinessRef.current;
    if (elements.some((el) => el.roughness !== target)) {
      apiRef.current?.updateScene({ elements: normalizeRoughness(elements, target) });
    }

    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(async () => {
      const api = apiRef.current;
      if (!api) return;
      if (api.getSceneElements().length === 0 && !currentId) return;
      const saved = await provider.save({
        id: currentId,
        name: currentName,
        contents: serializeScene(api),
      });
      if (!currentId) setCurrentId(saved.id);
    }, AUTOSAVE_DELAY_MS);
  }, [provider, currentId, currentName]);

  const openSaveDialog = useCallback(() => setSaveOpen(true), []);
  const openOpenDialog = useCallback(async () => {
    setInternalDocs(await provider.list());
    setOpenOpen(true);
  }, [provider]);

  const handleSave = useCallback(
    async ({ name, destination }: { name: string; destination: SaveDestination }) => {
      setSaveOpen(false);
      const api = apiRef.current;
      if (!api) return;
      const contents = serializeScene(api);

      if (destination === "download") {
        downloadFile(ensureExtension(name, "excalidraw"), contents);
      } else if (destination === "internal") {
        const saved = await provider.save({ id: currentId, name, contents });
        setCurrentId(saved.id);
        setCurrentName(name);
      } else {
        googleComingSoon();
      }
    },
    [provider, currentId],
  );

  const handleOpenInternal = useCallback(
    async (id: string) => {
      setOpenOpen(false);
      const api = apiRef.current;
      if (!api) return;
      const doc = await provider.load(id);
      if (!doc) return;
      await applyContentsToScene(api, doc.contents, sloppinessRef.current);
      setCurrentId(doc.id);
      setCurrentName(doc.name);
    },
    [provider],
  );

  const handleOpenLocal = useCallback(async () => {
    setOpenOpen(false);
    const api = apiRef.current;
    if (!api) return;
    const file = await openLocalFile();
    if (!file) return;
    await applyContentsToScene(api, file.contents, sloppinessRef.current);
    setCurrentId(undefined);
    setCurrentName(stripExtension(file.name, "excalidraw"));
  }, []);

  const handleExport = useCallback(
    async (format: ImageFormat) => {
      const api = apiRef.current;
      if (!api) return;
      if (format === "svg") {
        downloadFile(ensureExtension(currentName, "svg"), await exportSvgString(api), "image/svg+xml");
      } else if (format === "png") {
        downloadFile(ensureExtension(currentName, "png"), await exportPng(api), "image/png");
      } else {
        downloadFile(ensureExtension(currentName, "jpg"), await exportJpg(api), "image/jpeg");
      }
    },
    [currentName],
  );

  const handleNew = useCallback(() => {
    apiRef.current?.resetScene();
    setCurrentId(undefined);
    setCurrentName("Untitled");
  }, []);

  const handleClearCanvas = useCallback(() => {
    apiRef.current?.updateScene({ elements: [] });
  }, []);

  const handleChangeSloppiness = useCallback((next: Sloppiness) => {
    setSloppinessState(next);
    setSloppiness(next);
    const api = apiRef.current;
    if (!api) return;
    api.updateScene({
      elements: normalizeRoughness(api.getSceneElements(), next),
      appState: { currentItemRoughness: next },
    });
  }, []);

  const handleShowShortcuts = useCallback(() => {
    setPrefsOpen(false);
    apiRef.current?.updateScene({ appState: { openDialog: { name: "help" } } });
  }, []);

  const withApi = (fn: (api: ExcalidrawAPI) => void) => () => {
    const api = apiRef.current;
    if (api) fn(api);
  };

  return (
    <div style={{ position: "fixed", inset: 0 }} aria-label={appName}>
      <MenuBar
        onNew={handleNew}
        onOpen={openOpenDialog}
        onSave={openSaveDialog}
        onExport={handleExport}
        onPreferences={() => setPrefsOpen(true)}
        onClearCanvas={handleClearCanvas}
        onZoomIn={withApi(zoomIn)}
        onZoomOut={withApi(zoomOut)}
        onZoomToFit={withApi(zoomToFit)}
        onResetZoom={withApi(resetZoom)}
        onToggleGrid={withApi(toggleGrid)}
        onAbout={() => setAboutOpen(true)}
      />

      <div style={{ position: "fixed", inset: "var(--flow-menubar-h) 0 0 0" }}>
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          theme="light"
          onChange={handleChange}
          initialData={{
            appState: {
              currentItemRoughness: sloppiness,
              currentItemFontFamily: FONT_FAMILY.Nunito,
            },
          }}
        />
      </div>

      {saveOpen && (
        <SaveDialog
          initialName={currentName}
          isGoogleConnected={isGoogleConnected}
          onConnectGoogle={googleComingSoon}
          onCancel={() => setSaveOpen(false)}
          onSave={handleSave}
        />
      )}

      {openOpen && (
        <OpenDialog
          isGoogleConnected={isGoogleConnected}
          internalDocs={internalDocs}
          onConnectGoogle={googleComingSoon}
          onCancel={() => setOpenOpen(false)}
          onOpenInternal={handleOpenInternal}
          onOpenLocal={handleOpenLocal}
          onOpenGoogle={googleComingSoon}
        />
      )}

      {prefsOpen && (
        <PreferencesDialog
          sloppiness={sloppiness}
          onChangeSloppiness={handleChangeSloppiness}
          onShowShortcuts={handleShowShortcuts}
          onClose={() => setPrefsOpen(false)}
        />
      )}

      {aboutOpen && <AboutDialog appName={appName} onClose={() => setAboutOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 3: Update `src/index.css` — hide the Excalidraw hamburger, keep the sloppiness hide**

Append below the existing sloppiness rule:

```css
/*
 * flow provides its own File/View/Help menu bar, so Excalidraw's hamburger
 * ("main menu") button is redundant. `.dropdown-menu-button` is the stable
 * trigger class from Excalidraw's source; hiding it degrades gracefully (worst
 * case the button reappears) rather than breaking.
 */
.excalidraw .dropdown-menu-button {
  display: none;
}
```

- [ ] **Step 4: Delete `src/app/CustomMenu.tsx`**

```bash
git rm src/app/CustomMenu.tsx
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no errors. (If TS flags a leftover `CustomMenu`/`ImageFormat`/`ARCHITECT_ROUGHNESS` import, ensure `App.tsx` imports `ImageFormat` from `./lib/excalidraw-scene` and no longer references `CustomMenu`.)

- [ ] **Step 6: Run the full unit suite**

Run: `npm test`
Expected: all green.

- [ ] **Step 7: Manual smoke via dev server**

Run: `npm run dev`, open the app. Confirm: the menu bar sits across the top, the canvas + Excalidraw islands render below it (no overlap), File ▸ Preferences opens the dialog, changing sloppiness to Artist visibly re-roughens existing shapes, File ▸ Export ▸ PNG downloads, Help ▸ About shows both links, the old hamburger is gone.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/index.css src/lib/excalidraw-scene.ts
git commit -m "feat: mount desktop menu bar, wire global sloppiness + Preferences/About, drop hamburger"
```

---

## Task 6: Playwright E2E

**Files:**
- Create: `e2e/menu-preferences.spec.ts` (or the repo's existing Playwright location — check `playwright.config.*`; if none exists, create `playwright.config.ts` per this task)

**Interfaces:** none (black-box browser test).

- [ ] **Step 1: Confirm/establish the Playwright setup**

Check for an existing config: `ls playwright.config.* 2>/dev/null` and any `e2e/` or `tests/` Playwright specs. If none exists, create `playwright.config.ts`:

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:5173", trace: "on-first-retry" },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
```

Add a script to `package.json` if absent: `"test:e2e": "playwright test"`. Ensure the Chromium browser is installed: `npx playwright install chromium`.

- [ ] **Step 2: Write `e2e/menu-preferences.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

test.describe("desktop menu bar + preferences", () => {
  test("menu bar sits above the canvas", async ({ page }) => {
    await page.goto("/");
    const bar = page.getByRole("menubar", { name: "Application menu" });
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.y).toBeLessThanOrEqual(1); // pinned to the very top
  });

  test("File menu exposes Open/Save/Export/Preferences", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "File" }).click();
    await expect(page.getByRole("menuitem", { name: "Open…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Save…" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Preferences…" })).toBeVisible();
  });

  test("changing sloppiness persists across reload", async ({ page }) => {
    await page.goto("/");
    // Draw a rectangle so there is an element to restyle.
    await page.keyboard.press("r");
    await page.mouse.move(300, 300);
    await page.mouse.down();
    await page.mouse.move(460, 420);
    await page.mouse.up();

    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await page.getByRole("radio", { name: "Cartoonist" }).check();
    await page.getByRole("button", { name: "Done" }).click();

    await page.reload();
    await page.getByRole("menuitem", { name: "File" }).click();
    await page.getByRole("menuitem", { name: "Preferences…" }).click();
    await expect(page.getByRole("radio", { name: "Cartoonist" })).toBeChecked();
  });

  test("Help ▸ About shows both repo links", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("menuitem", { name: "Help" }).click();
    await page.getByRole("menuitem", { name: "About flow…" }).click();
    await expect(page.getByRole("link", { name: /flow repository/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /excalidraw fork/i })).toBeVisible();
  });
});
```

- [ ] **Step 3: Run the E2E suite**

Run: `npm run test:e2e`
Expected: all four tests PASS. If the rectangle-draw keyboard shortcut differs in this Excalidraw build, adjust the interaction (the assertion that matters is Preferences persistence, not the exact draw gesture).

- [ ] **Step 4: Commit**

```bash
git add e2e/ playwright.config.ts package.json package-lock.json
git commit -m "test: e2e for desktop menu bar, sloppiness persistence, About dialog"
```

---

## Task 7: Update project memory + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-06-desktop-menu-bar-and-preferences-design.md` (status → Implemented)
- Update the flow memory notes (outside the repo) so the sloppiness-global task is marked done and the menu-bar architecture is recorded.

- [ ] **Step 1: Flip the spec status**

Change the header `**Status:** Approved (pending spec review)` → `**Status:** Implemented (2026-07-06)`.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-06-desktop-menu-bar-and-preferences-design.md
git commit -m "docs: mark menu-bar + preferences spec implemented"
```

- [ ] **Step 3: Update memory (agent action, not a repo commit)**

Update `flow-sloppiness-global` memory: the deferred sloppiness rework is DONE — now an app-wide preference in `File ▸ Preferences ▸ General`, `localStorage` key `flow.sloppiness`, enforced via `normalizeRoughness(elements, target)`. Note the new desktop menu-bar architecture (`src/ui/menubar/`, Radix, flow-level, no fork edits) under the fork-strategy memory.

---

## Self-Review

**Spec coverage:**
- Menu bar (File/View/Help), hamburger replaced → Tasks 3, 5. ✓
- Open/Save/Export under File → Task 3 (component), Task 5 (wiring). ✓
- Preferences dialog, left-nav categories → Task 4. ✓
- Global sloppiness: type/labels, localStorage, live apply to all + new, normalize on import/paste, hidden per-object radio → Tasks 1, 4, 5. ✓
- View menu zoom/grid via public API → Task 2, wired Task 5. ✓
- Help ▸ About with two links (flow placeholder + fork) → Task 4. ✓
- Keyboard shortcuts in Preferences via `openDialog: { name: "help" }` → Tasks 4, 5. ✓
- Design tokens / quiet-chrome styling → Task 3 (`menubar.css`). ✓
- No fork edits, light theme only, app-wide persistence → Global Constraints, honored throughout. ✓
- Testing (unit/component/E2E) → Tasks 1, 2, 3, 4, 6. ✓
- Edit menu omitted → not built (correct). ✓

**Type consistency:** `Sloppiness`, `normalizeRoughness(elements, target?)`, `applyContentsToScene(api, contents, target?)`, `ImageFormat`, `MenuBarProps`, `PreferencesDialogProps`, `AboutDialogProps`, and the `getSloppiness/setSloppiness` names are used identically across tasks. `ImageFormat` moves from `CustomMenu.tsx` (deleted) to `excalidraw-scene.ts`; App and MenuBar both import it from there.

**Placeholder scan:** The only intentional placeholder is `FLOW_REPO_URL` (approved by the user) — clearly commented as such. No TBD/TODO steps; every code step contains complete code.
