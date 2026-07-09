# Laser Color Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Laser" color+opacity control to the Color sub-panel that sets a global laser-pointer trail color.

**Architecture:** flow owns the value as a persisted global preference (`localStorage["flow.laserColor"]`), seeds it into `appState.laserColor`, and a one-line fork edit makes the local laser trail read that field each frame. The Color panel reuses the existing `ColorRow` with an empty target set (always-global, never per-element) and an `onWrite` override that persists + live-updates. This mirrors the existing `bindingMode` global-preference pattern exactly.

**Tech Stack:** React + TypeScript, Vitest (unit/RTL), Playwright (e2e), forked Excalidraw consumed as a built vendor dist.

## Global Constraints

- **Fork edits are additive only.** Mirror the `bindingMode` precedent; add no new exports. (project fork strategy)
- **Fork source changes require a rebuild:** `node scripts/buildPackage.js` (yarn/tsc are Node-25-blocked; the `.d.ts` is NOT regenerated, so fork-added `appState` fields are typed flow-side via localized casts).
- **Default laser color:** `"#ff0000"` on the flow side (hex form of the fork's named `DEFAULT_LASER_COLOR = "red"`), so `splitColorAlpha` / `ColorSwatch` handle it.
- **Scene writes go through the public `updateScene` API only.** Reads come from `getAppState()`.
- **e2e gotcha:** select a tool via its flow tool-rail button (`getByRole("button", { name: ... })`); the native Excalidraw tool island is hidden by CSS.

---

### Task 1: `laser-color` value module + persistence wiring

Pure flow-side value type, validator, default, and `localStorage` get/set. No fork or build needed. Mirrors `src/lib/binding-mode.ts` + the `getBindingMode`/`setBindingMode` pair in `src/app/preferences.ts`.

**Files:**
- Create: `src/lib/laser-color.ts`
- Create: `src/lib/laser-color.test.ts`
- Modify: `src/app/preferences.ts` (add `LASER_COLOR_KEY`, `getLaserColor`, `setLaserColor`)
- Modify: `src/app/preferences.test.ts` (add laser-color round-trip tests)

**Interfaces:**
- Produces:
  - `DEFAULT_LASER_HEX: string` (= `"#ff0000"`)
  - `isLaserColor(value: unknown): value is string` (accepts `#rgb`, `#rrggbb`, `#rrggbbaa`)
  - `getLaserColor(): string`
  - `setLaserColor(color: string): void`

- [ ] **Step 1: Write the failing test for the value module**

Create `src/lib/laser-color.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { DEFAULT_LASER_HEX, isLaserColor } from "./laser-color";

describe("laser-color", () => {
  it("defaults to opaque red hex", () => {
    expect(DEFAULT_LASER_HEX).toBe("#ff0000");
  });

  it("accepts 3-, 6-, and 8-digit hex", () => {
    expect(isLaserColor("#f00")).toBe(true);
    expect(isLaserColor("#ff0000")).toBe(true);
    expect(isLaserColor("#ff000080")).toBe(true);
  });

  it("rejects non-hex or malformed values", () => {
    expect(isLaserColor("red")).toBe(false);
    expect(isLaserColor("#ff00")).toBe(false);
    expect(isLaserColor("")).toBe(false);
    expect(isLaserColor(123)).toBe(false);
    expect(isLaserColor(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/laser-color.test.ts`
Expected: FAIL — cannot find module `./laser-color`.

- [ ] **Step 3: Create the value module**

Create `src/lib/laser-color.ts`:

```ts
/** flow's global laser-pointer trail color. Written into `appState.laserColor`,
 *  which the fork's local laser trail reads each frame (see laser-trails.ts).
 *  Carried as `#rrggbb` or `#rrggbbaa` (per-color opacity), matching the other
 *  Color-panel swatches. The hex default mirrors the fork's named "red". */
export const DEFAULT_LASER_HEX = "#ff0000";

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Type guard for an unknown persisted value (a hex color string). */
export function isLaserColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}
```

- [ ] **Step 4: Run the value-module test to verify it passes**

Run: `npx vitest run src/lib/laser-color.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing persistence test**

Add to `src/app/preferences.test.ts` (new `describe`, alongside the existing ones):

```ts
import { getLaserColor, setLaserColor } from "./preferences";
import { DEFAULT_LASER_HEX } from "../lib/laser-color";

describe("laser color preference", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default when unset", () => {
    expect(getLaserColor()).toBe(DEFAULT_LASER_HEX);
  });

  it("round-trips a persisted color", () => {
    setLaserColor("#3d5afe");
    expect(getLaserColor()).toBe("#3d5afe");
  });

  it("falls back to the default on a corrupt value", () => {
    localStorage.setItem("flow.laserColor", "not-a-color");
    expect(getLaserColor()).toBe(DEFAULT_LASER_HEX);
  });
});
```

(If `beforeEach`/`describe`/`it` are not already imported at the top of `preferences.test.ts`, add them to the existing `vitest` import.)

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getLaserColor` / `setLaserColor` are not exported.

- [ ] **Step 7: Add the persistence functions**

In `src/app/preferences.ts`, add the import at the top (next to the other `../lib/*` imports):

```ts
import { DEFAULT_LASER_HEX, isLaserColor } from "../lib/laser-color";
```

Then add, next to the `BINDING_MODE_KEY` block:

```ts
const LASER_COLOR_KEY = "flow.laserColor";

/** Read the global laser-pointer color (default opaque red on miss/corrupt). */
export function getLaserColor(): string {
  try {
    const raw = localStorage.getItem(LASER_COLOR_KEY);
    return isLaserColor(raw) ? raw : DEFAULT_LASER_HEX;
  } catch {
    return DEFAULT_LASER_HEX;
  }
}

/** Persist the global laser-pointer color. */
export function setLaserColor(color: string): void {
  try {
    localStorage.setItem(LASER_COLOR_KEY, color);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `npx vitest run src/lib/laser-color.test.ts src/app/preferences.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/laser-color.ts src/lib/laser-color.test.ts src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat: add laser color preference (value module + persistence)"
```

---

### Task 2: Fork edit — make the local laser trail read `appState.laserColor`

Additive fork changes mirroring `bindingMode`, then a dist rebuild. After this task the trail is configurable at runtime even though no UI writes the field yet.

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/types.ts` (AppState interface, ~line 276)
- Modify: `vendor/excalidraw/packages/excalidraw/appState.ts` (constants import; default ~line 72; storage conf ~line 199)
- Modify: `vendor/excalidraw/packages/excalidraw/laser-trails.ts:25`

**Interfaces:**
- Consumes: `DEFAULT_LASER_COLOR` (already exported from `vendor/.../constants.ts:39`).
- Produces: runtime `app.state.laserColor` honored by the local laser trail; `AppState.laserColor?: string`.

- [ ] **Step 1: Add the AppState field**

In `vendor/excalidraw/packages/excalidraw/types.ts`, next to the existing `bindingMode?: "on" | "off" | "auto";` line, add:

```ts
  laserColor?: string; // flow: global laser-pointer trail color
```

- [ ] **Step 2: Default it in `getDefaultAppState`**

In `vendor/excalidraw/packages/excalidraw/appState.ts`:

First ensure `DEFAULT_LASER_COLOR` is imported from `./constants` — add it to the existing `from "./constants"` import if absent.

Then, directly after the `bindingMode: "auto", // flow: ...` line, add:

```ts
    laserColor: DEFAULT_LASER_COLOR, // flow: global laser-pointer color
```

- [ ] **Step 3: Mark the field flow-owned in the storage conf**

In `vendor/excalidraw/packages/excalidraw/appState.ts`, directly after the `bindingMode: { browser: false, export: false, server: false },` storage-conf entry, add:

```ts
  // flow: persistence owned by flow (localStorage flow.laserColor), re-applied on load.
  laserColor: { browser: false, export: false, server: false },
```

- [ ] **Step 4: Read the field in the local trail**

In `vendor/excalidraw/packages/excalidraw/laser-trails.ts`, change the `localTrail` fill (line 25) from:

```ts
      fill: () => DEFAULT_LASER_COLOR,
```

to:

```ts
      fill: () => this.app.state.laserColor || DEFAULT_LASER_COLOR,
```

- [ ] **Step 5: Rebuild the vendor dist**

Run: `node scripts/buildPackage.js`
Expected: build completes without error (this regenerates `vendor/excalidraw/packages/excalidraw/dist/prod/index.js`).

- [ ] **Step 6: Verify the change landed in the built dist**

Run: `grep -c "laserColor" vendor/excalidraw/packages/excalidraw/dist/prod/index.js`
Expected: a non-zero count (the field name now appears in the built output).

- [ ] **Step 7: Commit**

```bash
git add vendor/excalidraw/packages/excalidraw/types.ts vendor/excalidraw/packages/excalidraw/appState.ts vendor/excalidraw/packages/excalidraw/laser-trails.ts
git commit -m "feat(fork): local laser trail reads appState.laserColor"
```

Note: the dist is gitignored (build artifact), so only source files are committed. A fresh clone rebuilds the dist (existing project assumption).

---

### Task 3: Color-panel Laser row + write/persist wiring

Add the `onWrite` escape hatch to `ColorRow`, render the Laser row in `ColorPanel`, thread the change handler App → PanelsRoot → ColorPanel, and hold/seed/apply `laserColor` in `App` exactly like `bindingMode`.

**Files:**
- Modify: `src/ui/panels/ColorPanel.tsx` (`ColorRowProps` + `write`; `ColorPanel` prop + Laser row)
- Create: `src/ui/panels/ColorPanel.test.tsx`
- Modify: `src/ui/panels/PanelsRoot.tsx` (thread `onChangeLaserColor`)
- Modify: `src/App.tsx` (state, handler, effect, initialData seed, import)

**Interfaces:**
- Consumes: `getLaserColor`, `setLaserColor` (Task 1); `DEFAULT_LASER_HEX` (Task 1); `appState.laserColor` runtime field (Task 2).
- Produces: `ColorPanel` prop `onChangeLaserColor: (color: string) => void`; `PanelsRoot` prop `onChangeLaserColor: (color: string) => void`.

- [ ] **Step 1: Write the failing ColorPanel RTL test**

Create `src/ui/panels/ColorPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPanel } from "./ColorPanel";
import type { SelectionStyle } from "./useSelectionStyle";

/** Minimal SelectionStyle stub — empty scene, tool-default colors. */
function makeSel(overrides: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      laserColor: "#ff0000",
    } as unknown as SelectionStyle["appState"],
    selectedIds: {},
    textTargetIds: {},
    hasSelection: false,
    selectedCount: 0,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...overrides,
  };
}

describe("ColorPanel laser row", () => {
  it("renders a Laser swatch and opacity control", () => {
    render(<ColorPanel sel={makeSel()} onChangeLaserColor={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Laser color" })).toBeInTheDocument();
    expect(screen.getByLabelText("Laser opacity value")).toBeInTheDocument();
  });

  it("calls onChangeLaserColor with combined hex when opacity changes, not setProp", () => {
    const onChangeLaserColor = vi.fn();
    const sel = makeSel();
    render(<ColorPanel sel={sel} onChangeLaserColor={onChangeLaserColor} />);

    const opacity = screen.getByLabelText("Laser opacity value");
    fireEvent.change(opacity, { target: { value: "50" } });
    fireEvent.blur(opacity);

    expect(onChangeLaserColor).toHaveBeenCalledWith("#ff000080");
    expect(sel.setProp).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/ui/panels/ColorPanel.test.tsx`
Expected: FAIL — `ColorPanel` has no `onChangeLaserColor` prop / no Laser row.

- [ ] **Step 3: Add the `onWrite` override to `ColorRow`**

In `src/ui/panels/ColorPanel.tsx`, add to `ColorRowProps` (after `disabled?: boolean;`):

```ts
  /** When set, replaces the default per-element write — used by the always-global
   *  Laser row to persist + live-update instead of writing element props. */
  onWrite?: (color: string) => void;
```

Add `onWrite` to the destructured params of `ColorRow` (alongside `disabled = false`), then change the `write` helper from:

```ts
  const write = (color: string) =>
    sel.setProp({ prop, value: color, currentItemKey, ids });
```

to:

```ts
  const write = (color: string) =>
    onWrite ? onWrite(color) : sel.setProp({ prop, value: color, currentItemKey, ids });
```

- [ ] **Step 4: Add the Laser row and panel prop**

In `src/ui/panels/ColorPanel.tsx`, add the import at the top:

```ts
import { DEFAULT_LASER_HEX } from "../../lib/laser-color";
```

Change the `ColorPanel` signature and add the Laser row after the Text row:

```tsx
export function ColorPanel({
  sel,
  onChangeLaserColor,
}: {
  sel: SelectionStyle;
  onChangeLaserColor: (color: string) => void;
}) {
  const a = sel.appState;
  return (
    <div className="flow-color-panel">
      {/* Fill, Stroke, Text rows unchanged */}
      {/* ...existing three <ColorRow .../> ... */}
      <ColorRow
        sel={sel}
        label="Laser"
        colorOf={() => DEFAULT_LASER_HEX}
        prop="laserColor"
        currentItemKey="laserColor"
        fallbackColor={(a as { laserColor?: string } | null)?.laserColor ?? DEFAULT_LASER_HEX}
        ids={{}}
        onWrite={onChangeLaserColor}
      />
    </div>
  );
}
```

(Keep the three existing `ColorRow` blocks exactly as they are; only add the fourth. `colorOf` is never invoked for the Laser row because `ids={{}}` matches no elements, but a valid function is still required by the prop type.)

- [ ] **Step 5: Run the ColorPanel test to verify it passes**

Run: `npx vitest run src/ui/panels/ColorPanel.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Thread the handler through `PanelsRoot`**

In `src/ui/panels/PanelsRoot.tsx`, add `onChangeLaserColor` to `PanelsRootProps`:

```ts
interface PanelsRootProps {
  api: ExcalidrawAPI | null;
  units: Unit;
  search: SearchSignal;
  /** Sets the global laser-pointer color (persist + live-update). */
  onChangeLaserColor: (color: string) => void;
}
```

Destructure it in the function signature and pass it to `ColorPanel`:

```tsx
export function PanelsRoot({ api, units, search, onChangeLaserColor }: PanelsRootProps) {
  const sel = useSelectionStyle(api);

  const defs: PanelDef[] = [
    { id: "transform", label: "Transform", render: () => <TransformPanel sel={sel} api={api} /> },
    { id: "color", label: "Color", render: () => <ColorPanel sel={sel} onChangeLaserColor={onChangeLaserColor} /> },
    // ...rest unchanged
  ];
  // ...
}
```

- [ ] **Step 7: Wire state, handler, effect, and seed in `App`**

In `src/App.tsx`:

Add to the preferences import (currently `getSloppiness, setSloppiness, getUnits, setUnits, ...`):

```ts
  getLaserColor, setLaserColor,
```

Add state + handler next to the `bindingMode` block (~line 141):

```ts
  const [laserColor, setLaserColorState] = useState<string>(() => getLaserColor());
  const handleChangeLaserColor = useCallback((next: string) => {
    setLaserColorState(next);
    setLaserColor(next);
  }, []);
  // Push the color into appState whenever it changes or the API becomes ready.
  // laserColor isn't in the vendor .d.ts yet (fork addition) so cast the arg.
  useEffect(() => {
    if (!excalidrawApi) return;
    excalidrawApi.updateScene({
      appState: { laserColor },
    } as unknown as Parameters<ExcalidrawAPI["updateScene"]>[0]);
  }, [excalidrawApi, laserColor]);
```

Seed it in `initialData.appState` (alongside `bindingMode`):

```tsx
            appState: {
              currentItemRoughness: sloppiness,
              currentItemFontFamily: FONT_FAMILY.Nunito,
              bindingMode,
              laserColor,
            },
```

Pass the handler to `PanelsRoot`:

```tsx
        <PanelsRoot api={excalidrawApi} units={units} search={search} onChangeLaserColor={handleChangeLaserColor} />
```

- [ ] **Step 8: Run the full unit suite + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS — all unit tests green, no type errors.

- [ ] **Step 9: Commit**

```bash
git add src/ui/panels/ColorPanel.tsx src/ui/panels/ColorPanel.test.tsx src/ui/panels/PanelsRoot.tsx src/App.tsx
git commit -m "feat: add Laser color row to the Color panel"
```

---

### Task 4: e2e — swatch round-trip + trail renders in the chosen color

Two Playwright tests in the existing color-panel spec: the Laser swatch round-trips a color through `appState`, and the live laser trail SVG path renders with the chosen `fill` (the real proof the fork read works end-to-end).

**Files:**
- Modify: `e2e/color-panel.spec.ts`

**Interfaces:**
- Consumes: the shipped Task 1–3 behavior. Laser tool-rail button is labeled `"Laser pointer"`; the trail path is `.SVGLayer svg path`; the Laser swatch button is named `"Laser color"`.

- [ ] **Step 1: Write the failing swatch round-trip test**

Append to `e2e/color-panel.spec.ts`:

```ts
test("laser color round-trips through the global swatch", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const laserSwatch = page.getByRole("button", { name: "Laser color", exact: true });
  await expect(laserSwatch).toHaveAttribute("title", "#ff0000"); // default

  await laserSwatch.click();
  await page.getByRole("button", { name: "#e03131" }).click();
  await page.locator(".flow-pnl__title").click(); // close the picker
  await expect(laserSwatch).toHaveAttribute("title", "#e03131");
});
```

- [ ] **Step 2: Run to verify it fails, then passes against the built app**

Run: `npx playwright test e2e/color-panel.spec.ts -g "round-trips through the global swatch"`
Expected: PASS once Task 3 is built. (If it fails to find the swatch, confirm `npm run dev`/preview serves the rebuilt dist from Task 2.)

- [ ] **Step 3: Write the trail-render test**

Append to `e2e/color-panel.spec.ts`:

```ts
test("the laser trail renders in the chosen color", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // Pick a laser color.
  await page.getByRole("button", { name: "Laser color", exact: true }).click();
  await page.getByRole("button", { name: "#2f9e44" }).click();
  await page.locator(".flow-pnl__title").click();

  // Activate the laser tool and drag (right of the docked panel).
  await page.getByRole("button", { name: "Laser pointer" }).click();
  await page.mouse.move(560, 320);
  await page.mouse.down();
  await page.mouse.move(820, 500, { steps: 12 });

  // While the trail is live, its SVG path fill is the chosen color.
  await page.waitForFunction(() => {
    const p = document.querySelector(".SVGLayer svg path");
    return p?.getAttribute("fill") === "#2f9e44";
  }, { timeout: 2000 });

  await page.mouse.up();
});
```

- [ ] **Step 4: Run the trail-render test**

Run: `npx playwright test e2e/color-panel.spec.ts -g "renders in the chosen color"`
Expected: PASS — the `.SVGLayer svg path` fill equals `#2f9e44` during the drag.

- [ ] **Step 5: Run the whole color-panel spec**

Run: `npx playwright test e2e/color-panel.spec.ts`
Expected: PASS — all existing tests plus the two new ones.

- [ ] **Step 6: Commit**

```bash
git add e2e/color-panel.spec.ts
git commit -m "test(e2e): laser color swatch round-trip and trail render"
```

---

## Self-Review

**Spec coverage:**
- UI Laser row reusing `ColorRow` + opacity → Task 3 (Steps 3–4) ✓
- `ids={{}}` always-global semantics → Task 3 Step 4 ✓
- `onWrite` override on `ColorRow`, other rows unaffected → Task 3 Step 3 ✓
- `handleChangeLaserColor` persists + live-updates → Task 3 Step 7 ✓
- flow-owned persistence `src/lib/laser-color.ts` + `flow.laserColor` + `DEFAULT_LASER_HEX="#ff0000"` + initialData seed → Task 1 + Task 3 Step 7 ✓
- Fork edit: `types.ts` field, `appState.ts` default + storage conf, `laser-trails.ts` read, rebuild → Task 2 ✓
- Collaborator trail path unchanged → Task 2 only touches the `localTrail` fill ✓
- Testing: `laser-color` unit, `ColorPanel` RTL onWrite, e2e trail render → Tasks 1, 3, 4 ✓
- Global (not per-document) → `flow.laserColor` + storage conf `browser/export/server: false` ✓

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `onChangeLaserColor: (color: string) => void` used identically in `ColorPanel`, `PanelsRoot`, and `App`; `getLaserColor`/`setLaserColor`/`DEFAULT_LASER_HEX`/`isLaserColor` names consistent across Tasks 1 and 3; `laserColor` field name consistent across fork (Task 2) and flow reads/writes (Task 3).
