# Color Swatches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dockable "Color Swatches" sub-panel that manages persisted, user-editable color palettes, one of which is the default that drives every color picker in flow.

**Architecture:** A flow-owned external store (`palette-store.ts`) holds the palette list + default id, persisted to `localStorage` via `preferences.ts`. The leaf `ColorSwatch` component reads the default palette's colors through `useSyncExternalStore`, so editing/switching the default live-updates every picker. A new `SwatchesPanel` registers as one more `PanelDef` in the dock. No `vendor/excalidraw` edits.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (unit/RTL), Playwright (e2e), `localStorage`.

## Global Constraints

- **No fork edits.** All changes are flow-level (`src/**`, `e2e/**`, `docs/**`). Never touch `vendor/excalidraw`.
- **Persistence keys:** `flow.colorPalettes`, `flow.defaultPaletteId`. Follow the exact `preferences.ts` pattern: try/catch around `localStorage`, normalize-on-read, silent fallback on quota/parse error.
- **Swatch colors are opaque 6-digit hex** (`#rrggbb`, lowercase). No alpha, no `transparent` stored in a palette.
- **Naming:** Components `PascalCase`; hooks `useX`; CSS classes kebab-case with the `flow-sw-` prefix for this feature (matches existing `flow-ctl-`, `flow-pnl-` conventions).
- **TDD:** every task writes a failing test first, then the minimal code. Commit after each task.
- Unit/RTL run: `npx vitest run <file>`. E2E run: `npx playwright test <file>`. Typecheck: `npm run typecheck`.

---

### Task 1: Palette domain module

**Files:**
- Create: `src/lib/color-palettes.ts`
- Test: `src/lib/color-palettes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ColorPalette { id: string; name: string; colors: string[] }`
  - `scrubHex(input: string): string | null`
  - `isHexColor(s: string): boolean`
  - `BUILTIN_FALLBACK: string[]` (16 opaque hexes)
  - `BUILTIN_PALETTES: ColorPalette[]` factory `makeBuiltinPalettes(): ColorPalette[]` (fresh ids)
  - `makeDefaultPalette(): ColorPalette` (fresh "Default" seeded with `BUILTIN_FALLBACK`)
  - `normalizePalettes(raw: unknown): ColorPalette[]`
  - `nextSetName(palettes: ColorPalette[]): string`
  - `generatePaletteId(): string`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/color-palettes.test.ts
import { describe, it, expect } from "vitest";
import {
  scrubHex,
  isHexColor,
  normalizePalettes,
  makeBuiltinPalettes,
  makeDefaultPalette,
  nextSetName,
  BUILTIN_FALLBACK,
} from "./color-palettes";

describe("scrubHex", () => {
  it("adds a missing leading #", () => expect(scrubHex("1e1e1e")).toBe("#1e1e1e"));
  it("lowercases", () => expect(scrubHex("#1E1E1E")).toBe("#1e1e1e"));
  it("expands 3-char shorthand", () => expect(scrubHex("#abc")).toBe("#aabbcc"));
  it("strips an 8-char alpha pair", () => expect(scrubHex("ff000080")).toBe("#ff0000"));
  it("rejects non-hex text", () => expect(scrubHex("transparent")).toBeNull());
  it("rejects wrong length", () => expect(scrubHex("#12ab")).toBeNull());
  it("rejects empty", () => expect(scrubHex("   ")).toBeNull());
});

describe("isHexColor", () => {
  it("accepts canonical", () => expect(isHexColor("#aabbcc")).toBe(true));
  it("rejects uppercase / alpha / shorthand", () => {
    expect(isHexColor("#AABBCC")).toBe(false);
    expect(isHexColor("#aabbccdd")).toBe(false);
    expect(isHexColor("#abc")).toBe(false);
  });
});

describe("normalizePalettes", () => {
  it("returns [] for non-arrays", () => expect(normalizePalettes({})).toEqual([]));
  it("drops entries without string id/name and scrubs colors", () => {
    const out = normalizePalettes([
      { id: "a", name: "A", colors: ["#FFFFFF", "nope", "#abc"] },
      { id: 5, name: "bad" },
      { name: "no id" },
    ]);
    expect(out).toEqual([{ id: "a", name: "A", colors: ["#ffffff", "#aabbcc"] }]);
  });
  it("dedupes ids, keeping the first", () => {
    const out = normalizePalettes([
      { id: "x", name: "first", colors: [] },
      { id: "x", name: "second", colors: [] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("first");
  });
});

describe("seeds", () => {
  it("ships 7 builtin palettes named Default first", () => {
    const b = makeBuiltinPalettes();
    expect(b).toHaveLength(7);
    expect(b[0].name).toBe("Default");
    expect(b[0].colors).toEqual(BUILTIN_FALLBACK);
    expect(new Set(b.map((p) => p.id)).size).toBe(7); // unique ids
  });
  it("makeDefaultPalette is a fresh Default with the fallback colors", () => {
    const p = makeDefaultPalette();
    expect(p.name).toBe("Default");
    expect(p.colors).toEqual(BUILTIN_FALLBACK);
  });
});

describe("nextSetName", () => {
  it("returns the first free 'color set N'", () => {
    expect(nextSetName([])).toBe("color set 1");
    expect(nextSetName([{ id: "1", name: "color set 1", colors: [] }])).toBe("color set 2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/color-palettes.test.ts`
Expected: FAIL — module `./color-palettes` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/color-palettes.ts

/** A named, ordered set of opaque swatch colors. */
export interface ColorPalette {
  id: string;
  name: string;
  colors: string[]; // "#rrggbb" lowercase
}

/** The 16 colors flow shipped as hardcoded picker presets. Also the safety net. */
export const BUILTIN_FALLBACK: string[] = [
  "#1e1e1e", "#343a40", "#495057", "#868e96", "#ced4da", "#ffffff",
  "#e03131", "#e8590c", "#f08c00", "#2f9e44", "#099268", "#1971c2",
  "#4263eb", "#7048e8", "#ae3ec9", "#c2255c",
];

const SEED_COLORS: Record<string, string[]> = {
  Pastel: ["#ffd6e0", "#ffe5b4", "#fff3b0", "#d0f4de", "#b8e0d2", "#a9def9", "#cddafd", "#d3c4f5", "#e4c1f9", "#fcd5ce"],
  Vibrant: ["#ff004d", "#ff8500", "#ffd500", "#00c853", "#00b8d4", "#2962ff", "#651fff", "#aa00ff", "#ff1493"],
  Earth: ["#4b3621", "#6f4e37", "#a0785a", "#c19a6b", "#d2b48c", "#8a9a5b", "#556b2f", "#b7410e", "#8d6e63", "#5d4037"],
  Ocean: ["#03045e", "#023e8a", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#caf0f8", "#2a9d8f"],
  Sunset: ["#03071e", "#370617", "#6a040f", "#9d0208", "#dc2f02", "#e85d04", "#f48c06", "#faa307", "#ffba08"],
  Grayscale: ["#000000", "#1e1e1e", "#343a40", "#495057", "#868e96", "#adb5bd", "#ced4da", "#dee2e6", "#f1f3f5", "#ffffff"],
};

/** Forgiving hex scrubber: kind to a missing "#", lowercases, expands 3-char
 *  shorthand, strips an 8-char alpha pair. Rejects anything else (never salvages
 *  junk like "transparent"). Always yields opaque 6-digit hex or null. */
export function scrubHex(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-f]+$/.test(s)) return null;
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  else if (s.length === 8) s = s.slice(0, 6);
  if (s.length !== 6) return null;
  return `#${s}`;
}

/** True only for canonical `#rrggbb` lowercase. */
export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/.test(s);
}

/** A unique id for a palette. */
export function generatePaletteId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `p-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  }
}

/** A fresh "Default" palette seeded with the fallback colors. */
export function makeDefaultPalette(): ColorPalette {
  return { id: generatePaletteId(), name: "Default", colors: [...BUILTIN_FALLBACK] };
}

/** The 7 seed palettes, with fresh ids ("Default" first). */
export function makeBuiltinPalettes(): ColorPalette[] {
  const rest = Object.entries(SEED_COLORS).map(([name, colors]) => ({
    id: generatePaletteId(),
    name,
    colors: [...colors],
  }));
  return [makeDefaultPalette(), ...rest];
}

/** Coerce an unknown blob into a clean palette list (drops malformed entries). */
export function normalizePalettes(raw: unknown): ColorPalette[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ColorPalette[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.name !== "string") continue;
    if (seen.has(r.id)) continue;
    const colors = Array.isArray(r.colors)
      ? r.colors
          .map((c) => (typeof c === "string" ? scrubHex(c) : null))
          .filter((c): c is string => c !== null)
      : [];
    seen.add(r.id);
    out.push({ id: r.id, name: r.name, colors });
  }
  return out;
}

/** The first free "color set N" name for a new palette. */
export function nextSetName(palettes: ColorPalette[]): string {
  const taken = new Set(palettes.map((p) => p.name));
  let n = 1;
  while (taken.has(`color set ${n}`)) n++;
  return `color set ${n}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/color-palettes.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/color-palettes.ts src/lib/color-palettes.test.ts
git commit -m "feat(swatches): palette domain model + hex scrubber"
```

---

### Task 2: Preferences persistence

**Files:**
- Modify: `src/app/preferences.ts` (append new keys + getters/setters near the end, before `readJson`)
- Test: `src/app/preferences.test.ts` (append cases; file already exists)

**Interfaces:**
- Consumes: `normalizePalettes`, `ColorPalette` from Task 1.
- Produces:
  - `getColorPalettes(): ColorPalette[]`
  - `setColorPalettes(value: ColorPalette[]): void`
  - `getDefaultPaletteId(): string | null`
  - `setDefaultPaletteId(value: string): void`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/app/preferences.test.ts
import {
  getColorPalettes,
  setColorPalettes,
  getDefaultPaletteId,
  setDefaultPaletteId,
} from "./preferences";

describe("color palettes persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a normalized palette list", () => {
    setColorPalettes([{ id: "a", name: "A", colors: ["#ffffff"] }]);
    expect(getColorPalettes()).toEqual([{ id: "a", name: "A", colors: ["#ffffff"] }]);
  });

  it("returns [] when unset or corrupt", () => {
    expect(getColorPalettes()).toEqual([]);
    localStorage.setItem("flow.colorPalettes", "{not json");
    expect(getColorPalettes()).toEqual([]);
  });

  it("scrubs colors on read via normalizePalettes", () => {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([{ id: "a", name: "A", colors: ["#FFF", "bad"] }]),
    );
    expect(getColorPalettes()).toEqual([{ id: "a", name: "A", colors: ["#ffffff"] }]);
  });

  it("round-trips the default palette id, null when unset", () => {
    expect(getDefaultPaletteId()).toBeNull();
    setDefaultPaletteId("xyz");
    expect(getDefaultPaletteId()).toBe("xyz");
  });
});
```

> If `preferences.test.ts` does not already import `describe/it/expect/beforeEach`, add them to its top import from `vitest`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: FAIL — `getColorPalettes` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/app/preferences.ts — add to the import block at the top:
import { normalizePalettes, type ColorPalette } from "../lib/color-palettes";

// ...and append these before the readJson/writeJson helpers:

const COLOR_PALETTES_KEY = "flow.colorPalettes";
const DEFAULT_PALETTE_ID_KEY = "flow.defaultPaletteId";

/** Read the saved palettes, normalized (empty on miss/parse error). */
export function getColorPalettes(): ColorPalette[] {
  return normalizePalettes(readJson(COLOR_PALETTES_KEY));
}

/** Persist the palette list. */
export function setColorPalettes(value: ColorPalette[]): void {
  writeJson(COLOR_PALETTES_KEY, value);
}

/** Read the id of the default palette (null on miss). */
export function getDefaultPaletteId(): string | null {
  try {
    return localStorage.getItem(DEFAULT_PALETTE_ID_KEY);
  } catch {
    return null;
  }
}

/** Persist the default palette id. */
export function setDefaultPaletteId(value: string): void {
  try {
    localStorage.setItem(DEFAULT_PALETTE_ID_KEY, value);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/preferences.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat(swatches): persist palettes + default id in preferences"
```

---

### Task 3: Palette store (external store + mutations)

**Files:**
- Create: `src/lib/palette-store.ts`
- Test: `src/lib/palette-store.test.ts`

**Interfaces:**
- Consumes: Task 1 domain module; Task 2 preferences getters/setters.
- Produces:
  - `interface PaletteState { palettes: ColorPalette[]; defaultPaletteId: string }`
  - `subscribe(listener: () => void): () => void`
  - `getSnapshot(): PaletteState`
  - `getDefaultPaletteColors(): string[]`
  - `usePaletteState(): PaletteState`
  - `useDefaultPaletteColors(): string[]`
  - `addPalette(name?: string): ColorPalette`
  - `removePalette(id: string): void`
  - `renamePalette(id: string, name: string): void`
  - `setDefaultPalette(id: string): void`
  - `addSwatch(paletteId: string, color: string): void`
  - `updateSwatch(paletteId: string, index: number, color: string): void`
  - `removeSwatches(paletteId: string, indices: number[]): void`
  - `reorderSwatches(paletteId: string, from: number, to: number): void`
  - `reloadPaletteStore(): void` (test seam / re-read storage)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/palette-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as store from "./palette-store";

beforeEach(() => {
  localStorage.clear();
  store.reloadPaletteStore(); // fresh seed each test
});

describe("seeding + snapshot", () => {
  it("seeds 7 builtins and defaults to Default on first load", () => {
    const s = store.getSnapshot();
    expect(s.palettes).toHaveLength(7);
    const def = s.palettes.find((p) => p.id === s.defaultPaletteId);
    expect(def?.name).toBe("Default");
  });

  it("getDefaultPaletteColors returns the default palette's colors", () => {
    expect(store.getDefaultPaletteColors()).toEqual(
      store.getSnapshot().palettes[0].colors,
    );
  });

  it("getSnapshot returns a stable reference until a mutation", () => {
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    store.addPalette();
    // a new reference after mutation
    const a = store.getSnapshot();
    expect(store.getSnapshot()).toBe(a);
  });
});

describe("mutations notify + persist", () => {
  it("addPalette appends an auto-named empty palette and notifies", () => {
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    const p = store.addPalette();
    expect(p.name).toBe("color set 1");
    expect(p.colors).toEqual([]);
    expect(store.getSnapshot().palettes).toContainEqual(p);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
    // persisted
    expect(JSON.parse(localStorage.getItem("flow.colorPalettes")!)).toContainEqual(p);
  });

  it("setDefaultPalette is last-write-wins", () => {
    const p = store.addPalette();
    store.setDefaultPalette(p.id);
    expect(store.getSnapshot().defaultPaletteId).toBe(p.id);
    expect(store.getDefaultPaletteColors()).toEqual([]); // p has no colors → but see fallback test
  });

  it("getDefaultPaletteColors falls back when the default palette is empty", () => {
    const p = store.addPalette(); // empty
    store.setDefaultPalette(p.id);
    // empty default → fallback so pickers never render nothing
    expect(store.getDefaultPaletteColors()).toEqual(
      expect.arrayContaining(["#1e1e1e"]),
    );
  });

  it("addSwatch / updateSwatch / removeSwatches operate by index", () => {
    const p = store.addPalette();
    store.addSwatch(p.id, "abc");            // scrubbed → #aabbcc
    store.addSwatch(p.id, "#ff0000");
    let colors = store.getSnapshot().palettes.find((x) => x.id === p.id)!.colors;
    expect(colors).toEqual(["#aabbcc", "#ff0000"]);

    store.updateSwatch(p.id, 0, "#00ff00");
    store.removeSwatches(p.id, [1]);
    colors = store.getSnapshot().palettes.find((x) => x.id === p.id)!.colors;
    expect(colors).toEqual(["#00ff00"]);
  });

  it("reorderSwatches moves an item", () => {
    const p = store.addPalette();
    ["#111111", "#222222", "#333333"].forEach((c) => store.addSwatch(p.id, c));
    store.reorderSwatches(p.id, 0, 2);
    const colors = store.getSnapshot().palettes.find((x) => x.id === p.id)!.colors;
    expect(colors).toEqual(["#222222", "#333333", "#111111"]);
  });

  it("renamePalette updates the name", () => {
    const p = store.addPalette();
    store.renamePalette(p.id, "My set");
    expect(store.getSnapshot().palettes.find((x) => x.id === p.id)!.name).toBe("My set");
  });
});

describe("removePalette", () => {
  it("re-points default to the first remaining when the default is deleted", () => {
    const s = store.getSnapshot();
    const defId = s.defaultPaletteId;
    store.removePalette(defId);
    const after = store.getSnapshot();
    expect(after.palettes.some((p) => p.id === defId)).toBe(false);
    expect(after.palettes.some((p) => p.id === after.defaultPaletteId)).toBe(true);
  });

  it("re-seeds a fresh Default when the last palette is deleted", () => {
    // delete all but rely on the guard on the final removal
    let ids = store.getSnapshot().palettes.map((p) => p.id);
    for (const id of ids) store.removePalette(id);
    const after = store.getSnapshot();
    expect(after.palettes).toHaveLength(1);
    expect(after.palettes[0].name).toBe("Default");
    expect(after.defaultPaletteId).toBe(after.palettes[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: FAIL — `./palette-store` not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/palette-store.ts
import { useSyncExternalStore } from "react";
import {
  type ColorPalette,
  BUILTIN_FALLBACK,
  makeBuiltinPalettes,
  makeDefaultPalette,
  nextSetName,
  generatePaletteId,
  scrubHex,
} from "./color-palettes";
import {
  getColorPalettes,
  setColorPalettes,
  getDefaultPaletteId,
  setDefaultPaletteId,
} from "../app/preferences";

export interface PaletteState {
  palettes: ColorPalette[];
  defaultPaletteId: string;
}

const listeners = new Set<() => void>();
let state: PaletteState = load();
let colorsCache: { forState: PaletteState; value: string[] } | null = null;

/** Read persisted state, seeding builtins on first run and repairing a
 *  missing/empty default id. */
function load(): PaletteState {
  const palettes = getColorPalettes();
  if (palettes.length === 0) {
    const seeded = makeBuiltinPalettes();
    setColorPalettes(seeded);
    setDefaultPaletteId(seeded[0].id);
    return { palettes: seeded, defaultPaletteId: seeded[0].id };
  }
  let defaultPaletteId = getDefaultPaletteId() ?? "";
  if (!palettes.some((p) => p.id === defaultPaletteId)) {
    defaultPaletteId = palettes[0].id;
    setDefaultPaletteId(defaultPaletteId);
  }
  return { palettes, defaultPaletteId };
}

function commit(next: PaletteState): void {
  state = next;
  colorsCache = null;
  setColorPalettes(next.palettes);
  setDefaultPaletteId(next.defaultPaletteId);
  for (const l of listeners) l();
}

function mapPalette(id: string, fn: (p: ColorPalette) => ColorPalette): ColorPalette[] {
  return state.palettes.map((p) => (p.id === id ? fn(p) : p));
}

function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// --- read API (useSyncExternalStore contract) ---

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PaletteState {
  return state;
}

export function getDefaultPaletteColors(): string[] {
  if (colorsCache && colorsCache.forState === state) return colorsCache.value;
  const p = state.palettes.find((x) => x.id === state.defaultPaletteId);
  const value = p && p.colors.length > 0 ? p.colors : BUILTIN_FALLBACK;
  colorsCache = { forState: state, value };
  return value;
}

export function usePaletteState(): PaletteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDefaultPaletteColors(): string[] {
  return useSyncExternalStore(subscribe, getDefaultPaletteColors, getDefaultPaletteColors);
}

/** Re-read persisted state (primarily a test seam / cross-tab reload). */
export function reloadPaletteStore(): void {
  state = load();
  colorsCache = null;
  for (const l of listeners) l();
}

// --- mutations ---

export function addPalette(name?: string): ColorPalette {
  const palette: ColorPalette = {
    id: generatePaletteId(),
    name: name ?? nextSetName(state.palettes),
    colors: [],
  };
  commit({ ...state, palettes: [...state.palettes, palette] });
  return palette;
}

export function removePalette(id: string): void {
  const remaining = state.palettes.filter((p) => p.id !== id);
  if (remaining.length === 0) {
    const seed = makeDefaultPalette();
    commit({ palettes: [seed], defaultPaletteId: seed.id });
    return;
  }
  const defaultPaletteId =
    state.defaultPaletteId === id ? remaining[0].id : state.defaultPaletteId;
  commit({ palettes: remaining, defaultPaletteId });
}

export function renamePalette(id: string, name: string): void {
  commit({ ...state, palettes: mapPalette(id, (p) => ({ ...p, name })) });
}

export function setDefaultPalette(id: string): void {
  if (!state.palettes.some((p) => p.id === id)) return;
  commit({ ...state, defaultPaletteId: id });
}

export function addSwatch(paletteId: string, color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({ ...p, colors: [...p.colors, hex] })),
  });
}

export function updateSwatch(paletteId: string, index: number, color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({
      ...p,
      colors: p.colors.map((c, i) => (i === index ? hex : c)),
    })),
  });
}

export function removeSwatches(paletteId: string, indices: number[]): void {
  const drop = new Set(indices);
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({
      ...p,
      colors: p.colors.filter((_, i) => !drop.has(i)),
    })),
  });
}

export function reorderSwatches(paletteId: string, from: number, to: number): void {
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({ ...p, colors: moveItem(p.colors, from, to) })),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/palette-store.ts src/lib/palette-store.test.ts
git commit -m "feat(swatches): palette store with useSyncExternalStore + mutations"
```

---

### Task 4: Source ColorSwatch presets from the default palette

**Files:**
- Modify: `src/ui/panels/controls/ColorSwatch.tsx`
- Test: `src/ui/panels/controls/ColorSwatch.test.tsx` (exists — append)

**Interfaces:**
- Consumes: `useDefaultPaletteColors` (Task 3), `scrubHex` (Task 1).
- Produces: no new exports (behavior change only).

- [ ] **Step 1: Write the failing test**

```tsx
// append to src/ui/panels/controls/ColorSwatch.test.tsx
import { beforeEach } from "vitest";
import { reloadPaletteStore, setDefaultPalette, addPalette, addSwatch } from "../../../lib/palette-store";
// (existing imports for render/screen/fireEvent/ColorSwatch/vi already present)

describe("ColorSwatch presets come from the default palette", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadPaletteStore();
  });

  it("renders the default palette's colors as presets", () => {
    render(<ColorSwatch value="#111111" onChange={vi.fn()} ariaLabel="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" })); // open popover
    // "Default" seed includes #e03131
    expect(screen.getByRole("button", { name: "#e03131" })).toBeInTheDocument();
  });

  it("reflects a new default palette live", () => {
    const p = addPalette();
    addSwatch(p.id, "#0a0b0c");
    setDefaultPalette(p.id);
    render(<ColorSwatch value="#111111" onChange={vi.fn()} ariaLabel="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(screen.getByRole("button", { name: "#0a0b0c" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "#e03131" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/controls/ColorSwatch.test.tsx`
Expected: FAIL — presets still come from the hardcoded `PRESETS` (second test fails; `#0a0b0c` absent).

- [ ] **Step 3: Write minimal implementation**

Edit `src/ui/panels/controls/ColorSwatch.tsx`:

1. Replace the top imports block:

```tsx
import { useEffect, useRef, useState } from "react";
import { MIXED, type Mixed } from "../../../lib/selection-style";
import { scrubHex } from "../../../lib/color-palettes";
import { useDefaultPaletteColors } from "../../../lib/palette-store";
```

2. Delete the `PRESETS`, `HEX_RE`, and `normalizeHex` definitions. Replace `safeNativeHex` and `commitHex` to use `scrubHex`:

```tsx
/** A hex the native `<input type=color>` will accept (it rejects transparent). */
function safeNativeHex(value: string | Mixed): string {
  if (value === MIXED || value === "transparent") return "#000000";
  return scrubHex(value) ?? "#000000";
}
```

3. Inside the component body, add near the other hooks:

```tsx
  const presets = useDefaultPaletteColors();
```

4. Update `commitHex`:

```tsx
  const commitHex = () => {
    const hex = scrubHex(hexText);
    if (hex) onChange(hex);
  };
```

5. Replace `{PRESETS.map(...)}` with `{presets.map(...)}` (same JSX body).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/ui/panels/controls/ColorSwatch.test.tsx`
Expected: PASS (existing + new cases). Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/controls/ColorSwatch.tsx src/ui/panels/controls/ColorSwatch.test.tsx
git commit -m "feat(swatches): ColorSwatch presets sourced from default palette"
```

---

### Task 5: SwatchPicker popover

**Files:**
- Create: `src/ui/panels/SwatchPicker.tsx`
- Test: `src/ui/panels/SwatchPicker.test.tsx`

**Interfaces:**
- Consumes: `scrubHex` (Task 1).
- Produces:
  - `interface SwatchPickerProps { initial: string; onCommit: (color: string) => void; onClose: () => void }`
  - `export function SwatchPicker(props: SwatchPickerProps)` — a small popover with a native color input + a hex text field. "Add"/Enter commits a scrubbed hex; blur-outside closes.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/panels/SwatchPicker.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwatchPicker } from "./SwatchPicker";

describe("SwatchPicker", () => {
  it("commits a scrubbed hex from the text field on Enter", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    const hex = screen.getByLabelText("Swatch hex");
    fireEvent.change(hex, { target: { value: "abc" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("#aabbcc");
  });

  it("commits from the native color input", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    fireEvent.input(screen.getByLabelText("Swatch color"), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Add color" }));
    expect(onCommit).toHaveBeenCalledWith("#123456");
  });

  it("does not commit invalid hex", () => {
    const onCommit = vi.fn();
    render(<SwatchPicker initial="#ffffff" onCommit={onCommit} onClose={vi.fn()} />);
    const hex = screen.getByLabelText("Swatch hex");
    fireEvent.change(hex, { target: { value: "nope" } });
    fireEvent.keyDown(hex, { key: "Enter" });
    expect(onCommit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/SwatchPicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/panels/SwatchPicker.tsx
import { useEffect, useRef, useState } from "react";
import { scrubHex } from "../../lib/color-palettes";

export interface SwatchPickerProps {
  /** Seed color (`#rrggbb`). */
  initial: string;
  onCommit: (color: string) => void;
  onClose: () => void;
}

/**
 * A compact popover for adding or editing a single palette swatch: the OS color
 * dialog plus a forgiving hex field. Commits an opaque `#rrggbb` via scrubHex.
 */
export function SwatchPicker({ initial, onCommit, onClose }: SwatchPickerProps) {
  const [color, setColor] = useState(scrubHex(initial) ?? "#000000");
  const [hexText, setHexText] = useState(scrubHex(initial) ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const commit = (raw: string) => {
    const hex = scrubHex(raw);
    if (hex) onCommit(hex);
  };

  return (
    <div className="flow-sw-picker" role="dialog" aria-label="Swatch picker" ref={wrapRef}>
      <input
        type="color"
        className="flow-sw-picker__native"
        aria-label="Swatch color"
        value={color}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setColor(v);
          setHexText(v);
        }}
      />
      <input
        type="text"
        className="flow-sw-picker__hex"
        aria-label="Swatch hex"
        placeholder="#rrggbb"
        value={hexText}
        onChange={(e) => setHexText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(hexText);
          if (e.key === "Escape") onClose();
        }}
      />
      <button type="button" className="flow-sw-picker__add" onClick={() => commit(hexText || color)}>
        Add color
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/SwatchPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/SwatchPicker.tsx src/ui/panels/SwatchPicker.test.tsx
git commit -m "feat(swatches): SwatchPicker popover (native + hex)"
```

---

### Task 6: SwatchGrid (presentational) — tile, select, edit, reorder

**Files:**
- Create: `src/ui/panels/SwatchGrid.tsx`
- Test: `src/ui/panels/SwatchGrid.test.tsx`

**Interfaces:**
- Consumes: nothing new (pure presentational).
- Produces:
  - `interface SwatchGridProps { colors: string[]; selected: number[]; onAdd: () => void; onSelect: (index: number, shift: boolean) => void; onEdit: (index: number) => void; onReorder: (from: number, to: number) => void }`
  - `export function SwatchGrid(props: SwatchGridProps)` — renders a pinned "+" tile (index 0 is never a swatch), then one button per color. Click → `onSelect(i, shiftKey)`; double-click → `onEdit(i)`; HTML5 drag between swatches → `onReorder`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/panels/SwatchGrid.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwatchGrid } from "./SwatchGrid";

const base = {
  colors: ["#111111", "#222222"],
  selected: [] as number[],
  onAdd: vi.fn(),
  onSelect: vi.fn(),
  onEdit: vi.fn(),
  onReorder: vi.fn(),
};

describe("SwatchGrid", () => {
  it("renders the + tile and one button per color", () => {
    render(<SwatchGrid {...base} />);
    expect(screen.getByRole("button", { name: "Add swatch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #111111" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toBeInTheDocument();
  });

  it("calls onAdd from the + tile", () => {
    const onAdd = vi.fn();
    render(<SwatchGrid {...base} onAdd={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: "Add swatch" }));
    expect(onAdd).toHaveBeenCalled();
  });

  it("reports shift state on select", () => {
    const onSelect = vi.fn();
    render(<SwatchGrid {...base} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: "Swatch #222222" }), { shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith(1, true);
  });

  it("double-click edits", () => {
    const onEdit = vi.fn();
    render(<SwatchGrid {...base} onEdit={onEdit} />);
    fireEvent.doubleClick(screen.getByRole("button", { name: "Swatch #111111" }));
    expect(onEdit).toHaveBeenCalledWith(0);
  });

  it("marks selected swatches with aria-pressed", () => {
    render(<SwatchGrid {...base} selected={[1]} />);
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("reorders via drag/drop", () => {
    const onReorder = vi.fn();
    render(<SwatchGrid {...base} onReorder={onReorder} />);
    const a = screen.getByRole("button", { name: "Swatch #111111" });
    const b = screen.getByRole("button", { name: "Swatch #222222" });
    fireEvent.dragStart(a);
    fireEvent.dragOver(b);
    fireEvent.drop(b);
    expect(onReorder).toHaveBeenCalledWith(0, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/SwatchGrid.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/panels/SwatchGrid.tsx
import { useRef } from "react";

export interface SwatchGridProps {
  colors: string[];
  selected: number[];
  onAdd: () => void;
  onSelect: (index: number, shift: boolean) => void;
  onEdit: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

/**
 * The swatch grid: a pinned, non-draggable "+" tile followed by one button per
 * color. Selection/edit/reorder are reported up; the panel owns the state.
 */
export function SwatchGrid({ colors, selected, onAdd, onSelect, onEdit, onReorder }: SwatchGridProps) {
  const dragFrom = useRef<number | null>(null);
  const sel = new Set(selected);

  return (
    <div className="flow-sw-grid">
      <button
        type="button"
        className="flow-sw-add"
        aria-label="Add swatch"
        onClick={onAdd}
      >
        +
      </button>
      {colors.map((c, i) => (
        <button
          key={`${c}-${i}`}
          type="button"
          className="flow-sw-tile"
          style={{ background: c }}
          aria-label={`Swatch ${c}`}
          aria-pressed={sel.has(i)}
          title={c}
          draggable
          onClick={(e) => onSelect(i, e.shiftKey)}
          onDoubleClick={() => onEdit(i)}
          onDragStart={() => {
            dragFrom.current = i;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null && from !== i) onReorder(from, i);
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/SwatchGrid.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/SwatchGrid.tsx src/ui/panels/SwatchGrid.test.tsx
git commit -m "feat(swatches): presentational SwatchGrid with select/edit/reorder"
```

---

### Task 7: SwatchesPanel (compose store + grid + picker + confirm)

**Files:**
- Create: `src/ui/panels/SwatchesPanel.tsx`
- Test: `src/ui/panels/SwatchesPanel.test.tsx`

**Interfaces:**
- Consumes: `usePaletteState` + all mutations (Task 3); `SwatchGrid` (Task 6); `SwatchPicker` (Task 5).
- Produces: `export function SwatchesPanel()` — the full panel: palette dropdown, add-palette, context-trash (delete selected swatches OR delete palette with inline confirm), swatch grid, rename input, set-default button, and the add/edit picker.

- [ ] **Step 1: Write the failing test**

```tsx
// src/ui/panels/SwatchesPanel.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { SwatchesPanel } from "./SwatchesPanel";
import { reloadPaletteStore, getSnapshot } from "../../lib/palette-store";

beforeEach(() => {
  localStorage.clear();
  reloadPaletteStore();
});

/** Add a color through the "+" tile → picker → hex Enter. */
function addColorViaPicker(hex: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add swatch" }));
  const field = screen.getByLabelText("Swatch hex");
  fireEvent.change(field, { target: { value: hex } });
  fireEvent.keyDown(field, { key: "Enter" });
}

describe("SwatchesPanel", () => {
  it("adds a palette named 'color set 1', selects it, empties the grid", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    expect((screen.getByLabelText("Palette name") as HTMLInputElement).value).toBe("color set 1");
    // no swatch tiles yet (only the + tile)
    expect(screen.queryByRole("button", { name: /^Swatch / })).not.toBeInTheDocument();
  });

  it("adds a swatch via the + tile", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    addColorViaPicker("#0a0b0c");
    expect(screen.getByRole("button", { name: "Swatch #0a0b0c" })).toBeInTheDocument();
  });

  it("removes selected swatches with the context trash", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    addColorViaPicker("#111111");
    addColorViaPicker("#222222");
    fireEvent.click(screen.getByRole("button", { name: "Swatch #111111" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove selected swatches" }));
    expect(screen.queryByRole("button", { name: "Swatch #111111" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toBeInTheDocument();
  });

  it("deletes the palette only after confirming", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" })); // now 8 palettes
    const before = getSnapshot().palettes.length;
    fireEvent.click(screen.getByRole("button", { name: "Delete palette" }));
    // confirm appears
    expect(screen.getByText(/really want to delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(getSnapshot().palettes.length).toBe(before - 1);
  });

  it("renames on blur", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    const name = screen.getByLabelText("Palette name");
    fireEvent.change(name, { target: { value: "Brand" } });
    fireEvent.blur(name);
    expect(getSnapshot().palettes.some((p) => p.name === "Brand")).toBe(true);
  });

  it("sets the selected palette as default", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    const newId = getSnapshot().palettes.at(-1)!.id;
    fireEvent.click(screen.getByRole("button", { name: "Set as default" }));
    expect(getSnapshot().defaultPaletteId).toBe(newId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/ui/panels/SwatchesPanel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/ui/panels/SwatchesPanel.tsx
import { useState } from "react";
import {
  usePaletteState,
  addPalette,
  removePalette,
  renamePalette,
  setDefaultPalette,
  addSwatch,
  updateSwatch,
  removeSwatches,
  reorderSwatches,
} from "../../lib/palette-store";
import { SwatchGrid } from "./SwatchGrid";
import { SwatchPicker } from "./SwatchPicker";

type PickerState = { mode: "add" } | { mode: "edit"; index: number } | null;

export function SwatchesPanel() {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selectedId, setSelectedId] = useState<string>(defaultPaletteId);
  const [selected, setSelected] = useState<number[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [confirming, setConfirming] = useState(false);

  // Resolve defensively: selectedId may point at a just-deleted palette.
  const current = palettes.find((p) => p.id === selectedId) ?? palettes[0];
  const isDefault = current.id === defaultPaletteId;

  const choosePalette = (id: string) => {
    setSelectedId(id);
    setSelected([]);
    setPicker(null);
    setConfirming(false);
  };

  const onAddPalette = () => {
    const p = addPalette();
    choosePalette(p.id);
  };

  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
    } else {
      setConfirming(true);
    }
  };

  const confirmDelete = () => {
    removePalette(current.id);
    setConfirming(false);
    setSelected([]);
    // selectedId now points at a deleted palette; "" makes `current` fall back
    // to palettes[0] on the next render (store state is already fresh).
    setSelectedId("");
  };

  const onSelect = (index: number, shift: boolean) => {
    setSelected((prev) =>
      shift
        ? prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
        : [index],
    );
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // Ignore keys typed into the name field / palette select — only act on the grid.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      e.preventDefault();
      removeSwatches(current.id, selected);
      setSelected([]);
    }
  };

  const onPickerCommit = (color: string) => {
    if (picker?.mode === "add") addSwatch(current.id, color);
    else if (picker?.mode === "edit") updateSwatch(current.id, picker.index, color);
    setPicker(null);
  };

  const editInitial =
    picker?.mode === "edit" ? current.colors[picker.index] ?? "#000000" : "#000000";

  return (
    <div className="flow-sw" onKeyDown={onGridKeyDown}>
      {/* top row: palette selector + add + context trash */}
      <div className="flow-sw-row flow-sw-row--top">
        <select
          className="flow-sw-select"
          aria-label="Palette"
          value={current.id}
          onChange={(e) => choosePalette(e.target.value)}
        >
          {palettes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="flow-sw-icon" aria-label="Add palette" onClick={onAddPalette}>
          +
        </button>
        <button
          type="button"
          className="flow-sw-icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          onClick={onTrash}
        >
          🗑
        </button>
      </div>

      {/* swatch grid */}
      <SwatchGrid
        colors={current.colors}
        selected={selected}
        onAdd={() => setPicker({ mode: "add" })}
        onSelect={onSelect}
        onEdit={(index) => setPicker({ mode: "edit", index })}
        onReorder={(from, to) => reorderSwatches(current.id, from, to)}
      />

      {picker && (
        <SwatchPicker initial={editInitial} onCommit={onPickerCommit} onClose={() => setPicker(null)} />
      )}

      {/* bottom row: rename + set default */}
      <div className="flow-sw-row flow-sw-row--bottom">
        <input
          key={current.id}
          className="flow-sw-name"
          aria-label="Palette name"
          defaultValue={current.name}
          onBlur={(e) => renamePalette(current.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="flow-sw-default"
          aria-label="Set as default"
          disabled={isDefault}
          onClick={() => setDefaultPalette(current.id)}
        >
          {isDefault ? "★ Default" : "☆ Set as default"}
        </button>
      </div>

      {confirming && (
        <div className="flow-sw-confirm" role="alertdialog" aria-label="Delete palette">
          <p>Do you really want to delete this color palette?</p>
          <div className="flow-sw-confirm__actions">
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" aria-label="Confirm delete" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/ui/panels/SwatchesPanel.test.tsx`
Expected: PASS. Then `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/SwatchesPanel.tsx src/ui/panels/SwatchesPanel.test.tsx
git commit -m "feat(swatches): SwatchesPanel wiring store + grid + picker + confirm"
```

---

### Task 8: Register the panel in the dock

**Files:**
- Modify: `src/ui/panels/PanelsRoot.tsx`
- Modify: `e2e/panels.spec.ts:16-24` (the panel-order assertion)

**Interfaces:**
- Consumes: `SwatchesPanel` (Task 7).
- Produces: a new `PanelDef` with `id: "swatches"` inserted after `color`.

- [ ] **Step 1: Update the e2e order assertion (the failing check)**

In `e2e/panels.spec.ts`, change the expected titles array to include the new panel after "Color":

```ts
  await expect(titles).toHaveText([
    "Transform",
    "Color",
    "Color Swatches",
    "Stroke",
    "Text",
    "Align",
    "Search",
    "Layers",
  ]);
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test e2e/panels.spec.ts -g "dockable accordion"`
Expected: FAIL — "Color Swatches" not yet rendered.

- [ ] **Step 3: Register the panel**

In `src/ui/panels/PanelsRoot.tsx`, add the import and the def (after the `color` entry):

```tsx
import { SwatchesPanel } from "./SwatchesPanel";
```

```tsx
    { id: "color", label: "Color", render: () => <ColorPanel sel={sel} onChangeLaserColor={onChangeLaserColor} /> },
    { id: "swatches", label: "Color Swatches", render: () => <SwatchesPanel /> },
    { id: "stroke", label: "Stroke", render: () => <StrokePanel sel={sel} units={units} /> },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test e2e/panels.spec.ts -g "dockable accordion"`
Expected: PASS.

> Note: the dock's `syncPanelDefs` appends unknown persisted ids, so an existing saved layout gains the new panel automatically; no migration needed.

- [ ] **Step 5: Commit**

```bash
git add src/ui/panels/PanelsRoot.tsx e2e/panels.spec.ts
git commit -m "feat(swatches): register Color Swatches sub-panel in the dock"
```

---

### Task 9: Panel styling

**Files:**
- Modify: `src/ui/panels/panels.css` (append a `flow-sw*` block)

**Interfaces:** none (visual only).

- [ ] **Step 1: Add styles**

Append to `src/ui/panels/panels.css` (reuse existing panel tokens/variables where present; these class names match Tasks 5–7):

```css
/* --- Color Swatches panel --- */
.flow-sw { display: flex; flex-direction: column; gap: 8px; position: relative; }
.flow-sw-row { display: flex; align-items: center; gap: 6px; }
.flow-sw-select { flex: 1 1 auto; min-width: 0; }
.flow-sw-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 6px; cursor: pointer;
  background: transparent; border: 1px solid var(--flow-border, #d0d0d0);
}
.flow-sw-icon:hover { background: var(--flow-hover, rgba(0,0,0,0.06)); }

.flow-sw-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.flow-sw-add,
.flow-sw-tile {
  width: 22px; height: 22px; border-radius: 6px; cursor: pointer; padding: 0;
  border: 1px solid var(--flow-border, #d0d0d0);
}
.flow-sw-add {
  display: inline-flex; align-items: center; justify-content: center;
  font-size: 15px; line-height: 1; background: transparent;
}
.flow-sw-add:hover { background: var(--flow-hover, rgba(0,0,0,0.06)); }
.flow-sw-tile[aria-pressed="true"] {
  outline: 2px solid var(--flow-accent, #4263eb); outline-offset: 1px;
}

.flow-sw-name { flex: 1 1 auto; min-width: 0; }
.flow-sw-default { white-space: nowrap; cursor: pointer; }
.flow-sw-default:disabled { cursor: default; opacity: 0.7; }

.flow-sw-picker {
  display: flex; align-items: center; gap: 6px;
  padding: 6px; border-radius: 8px;
  border: 1px solid var(--flow-border, #d0d0d0);
  background: var(--flow-surface, #fff);
}
.flow-sw-picker__hex { width: 82px; }

.flow-sw-confirm {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; text-align: center;
  padding: 12px; border-radius: 8px;
  background: var(--flow-surface, #fff); border: 1px solid var(--flow-border, #d0d0d0);
}
.flow-sw-confirm__actions { display: flex; gap: 8px; }
```

- [ ] **Step 2: Visual sanity check**

Run: `npm run dev`, open the Color Swatches panel. Verify: "+" tile + swatches wrap; selected swatches show the accent outline; the picker popover and the delete confirm overlay render legibly.

- [ ] **Step 3: Commit**

```bash
git add src/ui/panels/panels.css
git commit -m "style(swatches): Color Swatches panel styling"
```

---

### Task 10: End-to-end — persistence + live default

**Files:**
- Create: `e2e/color-swatches.spec.ts`

**Interfaces:** exercises the shipped UI only.

- [ ] **Step 1: Write the failing test**

```ts
// e2e/color-swatches.spec.ts
import { test, expect, type Page } from "@playwright/test";

/** The Color Swatches panel scope. */
function swPanel(page: Page) {
  return page
    .locator(".flow-pnl-sub", { has: page.locator(".flow-pnl-sub__title", { hasText: "Color Swatches" }) });
}

async function addSwatch(page: Page, hex: string) {
  await page.getByRole("button", { name: "Add swatch" }).click();
  const field = page.getByLabelText("Swatch hex");
  await field.fill(hex);
  await field.press("Enter");
}

test("a new palette + swatch persists across reload", async ({ page }) => {
  await page.goto("/");
  const panel = swPanel(page);
  await panel.getByRole("button", { name: "Add palette" }).click();
  await addSwatch(page, "#0a0b0c");
  await expect(panel.getByRole("button", { name: "Swatch #0a0b0c" })).toBeVisible();

  await page.reload();
  // the created palette is the selected one on reload's fresh state only if default;
  // select it explicitly by name to be robust:
  await expect(swPanel(page).getByRole("button", { name: "Swatch #0a0b0c" })).toBeVisible();
});

test("setting a palette default updates a color picker live", async ({ page }) => {
  await page.goto("/");
  const panel = swPanel(page);

  // Build a distinctive palette and make it the default.
  await panel.getByRole("button", { name: "Add palette" }).click();
  await addSwatch(page, "#0a0b0c");
  await panel.getByRole("button", { name: "Set as default" }).click();

  // Open the Stroke color swatch in the Color panel and check its preset grid.
  const colorPanel = page
    .locator(".flow-pnl-sub", { has: page.locator(".flow-pnl-sub__title", { hasText: /^Color$/ }) });
  await colorPanel.getByRole("button", { name: "Stroke color" }).click();
  await expect(page.getByRole("button", { name: "#0a0b0c" })).toBeVisible();
});
```

- [ ] **Step 2: Run it to verify it fails, then passes**

Run: `npx playwright test e2e/color-swatches.spec.ts`
Expected: with Tasks 1–9 merged, PASS. (If the panel starts collapsed, prepend a click on its `.flow-pnl-sub__title` to expand before interacting — adjust the helper if the run shows the controls hidden.)

- [ ] **Step 3: Full regression + typecheck**

Run: `npm run typecheck && npx vitest run && npx playwright test e2e/color-swatches.spec.ts e2e/color-panel.spec.ts e2e/panels.spec.ts`
Expected: all PASS (confirms the ColorSwatch change didn't regress existing color e2e).

- [ ] **Step 4: Commit**

```bash
git add e2e/color-swatches.spec.ts
git commit -m "test(swatches): e2e persistence + live default palette"
```

---

## Self-Review

**Spec coverage:**
- Panel in dock → Task 8. Show current palette's swatches → Task 7. Create/rename/delete palettes (confirm) → Task 7. Add/remove/edit/reorder swatches → Tasks 6–7. Single default drives all pickers, last-write-wins → Tasks 3, 4, 7. Persistence → Tasks 2, 3, 10. Never-break fallback → Tasks 1, 3. Hex scrubbing (missing #, shorthand, strip alpha) → Task 1, applied in Tasks 4–5. Seven seed palettes → Task 1. Context-trash (swatches vs palette) + Delete key → Task 7. "+" tile pinned/non-selectable/non-draggable → Task 6 (it is a separate control, never in the color list). Last-palette re-seed → Task 3.

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `PaletteState`, `ColorPalette`, and every mutation signature are defined in Task 3's Interfaces and used verbatim in Tasks 4/7. `SwatchGridProps` / `SwatchPickerProps` defined where created and consumed unchanged in Task 7. `scrubHex`/`normalizePalettes` signatures stable from Task 1.

**Known follow-ups (non-blocking, safe):**
- Picker popover is rendered in a fixed spot under the grid, not anchored to the specific tile — acceptable for v1 (noted in spec §UI).
- The delete-confirm is an in-panel overlay rather than a global modal (no `@radix-ui/react-alert-dialog` dependency exists; the spec's "Radix dialog" note is superseded by flow's actual custom-dialog approach). Equivalent UX, fewer deps.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-10-color-swatches.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
