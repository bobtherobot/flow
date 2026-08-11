# Color System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace flow's four scattered color surfaces with one Color panel — Illustrator-style part chooser, real HSV picker with eyedropper and alpha, HSLA/RGBA/HEX numeric entry, merged palette manager — plus a part-chooser clone pinned to a widened tool rail with a compact picker popup.

**Architecture:** The color is *derived* from the current selection via the existing `useSelectionStyle` bridge, never stored, so the panel and the rail popup are two views of one truth with no sync layer. A small `useSyncExternalStore` module (`color-store.ts`) holds only what has no canvas home: the active part, the six recents, and the numeric mode. Each picker instance keeps a local HSV draft so hue survives a drag through S=0 or V=0. Pure conversion/part-resolution/MRU logic lives in dependency-free `src/lib/` modules that are unit-tested without React.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library (jsdom), Playwright for e2e, Vite. Excalidraw consumed as a git-submodule fork at `vendor/excalidraw`.

**Spec:** `docs/superpowers/specs/2026-08-11-color-system-redesign-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **No new runtime dependencies.** Everything here is hand-rolled on top of what flow already ships.
- **Alpha storage is unchanged:** per-color 8-digit hex (`#rrggbbaa`), produced and consumed only through `splitColorAlpha` / `combineColorAlpha` in `src/lib/color-alpha.ts`. Never write Excalidraw's element-level `opacity`.
- **Drags write `transient: true`**, so `src/lib/deferred-commit.ts` batching collapses one gesture into one undo entry. The gesture-ending write is non-transient. This is the pattern established by [[scrub-numeric-inputs]].
- **`strokeWidth` is always read with `??`, never `||`.** [[drawing-defaults]] records three separate fork edits caused by falsy coercion on a legitimate `0` width. A `strokeWidth` of `0` is valid data.
- **Transparent is spelled `"transparent"`, never `"none"`.** [[drawing-defaults]]: `"none"` crashes curved arrows in the vendor renderer.
- **Recents are opaque `#rrggbb` lowercase**, max 6, deduped on hue; `"transparent"` never enters the list.
- **Grey is `#808080`**, white `#ffffff`, black `#000000`.
- **Conversions return unrounded H/S/V/L floats.** Only the numeric fields round those, at display time — rounding hue or saturation inside a conversion drifts the color on every frame of a drag. RGB channels are the exception and *are* rounded to integers, because a channel is a byte; `fromHueChroma`'s `Math.round` is correct and not a violation of this rule.
- **Colors are lowercase `#rrggbb`** everywhere, matching `scrubHex` in `src/lib/color-palettes.ts`.
- **CSS uses flow's existing design tokens, with no fallback values.** They are defined on `:root` in `src/ui/menubar/menubar.css`: `--flow-ink`, `--flow-ink-muted`, `--flow-ink-disabled`, `--flow-panel-bg`, `--flow-border`, `--flow-accent`, `--flow-hover`, `--flow-active`, `--flow-shadow`, `--flow-radius-sm`, `--flow-radius-md`, `--flow-font`, `--flow-dur-fast`, `--flow-ease`. Existing stylesheets write `var(--flow-border)` bare — match that. Never invent a token name; a `var(--made-up, #fallback)` silently renders the fallback forever and looks almost right.
- Commands: `npm test -- --run` (unit), `npm run typecheck`, `npm run test:e2e`. Both unit and typecheck must be green before every commit.
- Memory-file conventions: this project keeps memory repo-local in `.claude/memory/`. Do not write to the global Claude account.

## File Structure

**Phase 1 — pure logic and store (no UI)**

| File | Responsibility |
|---|---|
| `src/lib/color-convert.ts` | hex ⇄ RGB ⇄ HSV ⇄ HSL. Pure, no alpha (that stays in `color-alpha.ts`) |
| `src/lib/color-parts.ts` | Which parts a selection exposes; each part's prop/ids/`currentItem*`; active-part normalization; the fill↔stroke swap |
| `src/lib/recent-colors.ts` | MRU push + forgiving localStorage reader |
| `src/lib/color-store.ts` | `useSyncExternalStore` module: `activePart`, `recents`, `numericMode` |
| `src/app/preferences.ts` | +2 keys: `flow.recentColors`, `flow.colorNumericMode` |

**Phase 2 — picker primitives**

| File | Responsibility |
|---|---|
| `src/ui/color/useAreaDrag.ts` | Normalized 0–1 pointer drag over an element, with transient/commit semantics |
| `src/ui/color/slider-keys.ts` | Shared arrow-key delta helper for the sliders |
| `src/ui/color/HueSlider.tsx` | 0–360 track |
| `src/ui/color/AlphaSlider.tsx` | 0–100 track over checkerboard |
| `src/ui/color/SaturationBox.tsx` | 2D S/V field |
| `src/ui/color/ColorPreview.tsx` | Round well |
| `src/ui/color/EyeDropperButton.tsx` | Presentational; disabled until Phase 5 supplies `onPick` |
| `src/ui/color/PickerRow.tsx` | Shared eyedropper + preview + hue/alpha row, used by both surfaces |
| `src/ui/color/NumericFields.tsx` | HSLA/RGBA/HEX + mode `<select>` |
| `src/ui/color/useColorDraft.ts` | The HSV draft + commit rules shared by both surfaces |
| `src/ui/color/useColorTarget.ts` | The write path: `setColor`, `swap`, `quickSet` |
| `src/ui/color/color.css` | Styles for everything in `src/ui/color/` |

**Phase 3 — the panel**

| File | Responsibility |
|---|---|
| `src/ui/color/PartChooser.tsx` | Overlapping boxes + swap arrows + quartet |
| `src/ui/color/PaletteSection.tsx` | Dropdown + add-palette + trash + grid (absorbs `SwatchGrid`) |
| `src/ui/panels/ColorPanel.tsx` | **Rewritten** — assembles the above |
| `src/ui/panels/PanelsRoot.tsx` | Drop the `swatches` dock entry |
| `src/ui/panels/dock/panel-dock-state.test.ts` | Regression test only — `syncPanelDefs` already drops stale `swatches` ids, so no migration code |
| *deleted* | `SwatchesPanel.tsx`, `SwatchPicker.tsx`, `SwatchGrid.tsx` (+ their tests) |
| *kept* | `src/ui/panels/controls/ColorSwatch.tsx` — still used by `PreferencesDialog.tsx:207` and `BackgroundControl.tsx:15` |

**Phase 4 — rail and popup**

| File | Responsibility |
|---|---|
| `src/ui/toolbar/ToolBar.tsx` | `RAIL_WIDTH` 48 → 88, two-column tool grid, chooser pinned bottom |
| `src/ui/toolbar/toolbar.css` | Two-column grid |
| `src/ui/toolbar/RailColorControl.tsx` | Compact chooser + popup trigger |
| `src/ui/toolbar/ColorPopup.tsx` | Portal popup: saturation, eyedropper, preview, hue, alpha, six recents |
| `e2e/color.spec.ts` | Cross-surface e2e |

**Phase 5 — eyedropper**

| File | Responsibility |
|---|---|
| `vendor/excalidraw/packages/excalidraw/index.tsx` | +2 additive re-exports |
| `src/excalidraw-fork.d.ts` | Type declarations for them |
| `src/lib/eyedropper.ts` | flow-side bridge that sets the atom |

**Phase 6 — land it**

| File | Responsibility |
|---|---|
| `.claude/memory/color-system.md` | Repo-local memory for the whole system |
| `.claude/memory/MEMORY.md` | Index line; amend the `color-swatches` line |

---

## Phase 1 — Pure logic and store

### Task 1: Color conversion module

**Files:**
- Create: `src/lib/color-convert.ts`
- Test: `src/lib/color-convert.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Rgb {r,g,b}` (0–255), `Hsv {h,s,v}` (h 0–360, s/v 0–100), `Hsl {h,s,l}` (same ranges); `hexToRgb(hex: string): Rgb | null`, `rgbToHex(rgb: Rgb): string`, `rgbToHsv(rgb: Rgb): Hsv`, `hsvToRgb(hsv: Hsv): Rgb`, `rgbToHsl(rgb: Rgb): Hsl`, `hslToRgb(hsl: Hsl): Rgb`, `hexToHsv(hex: string): Hsv | null`, `hsvToHex(hsv: Hsv): string`, `hexToHsl(hex: string): Hsl | null`, `hslToHex(hsl: Hsl): string`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/color-convert.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb,
  hexToHsv, hsvToHex, hexToHsl, hslToHex,
} from "./color-convert";

describe("hexToRgb", () => {
  it("parses a 6-digit hex", () => {
    expect(hexToRgb("#ff8000")).toEqual({ r: 255, g: 128, b: 0 });
  });

  it("accepts uppercase and a 3-digit shorthand", () => {
    expect(hexToRgb("#F00")).toEqual({ r: 255, g: 0, b: 0 });
  });

  it("rejects junk", () => {
    expect(hexToRgb("transparent")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
  });
});

describe("rgbToHex", () => {
  it("formats lowercase and zero-padded", () => {
    expect(rgbToHex({ r: 0, g: 8, b: 255 })).toBe("#0008ff");
  });

  it("clamps and rounds out-of-range channels", () => {
    expect(rgbToHex({ r: -5, g: 127.6, b: 300 })).toBe("#0080ff");
  });
});

describe("rgb <-> hsv", () => {
  it("reads pure red", () => {
    expect(rgbToHsv({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, v: 100 });
  });

  it("reads black with no hue or saturation", () => {
    expect(rgbToHsv({ r: 0, g: 0, b: 0 })).toEqual({ h: 0, s: 0, v: 0 });
  });

  it("round-trips a mid tone", () => {
    const rgb = { r: 32, g: 145, b: 194 };
    expect(hsvToRgb(rgbToHsv(rgb))).toEqual(rgb);
  });

  it("builds green from hsv", () => {
    expect(hsvToRgb({ h: 120, s: 100, v: 100 })).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("wraps a hue of 360 back to 0", () => {
    expect(hsvToRgb({ h: 360, s: 100, v: 100 })).toEqual({ r: 255, g: 0, b: 0 });
  });
});

describe("rgb <-> hsl", () => {
  it("reads a 50% lightness pure hue", () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0 })).toEqual({ h: 0, s: 100, l: 50 });
  });

  it("reads white as fully light and unsaturated", () => {
    expect(rgbToHsl({ r: 255, g: 255, b: 255 })).toEqual({ h: 0, s: 0, l: 100 });
  });

  it("round-trips a mid tone", () => {
    const rgb = { r: 32, g: 145, b: 194 };
    expect(hslToRgb(rgbToHsl(rgb))).toEqual(rgb);
  });
});

describe("hex convenience wrappers", () => {
  it("round-trips hex through hsv", () => {
    expect(hsvToHex(hexToHsv("#2091c2")!)).toBe("#2091c2");
  });

  it("round-trips hex through hsl", () => {
    expect(hslToHex(hexToHsl("#2091c2")!)).toBe("#2091c2");
  });

  it("returns null from the hex readers on junk", () => {
    expect(hexToHsv("nope")).toBeNull();
    expect(hexToHsl("nope")).toBeNull();
  });
});

describe("float fidelity", () => {
  it("does not round inside conversions", () => {
    // #2091c2 has a fractional hue; rounding here would break the draft round-trip.
    const hsv = hexToHsv("#2091c2")!;
    expect(Number.isInteger(hsv.h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/color-convert.test.ts`
Expected: FAIL — `Failed to resolve import "./color-convert"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/color-convert.ts`:

```ts
/**
 * Pure color-space conversion. Alpha is deliberately absent — `color-alpha.ts`
 * owns the alpha byte and the 8-digit-hex storage convention, and these
 * functions only ever see the opaque hue.
 *
 * Conversions return **unrounded floats**. The picker keeps an HSV draft across
 * a drag, and rounding at each hop would drift the color a little on every
 * frame; only the numeric fields round, at display time.
 */

export interface Rgb {
  /** 0–255 */
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  v: number;
}

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Normalize any hue into [0, 360). */
const wrapHue = (h: number) => ((h % 360) + 360) % 360;

/** Shared hue/chroma decomposition for the two "…ToRgb" directions. */
function fromHueChroma(h: number, c: number, m: number): Rgb {
  const hp = wrapHue(h) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0]
    : hp < 2 ? [x, c, 0]
    : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c]
    : hp < 5 ? [x, 0, c]
    : [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Hue in degrees from normalized channels, or 0 for an achromatic color. */
function hueOf(rn: number, gn: number, bn: number, max: number, d: number): number {
  if (d === 0) return 0;
  const h =
    max === rn ? 60 * (((gn - bn) / d) % 6)
    : max === gn ? 60 * ((bn - rn) / d + 2)
    : 60 * ((rn - gn) / d + 4);
  return h < 0 ? h + 360 : h;
}

/** Parse `#rgb` / `#rrggbb` (with or without the "#", any case). Null on junk. */
export function hexToRgb(hex: string): Rgb | null {
  let s = hex.trim().toLowerCase();
  if (s.startsWith("#")) s = s.slice(1);
  if (!/^[0-9a-f]+$/.test(s)) return null;
  if (s.length === 3) s = s.split("").map((c) => c + c).join("");
  if (s.length !== 6) return null;
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** Format as lowercase `#rrggbb`, clamping and rounding each channel. */
export function rgbToHex({ r, g, b }: Rgb): string {
  const byte = (v: number) =>
    clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0");
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  return {
    h: hueOf(rn, gn, bn, max, d),
    s: max === 0 ? 0 : (d / max) * 100,
    v: max * 100,
  };
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const sn = clamp(s, 0, 100) / 100;
  const vn = clamp(v, 0, 100) / 100;
  const c = vn * sn;
  return fromHueChroma(h, c, vn - c);
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const l = (max + min) / 2;
  // The 1 - |2l - 1| denominator collapses to 0 at pure black and pure white.
  const denom = 1 - Math.abs(2 * l - 1);
  return {
    h: hueOf(rn, gn, bn, max, d),
    s: d === 0 || denom === 0 ? 0 : (d / denom) * 100,
    l: l * 100,
  };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const sn = clamp(s, 0, 100) / 100;
  const ln = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  return fromHueChroma(h, c, ln - c / 2);
}

export function hexToHsv(hex: string): Hsv | null {
  const rgb = hexToRgb(hex);
  return rgb && rgbToHsv(rgb);
}

export function hsvToHex(hsv: Hsv): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToHsl(hex: string): Hsl | null {
  const rgb = hexToRgb(hex);
  return rgb && rgbToHsl(rgb);
}

export function hslToHex(hsl: Hsl): string {
  return rgbToHex(hslToRgb(hsl));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/color-convert.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/lib/color-convert.ts src/lib/color-convert.test.ts
git commit -m "feat(color): pure hex/RGB/HSV/HSL conversion module"
```

---

### Task 2: Part model

**Files:**
- Create: `src/lib/color-parts.ts`
- Test: `src/lib/color-parts.test.ts`

**Interfaces:**
- Consumes: `SelectedElementIds`, `resolveTextTargetIds` from `src/lib/selection-style.ts`.
- Produces: `ColorPart = "fill" | "stroke" | "text"`; `PartSpec { part, prop, ids, currentItemKey }`; `availableParts(elements, selectedIds): ColorPart[]`; `partSpec(part, selectedIds, textTargetIds): PartSpec`; `normalizeActivePart(available, active): ColorPart`; `swapFillStroke(el): Record<string, unknown> | null`.

Note on the shape: `availableParts` takes the raw element list so it can call `resolveTextTargetIds` itself; `partSpec` takes the already-resolved id maps so the hook can compute them once per render.

- [ ] **Step 1: Write the failing test**

Create `src/lib/color-parts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  availableParts, partSpec, normalizeActivePart, swapFillStroke,
} from "./color-parts";

/** Minimal element stand-ins.
 *
 *  Note the container binding: `resolveTextTargetIds` reads `boundElements` on
 *  the CONTAINER (`selection-style.ts:46`), not `containerId` on the child.
 *  Real Excalidraw keeps both in sync; a fixture carrying only `containerId`
 *  would resolve to no text targets and quietly test nothing. */
const rect = { id: "r1", type: "rectangle", strokeColor: "#111111", backgroundColor: "#eeeeee" };
const text = { id: "t1", type: "text", strokeColor: "#222222" };
const label = { id: "t2", type: "text", strokeColor: "#333333", containerId: "r1" };
const labeledRect = { ...rect, boundElements: [{ id: "t2", type: "text" }] };

describe("availableParts", () => {
  it("gives a shape fill and stroke", () => {
    expect(availableParts([rect], { r1: true })).toEqual(["fill", "stroke"]);
  });

  it("gives a bare text element only the text part", () => {
    expect(availableParts([text], { t1: true })).toEqual(["text"]);
  });

  it("gives a labeled container all three", () => {
    expect(availableParts([labeledRect, label], { r1: true })).toEqual(["fill", "stroke", "text"]);
  });

  it("falls back to fill and stroke with nothing selected", () => {
    expect(availableParts([rect], {})).toEqual(["fill", "stroke"]);
  });
});

describe("partSpec", () => {
  it("maps fill to backgroundColor over the selection", () => {
    expect(partSpec("fill", { r1: true }, {})).toEqual({
      part: "fill",
      prop: "backgroundColor",
      ids: { r1: true },
      currentItemKey: "currentItemBackgroundColor",
    });
  });

  it("maps stroke to strokeColor over the selection", () => {
    expect(partSpec("stroke", { r1: true }, {})).toEqual({
      part: "stroke",
      prop: "strokeColor",
      ids: { r1: true },
      currentItemKey: "currentItemStrokeColor",
    });
  });

  it("maps text to strokeColor over the resolved text targets", () => {
    expect(partSpec("text", { r1: true }, { t2: true })).toEqual({
      part: "text",
      prop: "strokeColor",
      ids: { t2: true },
      currentItemKey: "currentItemTextColor",
    });
  });
});

describe("normalizeActivePart", () => {
  it("keeps an available part", () => {
    expect(normalizeActivePart(["fill", "stroke"], "stroke")).toBe("stroke");
  });

  it("forces text when text is the only part", () => {
    expect(normalizeActivePart(["text"], "fill")).toBe("text");
  });

  it("falls back to fill when the active part is unavailable", () => {
    expect(normalizeActivePart(["fill", "stroke"], "text")).toBe("fill");
  });

  it("falls back to the first part when even fill is unavailable", () => {
    expect(normalizeActivePart(["text"], "stroke")).toBe("text");
  });
});

describe("swapFillStroke", () => {
  it("exchanges the two colors", () => {
    expect(swapFillStroke(rect)).toEqual({
      backgroundColor: "#111111",
      strokeColor: "#eeeeee",
    });
  });

  it("returns null when the two already match", () => {
    expect(swapFillStroke({ ...rect, strokeColor: "#aaaaaa", backgroundColor: "#aaaaaa" })).toBeNull();
  });

  it("carries transparent through in either direction", () => {
    expect(swapFillStroke({ ...rect, backgroundColor: "transparent" })).toEqual({
      backgroundColor: "#111111",
      strokeColor: "transparent",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/color-parts.test.ts`
Expected: FAIL — `Failed to resolve import "./color-parts"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/color-parts.ts`:

```ts
// src/lib/color-parts.ts
import { resolveTextTargetIds, type SelectedElementIds } from "./selection-style";

/** The three things on a selection that can carry a color. */
export type ColorPart = "fill" | "stroke" | "text";

/** Everything a write needs to know about one part. */
export interface PartSpec {
  part: ColorPart;
  /** Element property to write. */
  prop: string;
  /** Ids the write targets. */
  ids: SelectedElementIds;
  /** Matching `currentItem*` appState default. */
  currentItemKey: string;
}

interface PartTarget {
  prop: string;
  currentItemKey: string;
  /** Which resolved id map the part writes through. */
  source: "selection" | "text";
}

const TARGETS: Record<ColorPart, PartTarget> = {
  fill: {
    prop: "backgroundColor",
    currentItemKey: "currentItemBackgroundColor",
    source: "selection",
  },
  stroke: {
    prop: "strokeColor",
    currentItemKey: "currentItemStrokeColor",
    source: "selection",
  },
  // Excalidraw text has exactly one color and it lives on `strokeColor`; the
  // glyph fill and a shape's outline share a property name and nothing else.
  text: {
    prop: "strokeColor",
    currentItemKey: "currentItemTextColor",
    source: "text",
  },
};

interface PartElement {
  id: string;
  type: string;
}

/**
 * Which parts the current selection exposes.
 *
 * A bare text element gets `["text"]` alone — it has no fill and no outline of
 * its own, so offering those two boxes would offer two writes that do nothing.
 * A labeled container gets all three. An empty selection is editing the tool
 * defaults, which always have a fill and a stroke.
 */
export function availableParts(
  elements: readonly PartElement[],
  selectedIds: SelectedElementIds,
): ColorPart[] {
  const selected = elements.filter((el) => selectedIds[el.id] === true);
  const hasText = Object.keys(resolveTextTargetIds(elements as never, selectedIds)).length > 0;

  const textOnly = selected.length > 0 && selected.every((el) => el.type === "text");
  if (textOnly) return ["text"];

  return hasText ? ["fill", "stroke", "text"] : ["fill", "stroke"];
}

/** Resolve one part into its write target. */
export function partSpec(
  part: ColorPart,
  selectedIds: SelectedElementIds,
  textTargetIds: SelectedElementIds,
): PartSpec {
  const target = TARGETS[part];
  return {
    part,
    prop: target.prop,
    ids: target.source === "text" ? textTargetIds : selectedIds,
    currentItemKey: target.currentItemKey,
  };
}

/**
 * Keep the stored active part honest against what the selection actually
 * offers. Selecting text should land on the text part without the user
 * clicking anything, and a part that just became unavailable must not leave
 * the picker pointed at a write that goes nowhere.
 */
export function normalizeActivePart(available: ColorPart[], active: ColorPart): ColorPart {
  if (available.includes(active)) return active;
  return available.includes("fill") ? "fill" : available[0];
}

interface SwappableElement {
  strokeColor: string;
  backgroundColor: string;
}

/** The fill↔stroke exchange for one element, or null when it would be a no-op. */
export function swapFillStroke(el: SwappableElement): Record<string, unknown> | null {
  if (el.strokeColor === el.backgroundColor) return null;
  return { backgroundColor: el.strokeColor, strokeColor: el.backgroundColor };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/color-parts.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0. If `resolveTextTargetIds` rejects the test-shaped element, widen `PartElement` rather than loosening the real signature.

- [ ] **Step 6: Commit**

```bash
git add src/lib/color-parts.ts src/lib/color-parts.test.ts
git commit -m "feat(color): part model for fill/stroke/text targeting"
```

---

### Task 3: Recent colors and preference keys

**Files:**
- Create: `src/lib/recent-colors.ts`
- Test: `src/lib/recent-colors.test.ts`
- Modify: `src/app/preferences.ts` (append after the palette block ending ~line 252)

**Interfaces:**
- Consumes: `scrubHex` from `src/lib/color-palettes.ts`.
- Produces: `RECENT_LIMIT = 6`; `pushRecent(list: readonly string[], color: string): string[]`; `normalizeRecents(raw: unknown): string[]`; and from preferences `getRecentColors(): string[]`, `setRecentColors(v: string[]): void`, `getColorNumericMode(): NumericMode`, `setColorNumericMode(v: NumericMode): void` with `NumericMode = "hsla" | "rgba" | "hex"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/recent-colors.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pushRecent, normalizeRecents, RECENT_LIMIT } from "./recent-colors";

describe("pushRecent", () => {
  it("puts a new color at the front", () => {
    expect(pushRecent(["#111111"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("moves an existing color to the front instead of duplicating it", () => {
    expect(pushRecent(["#111111", "#222222", "#333333"], "#333333"))
      .toEqual(["#333333", "#111111", "#222222"]);
  });

  it("drops the oldest past the limit", () => {
    const full = ["#a1a1a1", "#a2a2a2", "#a3a3a3", "#a4a4a4", "#a5a5a5", "#a6a6a6"];
    const next = pushRecent(full, "#b0b0b0");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("#b0b0b0");
    expect(next).not.toContain("#a6a6a6");
  });

  it("normalizes to lowercase 6-digit hex and dedups on hue", () => {
    expect(pushRecent(["#ff0000"], "#F00")).toEqual(["#ff0000"]);
  });

  it("strips an alpha byte so nudging opacity does not burn a slot", () => {
    expect(pushRecent(["#ff0000"], "#ff000080")).toEqual(["#ff0000"]);
  });

  it("refuses transparent", () => {
    expect(pushRecent(["#111111"], "transparent")).toEqual(["#111111"]);
  });

  it("refuses junk", () => {
    expect(pushRecent(["#111111"], "not a color")).toEqual(["#111111"]);
  });

  it("does not mutate the input", () => {
    const before = ["#111111"];
    pushRecent(before, "#222222");
    expect(before).toEqual(["#111111"]);
  });
});

describe("normalizeRecents", () => {
  it("keeps clean hex", () => {
    expect(normalizeRecents(["#111111", "#222222"])).toEqual(["#111111", "#222222"]);
  });

  it("drops malformed entries and non-strings", () => {
    expect(normalizeRecents(["#111111", 7, null, "zzz", "#222222"]))
      .toEqual(["#111111", "#222222"]);
  });

  it("truncates past the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
    expect(normalizeRecents(many)).toHaveLength(RECENT_LIMIT);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeRecents(null)).toEqual([]);
    expect(normalizeRecents({ nope: true })).toEqual([]);
  });

  it("dedups", () => {
    expect(normalizeRecents(["#111111", "#111111"])).toEqual(["#111111"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/recent-colors.test.ts`
Expected: FAIL — `Failed to resolve import "./recent-colors"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/recent-colors.ts`:

```ts
// src/lib/recent-colors.ts
import { scrubHex } from "./color-palettes";

/** How many colors the recents strip holds. */
export const RECENT_LIMIT = 6;

/**
 * The user's running set of colors, most-recently-applied first. Deliberately
 * cross-document and independent of any scene: this is a cache of the colors
 * this person reaches for, not a summary of the file that happens to be open.
 *
 * Entries are opaque `#rrggbb`. `scrubHex` strips any alpha byte, so nudging
 * opacity on a color already in the list is a no-op rather than a slot burned
 * on a near-duplicate, and "transparent" (which `scrubHex` rejects) never
 * enters — that is what the quartet's *none* chip is for.
 */
export function pushRecent(list: readonly string[], color: string): string[] {
  const hex = scrubHex(color);
  if (!hex) return [...list];
  return [hex, ...list.filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
}

/** Forgiving reader for the persisted list — same job `normalizePalettes` does. */
export function normalizeRecents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const hex = scrubHex(item);
    if (hex && !out.includes(hex)) out.push(hex);
    if (out.length === RECENT_LIMIT) break;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/recent-colors.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Add the preference keys**

Read `src/app/preferences.ts` and copy the shape of the existing palette accessors (they end around line 252). Append:

```ts
// --- recent colors + numeric mode (color panel) ---

const RECENT_COLORS_KEY = "flow.recentColors";
const COLOR_NUMERIC_MODE_KEY = "flow.colorNumericMode";

/** How the color panel's numeric fields are labelled and parsed. */
export type NumericMode = "hsla" | "rgba" | "hex";

const NUMERIC_MODES: NumericMode[] = ["hsla", "rgba", "hex"];

export function getRecentColors(): string[] {
  try {
    return normalizeRecents(JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) ?? "null"));
  } catch {
    return [];
  }
}

export function setRecentColors(value: string[]): void {
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable (private mode, quota) — recents are a convenience.
  }
}

export function getColorNumericMode(): NumericMode {
  const raw = localStorage.getItem(COLOR_NUMERIC_MODE_KEY);
  return NUMERIC_MODES.includes(raw as NumericMode) ? (raw as NumericMode) : "hsla";
}

export function setColorNumericMode(value: NumericMode): void {
  try {
    localStorage.setItem(COLOR_NUMERIC_MODE_KEY, value);
  } catch {
    // As above.
  }
}
```

Add `import { normalizeRecents } from "../lib/recent-colors";` to the imports at the top. **Match the file's existing try/catch and JSON style** — read the palette accessors first and mirror them rather than assuming the shape above is identical.

- [ ] **Step 6: Add preference tests**

Append to `src/app/preferences.test.ts`, matching the file's existing describe style:

```ts
describe("recent colors", () => {
  it("defaults to an empty list", () => {
    localStorage.clear();
    expect(getRecentColors()).toEqual([]);
  });

  it("round-trips a list", () => {
    setRecentColors(["#111111", "#222222"]);
    expect(getRecentColors()).toEqual(["#111111", "#222222"]);
  });

  it("survives a corrupt payload", () => {
    localStorage.setItem("flow.recentColors", "{not json");
    expect(getRecentColors()).toEqual([]);
  });

  it("scrubs junk entries on read", () => {
    localStorage.setItem("flow.recentColors", JSON.stringify(["#111111", "zzz"]));
    expect(getRecentColors()).toEqual(["#111111"]);
  });
});

describe("color numeric mode", () => {
  it("defaults to hsla", () => {
    localStorage.clear();
    expect(getColorNumericMode()).toBe("hsla");
  });

  it("round-trips a mode", () => {
    setColorNumericMode("rgba");
    expect(getColorNumericMode()).toBe("rgba");
  });

  it("rejects an unknown stored mode", () => {
    localStorage.setItem("flow.colorNumericMode", "cmyk");
    expect(getColorNumericMode()).toBe("hsla");
  });
});
```

Add the four new names to that file's existing import from `./preferences`.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `npm test -- --run && npm run typecheck`
Expected: all green, including the pre-existing tests.

- [ ] **Step 8: Commit**

```bash
git add src/lib/recent-colors.ts src/lib/recent-colors.test.ts src/app/preferences.ts src/app/preferences.test.ts
git commit -m "feat(color): recent-colors MRU + flow.recentColors/colorNumericMode prefs"
```

---

### Task 4: Color store

**Files:**
- Create: `src/lib/color-store.ts`
- Test: `src/lib/color-store.test.ts`

**Interfaces:**
- Consumes: `pushRecent` from `recent-colors.ts`; `getRecentColors`/`setRecentColors`/`getColorNumericMode`/`setColorNumericMode`/`NumericMode` from `../app/preferences`; `ColorPart` from `color-parts.ts`.
- Produces: `subscribe(fn): () => void`, `getSnapshot(): ColorUiState`, `useColorUiState(): ColorUiState`, `setActivePart(part: ColorPart): void`, `recordRecent(color: string): void`, `setNumericMode(mode: NumericMode): void`, `reloadColorStore(): void`. `ColorUiState { activePart: ColorPart; recents: string[]; numericMode: NumericMode }`.

Mirror `src/lib/palette-store.ts` exactly — read it before writing this.

- [ ] **Step 1: Write the failing test**

Create `src/lib/color-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  subscribe, getSnapshot, setActivePart, recordRecent, setNumericMode, reloadColorStore,
} from "./color-store";

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
});

describe("color-store", () => {
  it("starts on fill, empty recents, hsla", () => {
    expect(getSnapshot()).toEqual({ activePart: "fill", recents: [], numericMode: "hsla" });
  });

  it("returns a stable snapshot between mutations", () => {
    // useSyncExternalStore loops forever if getSnapshot returns a fresh object.
    expect(getSnapshot()).toBe(getSnapshot());
  });

  it("notifies subscribers on a part change", () => {
    const fn = vi.fn();
    subscribe(fn);
    setActivePart("stroke");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(getSnapshot().activePart).toBe("stroke");
  });

  it("stops notifying after unsubscribe", () => {
    const fn = vi.fn();
    subscribe(fn)();
    setActivePart("stroke");
    expect(fn).not.toHaveBeenCalled();
  });

  it("skips the notification when the part is unchanged", () => {
    const fn = vi.fn();
    subscribe(fn);
    setActivePart("fill");
    expect(fn).not.toHaveBeenCalled();
  });

  it("records a recent and persists it", () => {
    recordRecent("#ff0000");
    expect(getSnapshot().recents).toEqual(["#ff0000"]);
    expect(JSON.parse(localStorage.getItem("flow.recentColors")!)).toEqual(["#ff0000"]);
  });

  it("ignores a recent that changes nothing", () => {
    recordRecent("#ff0000");
    const fn = vi.fn();
    subscribe(fn);
    recordRecent("#ff0000");
    expect(fn).not.toHaveBeenCalled();
  });

  it("persists the numeric mode", () => {
    setNumericMode("hex");
    expect(getSnapshot().numericMode).toBe("hex");
    expect(localStorage.getItem("flow.colorNumericMode")).toBe("hex");
  });

  it("rehydrates from storage on reload", () => {
    localStorage.setItem("flow.recentColors", JSON.stringify(["#00ff00"]));
    localStorage.setItem("flow.colorNumericMode", "rgba");
    reloadColorStore();
    expect(getSnapshot().recents).toEqual(["#00ff00"]);
    expect(getSnapshot().numericMode).toBe("rgba");
  });

  it("does not persist the active part", () => {
    setActivePart("text");
    reloadColorStore();
    expect(getSnapshot().activePart).toBe("fill");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/color-store.test.ts`
Expected: FAIL — `Failed to resolve import "./color-store"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/color-store.ts`:

```ts
// src/lib/color-store.ts
import { useSyncExternalStore } from "react";
import type { ColorPart } from "./color-parts";
import { pushRecent } from "./recent-colors";
import {
  getRecentColors,
  setRecentColors,
  getColorNumericMode,
  setColorNumericMode,
  type NumericMode,
} from "../app/preferences";

/**
 * The color UI state that has no home on the canvas.
 *
 * Note what is *not* here: the color itself. That is derived from the selection
 * (see `useColorTarget`), so the panel and the rail popup are two views of one
 * truth rather than two caches that can drift apart.
 *
 * `activePart` is intentionally session-only — which box is frontmost is a
 * property of what you are doing right now, not a preference.
 */
export interface ColorUiState {
  activePart: ColorPart;
  recents: string[];
  numericMode: NumericMode;
}

const listeners = new Set<() => void>();
let state: ColorUiState = load();

function load(): ColorUiState {
  return {
    activePart: "fill",
    recents: getRecentColors(),
    numericMode: getColorNumericMode(),
  };
}

function commit(next: ColorUiState): void {
  state = next;
  for (const l of listeners) l();
}

// --- read API (useSyncExternalStore contract) ---

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Must return a stable reference between mutations or React loops forever. */
export function getSnapshot(): ColorUiState {
  return state;
}

export function useColorUiState(): ColorUiState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Re-read persisted state (test seam / cross-tab reload). */
export function reloadColorStore(): void {
  state = load();
  for (const l of listeners) l();
}

// --- mutations ---

export function setActivePart(activePart: ColorPart): void {
  if (state.activePart === activePart) return;
  commit({ ...state, activePart });
}

export function recordRecent(color: string): void {
  const recents = pushRecent(state.recents, color);
  // pushRecent returns a fresh array even for a no-op, so compare contents.
  const unchanged =
    recents.length === state.recents.length && recents.every((c, i) => c === state.recents[i]);
  if (unchanged) return;
  setRecentColors(recents);
  commit({ ...state, recents });
}

export function setNumericMode(numericMode: NumericMode): void {
  if (state.numericMode === numericMode) return;
  setColorNumericMode(numericMode);
  commit({ ...state, numericMode });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/color-store.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Full suite and typecheck**

Run: `npm test -- --run && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/color-store.ts src/lib/color-store.test.ts
git commit -m "feat(color): color-store for active part, recents and numeric mode"
```

---

**Phase 1 checkpoint.** Four pure modules, ~50 unit tests, zero UI changes and zero behavior change in the running app. `npm test -- --run && npm run typecheck` must be fully green before Phase 2.

---

## Phase 2 — Picker primitives

Everything in this phase is presentational or a hook. Nothing is mounted into
the app yet, so the running UI is unchanged until Phase 3.

### Task 5: Normalized pointer-drag hook

**Files:**
- Create: `src/ui/color/useAreaDrag.ts`
- Test: `src/ui/color/useAreaDrag.test.tsx`

**Interfaces:**
- Consumes: nothing. Deliberately independent of `dock/useDrag.ts`, which reports pixel deltas; this one reports a normalized position within an element.
- Produces: `AreaPos { x: number; y: number }` (0–1 fractions) and `useAreaDrag(opts: { onChange: (pos: AreaPos, transient: boolean) => void }): { ref: React.RefObject<HTMLDivElement | null>; onPointerDown: (e: React.PointerEvent) => void }`.

Why a hook and not three copies: the hue slider, alpha slider and saturation
box are the same gesture — press anywhere to jump there, drag to track, release
to commit — differing only in which axes they read.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/useAreaDrag.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useAreaDrag } from "./useAreaDrag";

function Harness({ onChange }: { onChange: (p: { x: number; y: number }, t: boolean) => void }) {
  const { ref, onPointerDown } = useAreaDrag({ onChange });
  return <div ref={ref} data-testid="area" onPointerDown={onPointerDown} />;
}

/** jsdom gives every element a zero-size box; fake a 200x100 one at the origin. */
function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

let onChange: ReturnType<typeof vi.fn>;

beforeEach(() => {
  onChange = vi.fn();
  render(<Harness onChange={onChange} />);
  stubBox(screen.getByTestId("area"));
});

function press(clientX: number, clientY: number) {
  screen.getByTestId("area").dispatchEvent(
    new PointerEvent("pointerdown", { clientX, clientY, bubbles: true, pointerId: 1, button: 0 }),
  );
}

describe("useAreaDrag", () => {
  it("reports a normalized position on press, transiently", () => {
    press(100, 50);
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 }, true);
  });

  it("tracks pointermove on the window", () => {
    press(0, 0);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 25, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0.25, y: 0.25 }, true);
  });

  it("clamps outside the box", () => {
    press(0, 0);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: -80, clientY: 400, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0, y: 1 }, true);
  });

  it("commits non-transiently on pointerup", () => {
    press(100, 50);
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 100, clientY: 50, pointerId: 1 }));
    expect(onChange).toHaveBeenCalledWith({ x: 0.5, y: 0.5 }, false);
  });

  it("stops tracking after release", () => {
    press(0, 0);
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: 0, clientY: 0, pointerId: 1 }));
    onChange.mockClear();
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: 100, clientY: 50, pointerId: 1 }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/useAreaDrag.test.tsx`
Expected: FAIL — `Failed to resolve import "./useAreaDrag"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/useAreaDrag.ts`:

```ts
import { useCallback, useEffect, useRef } from "react";

export interface AreaPos {
  /** 0–1 fraction across the element's width. */
  x: number;
  /** 0–1 fraction down the element's height. */
  y: number;
}

interface UseAreaDragOptions {
  /** `transient` is true for the press and every move, false for the release.
   *  Callers forward it straight to the scene write, so one gesture collapses
   *  into one undo entry (see `src/lib/deferred-commit.ts`). */
  onChange: (pos: AreaPos, transient: boolean) => void;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Press-and-drag over a rectangular control, reported as a normalized position.
 * Shared by the hue slider, the alpha slider and the saturation box, which are
 * the same gesture reading different axes.
 *
 * Listeners live on the window rather than the element so a drag that leaves
 * the control keeps tracking — sliding off the edge of a saturation box should
 * pin to that edge, not freeze mid-gesture.
 */
export function useAreaDrag({ onChange }: UseAreaDragOptions) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);
  // Held in a ref so the window listeners never close over a stale callback.
  const latest = useRef(onChange);
  latest.current = onChange;

  const report = useCallback((clientX: number, clientY: number, transient: boolean) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    latest.current(
      {
        x: clamp01((clientX - rect.left) / rect.width),
        y: clamp01((clientY - rect.top) / rect.height),
      },
      transient,
    );
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      report(e.clientX, e.clientY, true);
    };
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      report(e.clientX, e.clientY, false);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [report]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      dragging.current = true;
      report(e.clientX, e.clientY, true);
    },
    [report],
  );

  return { ref, onPointerDown };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/useAreaDrag.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/useAreaDrag.ts src/ui/color/useAreaDrag.test.tsx
git commit -m "feat(color): normalized pointer-drag hook for picker controls"
```

---

### Task 6: Hue and alpha sliders

**Files:**
- Create: `src/ui/color/slider-keys.ts`, `src/ui/color/HueSlider.tsx`, `src/ui/color/AlphaSlider.tsx`, `src/ui/color/color.css`
- Test: `src/ui/color/sliders.test.tsx`

**Interfaces:**
- Consumes: `useAreaDrag` (Task 5); `hsvToHex` (Task 1).
- Produces (shared): `keyDelta(e: React.KeyboardEvent, step: number, coarse: number): number` from `slider-keys.ts`.
- Produces: `HueSlider({ hue, onChange }: { hue: number; onChange: (hue: number, transient: boolean) => void })` with `hue` 0–360; `AlphaSlider({ alpha, hue, onChange }: { alpha: number; hue: number; onChange: (alpha: number, transient: boolean) => void })` with `alpha` 0–100. `AlphaSlider` takes `hue` only to paint its ramp.

Both expose `role="slider"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`
and handle arrow keys, so the picker works without a pointer.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/sliders.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";

function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 12, right: 200, bottom: 12, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

describe("HueSlider", () => {
  it("exposes slider semantics", () => {
    render(<HueSlider hue={120} onChange={vi.fn()} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    expect(el).toHaveAttribute("aria-valuenow", "120");
    expect(el).toHaveAttribute("aria-valuemin", "0");
    expect(el).toHaveAttribute("aria-valuemax", "360");
  });

  it("maps a press to a hue transiently", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={0} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    stubBox(el);
    // clientY deliberately gives a DIFFERENT fraction than clientX (0.25 vs 0.5)
    // on the 200x12 stub: if the slider ever read pos.y, this must fail.
    fireEvent.pointerDown(el, { clientX: 100, clientY: 3, button: 0 });
    expect(onChange).toHaveBeenCalledWith(180, true);
  });

  it("steps with arrow keys and commits immediately", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /hue/i });
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith(121, false);
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(119, false);
  });

  it("takes a coarse step with shift", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight", shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(130, false);
  });

  it("clamps arrow steps at the ends", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={0} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowLeft" });
    expect(onChange).toHaveBeenCalledWith(0, false);
  });

  it("ignores unrelated keys", () => {
    const onChange = vi.fn();
    render(<HueSlider hue={120} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "a" });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("AlphaSlider", () => {
  it("exposes slider semantics on a 0-100 range", () => {
    render(<AlphaSlider alpha={40} hue={0} onChange={vi.fn()} />);
    const el = screen.getByRole("slider", { name: /opacity/i });
    expect(el).toHaveAttribute("aria-valuenow", "40");
    expect(el).toHaveAttribute("aria-valuemax", "100");
  });

  it("maps a press to an alpha percentage", () => {
    const onChange = vi.fn();
    render(<AlphaSlider alpha={0} hue={0} onChange={onChange} />);
    const el = screen.getByRole("slider", { name: /opacity/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 50, clientY: 6, button: 0 });
    expect(onChange).toHaveBeenCalledWith(25, true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/sliders.test.tsx`
Expected: FAIL — unresolved imports for `./HueSlider` and `./AlphaSlider`.

- [ ] **Step 3: Write the shared key helper**

Create `src/ui/color/slider-keys.ts`:

```ts
/** Arrow-key delta for a slider event, or 0 when the key isn't ours.
 *  Shared by the hue and alpha tracks — same gesture, different range. */
export function keyDelta(e: React.KeyboardEvent, step: number, coarse: number): number {
  const size = e.shiftKey ? coarse : step;
  if (e.key === "ArrowRight" || e.key === "ArrowUp") return size;
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") return -size;
  return 0;
}
```

- [ ] **Step 4: Write HueSlider**

Create `src/ui/color/HueSlider.tsx`:

```tsx
import "./color.css";
import { useAreaDrag } from "./useAreaDrag";
import { keyDelta } from "./slider-keys";

interface HueSliderProps {
  /** 0–360. */
  hue: number;
  onChange: (hue: number, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

/** The rainbow track. Horizontal only — the vertical axis is ignored. */
export function HueSlider({ hue, onChange }: HueSliderProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) => onChange(Math.round(pos.x * 360), transient),
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = keyDelta(e, STEP, COARSE_STEP);
    if (delta === 0) return;
    e.preventDefault();
    // Clamped rather than wrapped: a hue that jumps 0 → 359 under the keyboard
    // reads as a bug, even though the color space really is a circle.
    onChange(Math.max(0, Math.min(360, Math.round(hue) + delta)), false);
  };

  return (
    <div
      ref={ref}
      className="flow-clr-slider flow-clr-slider--hue"
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuenow={Math.round(hue)}
      aria-valuemin={0}
      aria-valuemax={360}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-slider__thumb"
        style={{ left: `${(hue / 360) * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
```

- [ ] **Step 5: Write AlphaSlider**

Create `src/ui/color/AlphaSlider.tsx`:

```tsx
import "./color.css";
import { hsvToHex } from "../../lib/color-convert";
import { useAreaDrag } from "./useAreaDrag";
import { keyDelta } from "./slider-keys";

interface AlphaSliderProps {
  /** 0–100. */
  alpha: number;
  /** 0–360, used only to paint the ramp. */
  hue: number;
  onChange: (alpha: number, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

/** Opacity track: a transparent→opaque ramp of the current hue laid over a
 *  checkerboard, so the alpha reads at a glance. */
export function AlphaSlider({ alpha, hue, onChange }: AlphaSliderProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) => onChange(Math.round(pos.x * 100), transient),
  });

  const solid = hsvToHex({ h: hue, s: 100, v: 100 });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = keyDelta(e, STEP, COARSE_STEP);
    if (delta === 0) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(100, Math.round(alpha) + delta)), false);
  };

  return (
    <div
      ref={ref}
      className="flow-clr-slider flow-clr-slider--alpha"
      role="slider"
      tabIndex={0}
      aria-label="Opacity"
      aria-valuenow={Math.round(alpha)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ ["--flow-clr-ramp" as string]: solid }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-slider__thumb"
        style={{ left: `${alpha}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
```

- [ ] **Step 6: Write the stylesheet**

Create `src/ui/color/color.css`. **Read `src/ui/panels/panels.css` first** and
reuse its custom properties and border/radius conventions instead of inventing
new ones; the fallbacks below are placeholders for whatever that file actually
names.

```css
/* src/ui/color/color.css — styles for every control in src/ui/color/. */

.flow-clr-slider {
  position: relative;
  height: 14px;
  border-radius: 7px;
  cursor: pointer;
  touch-action: none;
  border: 1px solid var(--flow-border);
}

.flow-clr-slider:focus-visible {
  outline: 2px solid var(--flow-accent);
  outline-offset: 2px;
}

.flow-clr-slider--hue {
  background: linear-gradient(
    to right,
    #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%
  );
}

/* Checkerboard beneath a transparent→opaque ramp of the live hue. */
.flow-clr-slider--alpha {
  background-image:
    linear-gradient(to right, transparent, var(--flow-clr-ramp, #000)),
    conic-gradient(#c8c8c8 0 25%, #fff 0 50%, #c8c8c8 0 75%, #fff 0);
  background-size: 100% 100%, 10px 10px;
}

.flow-clr-slider__thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border-radius: 50%;
  background: #fff;
  border: 1px solid var(--flow-border);
  box-shadow: 0 1px 3px rgb(0 0 0 / 30%);
  transform: translateY(-50%);
  pointer-events: none;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/sliders.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/slider-keys.ts src/ui/color/HueSlider.tsx src/ui/color/AlphaSlider.tsx src/ui/color/color.css src/ui/color/sliders.test.tsx
git commit -m "feat(color): hue and alpha sliders"
```

---

### Task 7: Saturation box

**Files:**
- Create: `src/ui/color/SaturationBox.tsx`
- Modify: `src/ui/color/color.css` (append)
- Test: `src/ui/color/SaturationBox.test.tsx`

**Interfaces:**
- Consumes: `useAreaDrag` (Task 5); `hsvToHex` (Task 1).
- Produces: `SaturationBox({ hsv, onChange }: { hsv: Hsv; onChange: (sv: { s: number; v: number }, transient: boolean) => void })`. It reports **only** S and V; hue is owned by the slider, which is what keeps hue stable while the user drags into a corner.

X maps to saturation 0→100 left-to-right; Y maps to value 100→0 top-to-bottom.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/SaturationBox.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SaturationBox } from "./SaturationBox";

function stubBox(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
}

const base = { h: 200, s: 50, v: 50 };

describe("SaturationBox", () => {
  it("maps the top-right corner to full saturation and value", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 200, clientY: 0, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ s: 100, v: 100 }, true);
  });

  it("maps the bottom-left corner to zero saturation and value", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    stubBox(el);
    fireEvent.pointerDown(el, { clientX: 0, clientY: 100, button: 0 });
    expect(onChange).toHaveBeenCalledWith({ s: 0, v: 0 }, true);
  });

  it("paints its backdrop from the hue alone", () => {
    render(<SaturationBox hsv={{ h: 0, s: 10, v: 10 }} onChange={vi.fn()} />);
    // Pure red at full S/V — proves S and V do not leak into the backdrop.
    expect(screen.getByRole("application", { name: /saturation/i })).toHaveStyle({
      backgroundColor: "#ff0000",
    });
  });

  it("steps saturation and value with arrow keys, committing", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={base} onChange={onChange} />);
    const el = screen.getByRole("application", { name: /saturation/i });
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ s: 51, v: 50 }, false);
    fireEvent.keyDown(el, { key: "ArrowUp" });
    expect(onChange).toHaveBeenCalledWith({ s: 50, v: 51 }, false);
  });

  it("clamps arrow steps at the edges", () => {
    const onChange = vi.fn();
    render(<SaturationBox hsv={{ h: 200, s: 100, v: 100 }} onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole("application", { name: /saturation/i }), { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith({ s: 100, v: 100 }, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/SaturationBox.test.tsx`
Expected: FAIL — `Failed to resolve import "./SaturationBox"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/SaturationBox.tsx`:

```tsx
import "./color.css";
import { hsvToHex, type Hsv } from "../../lib/color-convert";
import { useAreaDrag } from "./useAreaDrag";

interface SaturationBoxProps {
  hsv: Hsv;
  /** Reports S and V only; hue belongs to the slider. */
  onChange: (sv: { s: number; v: number }, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * The 2D field: saturation left→right, value top→bottom over a backdrop of the
 * pure hue. Reporting S/V without touching H is the whole point — it is what
 * lets a user drag into the black corner and back out with their hue intact.
 *
 * `role="application"` rather than a slider: this is a two-axis control, and
 * there is no ARIA slider that carries two values.
 */
export function SaturationBox({ hsv, onChange }: SaturationBoxProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) =>
      onChange({ s: Math.round(pos.x * 100), v: Math.round((1 - pos.y) * 100) }, transient),
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const size = e.shiftKey ? COARSE_STEP : STEP;
    const ds = e.key === "ArrowRight" ? size : e.key === "ArrowLeft" ? -size : 0;
    const dv = e.key === "ArrowUp" ? size : e.key === "ArrowDown" ? -size : 0;
    if (ds === 0 && dv === 0) return;
    e.preventDefault();
    onChange(
      { s: clamp100(Math.round(hsv.s) + ds), v: clamp100(Math.round(hsv.v) + dv) },
      false,
    );
  };

  return (
    <div
      ref={ref}
      className="flow-clr-satbox"
      role="application"
      tabIndex={0}
      aria-label={`Saturation and brightness, ${Math.round(hsv.s)}% and ${Math.round(hsv.v)}%`}
      style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-satbox__thumb"
        style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
```

- [ ] **Step 4: Append the styles**

Append to `src/ui/color/color.css`:

```css
/* Saturation/value field: a white→transparent wash across, black up from the
   bottom, over a solid backdrop of the current hue set inline. */
.flow-clr-satbox {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: 4px;
  cursor: crosshair;
  touch-action: none;
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
  border: 1px solid var(--flow-border);
}

.flow-clr-satbox:focus-visible {
  outline: 2px solid var(--flow-accent);
  outline-offset: 2px;
}

.flow-clr-satbox__thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 40%);
  pointer-events: none;
}
```

Note the inline `backgroundColor` and the CSS `background-image` compose: the
two gradients sit above the flat hue, which is why the component sets only the
color inline.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/SaturationBox.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/SaturationBox.tsx src/ui/color/color.css src/ui/color/SaturationBox.test.tsx
git commit -m "feat(color): 2D saturation/value field"
```

---

### Task 8: Preview well, eyedropper button, and the shared picker row

**Files:**
- Create: `src/ui/color/ColorPreview.tsx`, `src/ui/color/EyeDropperButton.tsx`, `src/ui/color/PickerRow.tsx`
- Modify: `src/ui/color/color.css` (append)
- Test: `src/ui/color/preview.test.tsx`

**Interfaces:**
- Consumes: `HueSlider`, `AlphaSlider` (Task 6); `hsvToHex`, `Hsv` (Task 1).
- Produces: `ColorPreview({ hex, alpha }: { hex: string; alpha: number })` where `hex` may be `"transparent"`; `EyeDropperButton({ onPick }: { onPick?: () => void })`; and `PickerRow({ hsv, alpha, isNone, onHue, onAlpha, onPick }: { hsv: Hsv; alpha: number; isNone: boolean; onHue: (h: number, transient: boolean) => void; onAlpha: (a: number, transient: boolean) => void; onPick?: () => void })`.

`PickerRow` is the eyedropper + preview + stacked-tracks strip that the panel
and the rail popup both show identically. The two surfaces still own their own
overall layout — they differ in where the saturation box sits — but this row is
byte-for-byte the same in both, so it is a component rather than a copy.

`EyeDropperButton` is presentational on purpose. `onPick` is optional and the
button renders **disabled** without it, so Phase 2 can ship a complete-looking
picker while the vendor bridge lands in Phase 5 by passing one prop.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/preview.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPreview } from "./ColorPreview";
import { EyeDropperButton } from "./EyeDropperButton";

describe("ColorPreview", () => {
  it("paints the color at full opacity", () => {
    render(<ColorPreview hex="#ff0000" alpha={100} />);
    expect(screen.getByLabelText(/current color/i)).toHaveStyle({ backgroundColor: "#ff0000" });
  });

  it("reports the color and opacity in its accessible name", () => {
    render(<ColorPreview hex="#ff0000" alpha={40} />);
    expect(screen.getByLabelText("Current color #ff0000, 40% opacity")).toBeInTheDocument();
  });

  it("shows the checkerboard when the color is transparent", () => {
    render(<ColorPreview hex="transparent" alpha={0} />);
    expect(screen.getByLabelText(/no color/i)).toHaveClass("flow-clr-preview--none");
  });
});

describe("EyeDropperButton", () => {
  it("is disabled with no handler", () => {
    render(<EyeDropperButton />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeDisabled();
  });

  it("calls the handler when clicked", () => {
    const onPick = vi.fn();
    render(<EyeDropperButton onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /pick a color/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});

describe("PickerRow", () => {
  const hsv = { h: 200, s: 50, v: 80 };

  it("renders the eyedropper, preview and both tracks", () => {
    render(<PickerRow hsv={hsv} alpha={100} isNone={false} onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/current color/i)).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
  });

  it("shows the none preview when isNone", () => {
    render(<PickerRow hsv={hsv} alpha={0} isNone onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByLabelText(/no color/i)).toBeInTheDocument();
  });

  it("forwards hue and alpha changes", () => {
    const onHue = vi.fn();
    const onAlpha = vi.fn();
    render(<PickerRow hsv={hsv} alpha={100} isNone={false} onHue={onHue} onAlpha={onAlpha} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight" });
    expect(onHue).toHaveBeenCalledWith(201, false);
    fireEvent.keyDown(screen.getByRole("slider", { name: /opacity/i }), { key: "ArrowLeft" });
    expect(onAlpha).toHaveBeenCalledWith(99, false);
  });
});
```

Add `PickerRow` to the imports at the top of that test file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/preview.test.tsx`
Expected: FAIL — unresolved imports.

- [ ] **Step 3: Write ColorPreview**

Create `src/ui/color/ColorPreview.tsx`:

```tsx
import "./color.css";

interface ColorPreviewProps {
  /** `#rrggbb` or "transparent". */
  hex: string;
  /** 0–100. */
  alpha: number;
}

/** The round well showing the live draft color over a checkerboard. */
export function ColorPreview({ hex, alpha }: ColorPreviewProps) {
  const isNone = hex === "transparent";
  const label = isNone
    ? "No color"
    : `Current color ${hex}, ${Math.round(alpha)}% opacity`;

  return (
    <div
      className={`flow-clr-preview${isNone ? " flow-clr-preview--none" : ""}`}
      aria-label={label}
      title={label}
    >
      {!isNone && (
        <span
          className="flow-clr-preview__fill"
          style={{ backgroundColor: hex, opacity: alpha / 100 }}
        />
      )}
    </div>
  );
}
```

Note the fill is a child span rather than a background on the well itself: the
checkerboard has to sit *under* a partially transparent color, and one element
cannot layer its own background beneath its own background.

The test asserts `backgroundColor` on the element returned by
`getByLabelText`, which is the wrapper — so give the wrapper the color too when
opaque, or change the test to query the fill. **Take the second option:** amend
the first test to `screen.getByLabelText(/current color/i).firstElementChild`.

- [ ] **Step 4: Write EyeDropperButton**

Create `src/ui/color/EyeDropperButton.tsx`:

```tsx
import "./color.css";

interface EyeDropperButtonProps {
  /** Absent until Phase 5 wires the vendor eyedropper; the button renders
   *  disabled rather than absent so the layout does not shift when it lands. */
  onPick?: () => void;
}

export function EyeDropperButton({ onPick }: EyeDropperButtonProps) {
  return (
    <button
      type="button"
      className="flow-clr-eyedropper"
      aria-label="Pick a color from the canvas"
      title="Pick a color from the canvas"
      disabled={!onPick}
      onClick={onPick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none"
           stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.8 2.8 0 0 1 4 4l-8 8-4 1 1-4z" />
        <path d="M9 12 4 17v3h3l5-5" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 5: Write PickerRow**

Create `src/ui/color/PickerRow.tsx`:

```tsx
import "./color.css";
import { hsvToHex, type Hsv } from "../../lib/color-convert";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";
import { ColorPreview } from "./ColorPreview";
import { EyeDropperButton } from "./EyeDropperButton";

interface PickerRowProps {
  hsv: Hsv;
  /** 0–100. */
  alpha: number;
  /** True when the target color is "transparent". */
  isNone: boolean;
  onHue: (hue: number, transient: boolean) => void;
  onAlpha: (alpha: number, transient: boolean) => void;
  /** Absent until Phase 5 wires the eyedropper. */
  onPick?: () => void;
}

/**
 * Eyedropper, preview well and the two stacked tracks — the strip the Color
 * panel and the rail popup show identically. Their *outer* layouts differ (the
 * panel puts the saturation box beside the part chooser, the popup puts it full
 * width on top), which is why only this row is shared and not the whole picker.
 */
export function PickerRow({ hsv, alpha, isNone, onHue, onAlpha, onPick }: PickerRowProps) {
  return (
    <div className="flow-clr-row">
      <EyeDropperButton onPick={onPick} />
      <ColorPreview hex={isNone ? "transparent" : hsvToHex(hsv)} alpha={alpha} />
      <div className="flow-clr-row__tracks">
        <HueSlider hue={hsv.h} onChange={onHue} />
        <AlphaSlider alpha={alpha} hue={hsv.h} onChange={onAlpha} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Append the styles**

Append to `src/ui/color/color.css`:

```css
.flow-clr-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.flow-clr-row__tracks {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.flow-clr-preview {
  position: relative;
  width: 44px;
  height: 44px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--flow-border);
  background-image: conic-gradient(#c8c8c8 0 25%, #fff 0 50%, #c8c8c8 0 75%, #fff 0);
  background-size: 10px 10px;
}

.flow-clr-preview__fill {
  position: absolute;
  inset: 0;
}

/* "No color": a red slash over white, matching the quartet's none chip. */
.flow-clr-preview--none {
  background-image: linear-gradient(
    to bottom right,
    #fff calc(50% - 1px), #e03131 calc(50% - 1px),
    #e03131 calc(50% + 1px), #fff calc(50% + 1px)
  );
  background-size: 100% 100%;
}

.flow-clr-eyedropper {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  cursor: pointer;
  color: var(--flow-ink);
  background: none;
  border: none;
  border-radius: 4px;
}

.flow-clr-eyedropper:hover:not(:disabled) {
  background: var(--flow-hover);
}

.flow-clr-eyedropper:disabled {
  cursor: default;
  opacity: 0.4;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/preview.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 8: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/ColorPreview.tsx src/ui/color/EyeDropperButton.tsx src/ui/color/PickerRow.tsx src/ui/color/color.css src/ui/color/preview.test.tsx
git commit -m "feat(color): preview well, eyedropper button and shared picker row"
```

---

### Task 9: Numeric fields

**Files:**
- Create: `src/ui/color/NumericFields.tsx`
- Modify: `src/ui/color/color.css` (append)
- Test: `src/ui/color/NumericFields.test.tsx`

**Interfaces:**
- Consumes: `Hsv`, `hexToHsv`, `hsvToHex`, `hsvToRgb`, `rgbToHsv`, `rgbToHex`, `hexToRgb` (Task 1); `NumericMode` from `src/app/preferences`; `NumberInput` from `src/ui/panels/controls/NumberInput.tsx`.
- Produces: `NumericFields({ hsv, alpha, mode, onModeChange, onChange, disabled }: { hsv: Hsv; alpha: number; mode: NumericMode; onModeChange: (m: NumericMode) => void; onChange: (next: { hsv: Hsv; alpha: number }, transient: boolean) => void; disabled?: boolean })`.

Reusing `NumberInput` buys drag-to-scrub and the spin-button handling from
[[scrub-numeric-inputs]] for free, including its `(value, transient)` callback
shape, which already matches. Alpha is displayed 0–1 with two decimals per the
reference screenshot, while the rest of the codebase carries it 0–100 — the
conversion happens only here.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/NumericFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NumericFields } from "./NumericFields";
import { hsvToHsl, hsvToRgb } from "../../lib/color-convert";

const hsv = { h: 200, s: 25, v: 91 };

function setup(mode: "hsla" | "rgba" | "hex" = "hsla") {
  const onChange = vi.fn();
  const onModeChange = vi.fn();
  render(
    <NumericFields hsv={hsv} alpha={100} mode={mode} onChange={onChange} onModeChange={onModeChange} />,
  );
  return { onChange, onModeChange };
}

describe("NumericFields", () => {
  it("shows rounded HSLA by default", () => {
    setup();
    expect(screen.getByLabelText("Hue")).toHaveValue(200);
    // 56, not 25: the fields show HSL, the draft carries HSV. Different spaces.
    expect(screen.getByLabelText("Saturation")).toHaveValue(56);
    expect(screen.getByLabelText("Lightness")).toHaveValue(80);
    expect(screen.getByLabelText("Alpha")).toHaveValue(1);
  });

  it("shows RGBA in rgba mode", () => {
    setup("rgba");
    expect(screen.getByLabelText("Red")).toHaveValue(174);
    expect(screen.getByLabelText("Green")).toHaveValue(213);
    expect(screen.getByLabelText("Blue")).toHaveValue(232);
  });

  it("shows a single hex field in hex mode", () => {
    setup("hex");
    expect(screen.getByLabelText("Hex")).toHaveValue("#aed5e8");
    expect(screen.queryByLabelText("Hue")).not.toBeInTheDocument();
  });

  it("switches mode through the select", () => {
    const { onModeChange } = setup();
    fireEvent.change(screen.getByLabelText(/color format/i), { target: { value: "rgba" } });
    expect(onModeChange).toHaveBeenCalledWith("rgba");
  });

  it("emits a new hsv when hue is typed", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Hue");
    fireEvent.change(field, { target: { value: "300" } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hsv: expect.objectContaining({ h: 300 }) }),
      false,
    );
  });

  // These three prove the FIELDS ARE WIRED TO THE RIGHT CHANNEL. Without them a
  // transposition of s/l or g/b passes the whole suite, because the display
  // assertions read from the same correct object regardless of which key the
  // edit path writes. Values chosen to round-trip exactly through HSV; the
  // untouched channel is asserted too, which is what catches a swap.
  it("routes a typed saturation to saturation, leaving lightness alone", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Saturation");
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.blur(field);
    const back = hsvToHsl(onChange.mock.calls[onChange.mock.calls.length - 1][0].hsv);
    expect(Math.round(back.s)).toBe(40);
    expect(Math.round(back.l)).toBe(80);
  });

  it("routes a typed lightness to lightness, leaving saturation alone", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Lightness");
    fireEvent.change(field, { target: { value: "40" } });
    fireEvent.blur(field);
    const back = hsvToHsl(onChange.mock.calls[onChange.mock.calls.length - 1][0].hsv);
    expect(Math.round(back.l)).toBe(40);
    expect(Math.round(back.s)).toBe(56);
  });

  it("routes a typed green channel to green, leaving red and blue alone", () => {
    const onChange = vi.fn();
    render(
      <NumericFields hsv={hsv} alpha={100} mode="rgba" onChange={onChange} onModeChange={vi.fn()} />,
    );
    const field = screen.getByLabelText("Green");
    fireEvent.change(field, { target: { value: "100" } });
    fireEvent.blur(field);
    const back = hsvToRgb(onChange.mock.calls[onChange.mock.calls.length - 1][0].hsv);
    expect(Math.round(back.g)).toBe(100);
    expect(Math.round(back.r)).toBe(174);
    expect(Math.round(back.b)).toBe(232);
  });

  it("converts a typed alpha from 0-1 back to 0-100", () => {
    const { onChange } = setup();
    const field = screen.getByLabelText("Alpha");
    fireEvent.change(field, { target: { value: "0.5" } });
    fireEvent.blur(field);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alpha: 50 }), false);
  });

  it("commits a typed hex on Enter", () => {
    const onChange = vi.fn();
    render(
      <NumericFields hsv={hsv} alpha={100} mode="hex" onChange={onChange} onModeChange={vi.fn()} />,
    );
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#ff0000" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(
      { hsv: { h: 0, s: 100, v: 100 }, alpha: 100 },
      false,
    );
  });

  it("ignores an unparseable hex", () => {
    const onChange = vi.fn();
    render(
      <NumericFields hsv={hsv} alpha={100} mode="hex" onChange={onChange} onModeChange={vi.fn()} />,
    );
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "nope" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reads an 8-digit hex as color plus alpha", () => {
    const onChange = vi.fn();
    render(
      <NumericFields hsv={hsv} alpha={100} mode="hex" onChange={onChange} onModeChange={vi.fn()} />,
    );
    const field = screen.getByLabelText("Hex");
    fireEvent.change(field, { target: { value: "#ff000080" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(
      { hsv: { h: 0, s: 100, v: 100 }, alpha: 50 },
      false,
    );
  });
});
```

The expected values above come from `#aed5e8` and have now been **verified
against the real Task 1 module**: `hsvToHex({h:200,s:25,v:91})` is `#aed5e8`,
its RGB is `174, 213, 232`, and its HSL rounds to `200, 56, 80`. Note the
saturation: HSV `s: 25` displays as HSL `s: 56` — different color spaces, and
an easy thing to "correct" in the wrong direction. If a test disagrees with the
module, fix the test, never the conversion.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/NumericFields.test.tsx`
Expected: FAIL — `Failed to resolve import "./NumericFields"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/NumericFields.tsx`:

```tsx
import { useState } from "react";
import "./color.css";
import { NumberInput } from "../panels/controls/NumberInput";
import { splitColorAlpha } from "../../lib/color-alpha";
import {
  hexToHsv, hsvToHex, hsvToRgb, rgbToHsv, rgbToHex, hexToRgb,
  hsvToHsl, hslToHsv, type Hsv,
} from "../../lib/color-convert";
import type { NumericMode } from "../../app/preferences";

interface NumericFieldsProps {
  hsv: Hsv;
  /** 0–100, as everywhere else in flow. Displayed here as 0–1. */
  alpha: number;
  mode: NumericMode;
  onModeChange: (mode: NumericMode) => void;
  onChange: (next: { hsv: Hsv; alpha: number }, transient: boolean) => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<NumericMode, string> = {
  hsla: "HSLA",
  rgba: "RGBA",
  hex: "HEX",
};

/**
 * The numeric row. HSLA by default; RGBA and HEX behind the format select.
 *
 * The switcher is a real `<select>` even though the reference design draws it
 * as a chevron stack: a cycle button would be unreachable by keyboard and
 * nameless to a screen reader. CSS makes it look the part.
 *
 * H/S/L and R/G/B ride on `NumberInput`, so they inherit drag-to-scrub and the
 * cross-engine spin-button handling that control already solved.
 */
export function NumericFields({
  hsv, alpha, mode, onModeChange, onChange, disabled = false,
}: NumericFieldsProps) {
  const [hexText, setHexText] = useState<string | null>(null);

  const emit = (next: Partial<{ hsv: Hsv; alpha: number }>, transient: boolean) =>
    onChange({ hsv: next.hsv ?? hsv, alpha: next.alpha ?? alpha }, transient);

  const onAlpha = (v: number, transient: boolean) =>
    emit({ alpha: Math.max(0, Math.min(100, v * 100)) }, transient);

  const alphaField = (
    <NumberInput
      value={Number((alpha / 100).toFixed(2))}
      min={0}
      max={1}
      step={0.01}
      onChange={onAlpha}
      ariaLabel="Alpha"
      disabled={disabled}
      className="flow-clr-num"
    />
  );

  const switcher = (
    <select
      className="flow-clr-mode"
      aria-label="Color format"
      value={mode}
      disabled={disabled}
      onChange={(e) => onModeChange(e.target.value as NumericMode)}
    >
      {(Object.keys(MODE_LABELS) as NumericMode[]).map((m) => (
        <option key={m} value={m}>{MODE_LABELS[m]}</option>
      ))}
    </select>
  );

  if (mode === "hex") {
    const shown = hexText ?? hsvToHex(hsv);
    const commit = () => {
      const raw = (hexText ?? "").trim();
      setHexText(null);
      if (!raw) return;
      // An 8-digit hex carries its own alpha; splitColorAlpha peels it off.
      const parts = splitColorAlpha(raw.startsWith("#") ? raw : `#${raw}`);
      const next = hexToHsv(parts.hex);
      if (!next) return;
      emit({ hsv: next, alpha: /^#?[0-9a-f]{8}$/i.test(raw) ? parts.alpha : alpha }, false);
    };
    return (
      <div className="flow-clr-numrow">
        <input
          type="text"
          className="flow-clr-hex"
          aria-label="Hex"
          value={shown}
          disabled={disabled}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setHexText(null);
          }}
        />
        {switcher}
      </div>
    );
  }

  if (mode === "rgba") {
    const rgb = hsvToRgb(hsv);
    const setChannel = (key: "r" | "g" | "b") => (v: number, transient: boolean) =>
      emit({ hsv: rgbToHsv({ ...rgb, [key]: v }) }, transient);
    return (
      <div className="flow-clr-numrow">
        <NumberInput value={Math.round(rgb.r)} min={0} max={255} onChange={setChannel("r")} ariaLabel="Red" disabled={disabled} className="flow-clr-num" />
        <NumberInput value={Math.round(rgb.g)} min={0} max={255} onChange={setChannel("g")} ariaLabel="Green" disabled={disabled} className="flow-clr-num" />
        <NumberInput value={Math.round(rgb.b)} min={0} max={255} onChange={setChannel("b")} ariaLabel="Blue" disabled={disabled} className="flow-clr-num" />
        {alphaField}
        {switcher}
      </div>
    );
  }

  const hsl = hsvToHsl(hsv);
  const setHsl = (key: "h" | "s" | "l") => (v: number, transient: boolean) =>
    emit({ hsv: hslToHsv({ ...hsl, [key]: v }) }, transient);

  return (
    <div className="flow-clr-numrow">
      <NumberInput value={Math.round(hsl.h)} min={0} max={360} onChange={setHsl("h")} ariaLabel="Hue" disabled={disabled} className="flow-clr-num" />
      <NumberInput value={Math.round(hsl.s)} min={0} max={100} onChange={setHsl("s")} ariaLabel="Saturation" disabled={disabled} className="flow-clr-num" />
      <NumberInput value={Math.round(hsl.l)} min={0} max={100} onChange={setHsl("l")} ariaLabel="Lightness" disabled={disabled} className="flow-clr-num" />
      {alphaField}
      {switcher}
    </div>
  );
}
```

- [ ] **Step 4: Add the two missing conversions**

`hsvToHsl` and `hslToHsv` are used above but were not written in Task 1. Add
them to `src/lib/color-convert.ts` — going through RGB is exact enough and
avoids a second pair of formulas to keep correct:

```ts
export function hsvToHsl(hsv: Hsv): Hsl {
  return rgbToHsl(hsvToRgb(hsv));
}

export function hslToHsv(hsl: Hsl): Hsv {
  return rgbToHsv(hslToRgb(hsl));
}
```

And add to `src/lib/color-convert.test.ts`:

```ts
describe("hsv <-> hsl", () => {
  it("round-trips a mid tone", () => {
    const hsv = hexToHsv("#2091c2")!;
    const back = hslToHsv(hsvToHsl(hsv));
    expect(hsvToHex(back)).toBe("#2091c2");
  });

  it("reads a pure hue as 50% lightness", () => {
    expect(hsvToHsl({ h: 0, s: 100, v: 100 })).toEqual({ h: 0, s: 100, l: 50 });
  });
});
```

Import `hsvToHsl` and `hslToHsv` in that test file.

- [ ] **Step 5: Append the styles**

Append to `src/ui/color/color.css`:

```css
.flow-clr-numrow {
  display: flex;
  gap: 6px;
  align-items: center;
}

.flow-clr-num {
  min-width: 0;
  flex: 1 1 0;
}

/* Drawn as a compact chevron stack; still a real select underneath. */
.flow-clr-mode {
  width: 22px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0;
  cursor: pointer;
  color: transparent;
  background: transparent
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='16' fill='none' stroke='%23868e96' stroke-width='1.5'><path d='M2 6 5 3l3 3M2 10l3 3 3-3'/></svg>")
    no-repeat center;
  border: none;
  appearance: none;
}

.flow-clr-mode:focus-visible {
  outline: 2px solid var(--flow-accent);
  outline-offset: 1px;
}

/* The options themselves must stay readable when the closed control is not. */
.flow-clr-mode option {
  color: var(--flow-ink);
}

.flow-clr-hex {
  min-width: 0;
  flex: 1 1 auto;
  height: 28px;
  padding: 0 6px;
  font-family: inherit;
  border: 1px solid var(--flow-border);
  border-radius: 4px;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- --run src/ui/color/NumericFields.test.tsx src/lib/color-convert.test.ts`
Expected: PASS. If a `NumberInput` assertion fails on `toHaveValue`, read
`src/ui/panels/controls/NumberInput.tsx` to confirm whether it renders
`type="number"` (numeric `toHaveValue`) or `type="text"` (string), and match.

- [ ] **Step 7: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/NumericFields.tsx src/ui/color/NumericFields.test.tsx src/ui/color/color.css src/lib/color-convert.ts src/lib/color-convert.test.ts
git commit -m "feat(color): HSLA/RGBA/HEX numeric fields with format switcher"
```

---

### Task 10: The HSV draft hook

**Files:**
- Create: `src/ui/color/useColorDraft.ts`
- Test: `src/ui/color/useColorDraft.test.tsx`

**Interfaces:**
- Consumes: `hexToHsv`, `hsvToHex`, `Hsv` (Task 1).
- Produces: `useColorDraft({ hex, alpha, onCommit }: { hex: string; alpha: number; onCommit: (hex: string, alpha: number, transient: boolean) => void }): { hsv: Hsv; alpha: number; isNone: boolean; setSv: (sv: { s: number; v: number }, transient: boolean) => void; setHue: (h: number, transient: boolean) => void; setAlpha: (a: number, transient: boolean) => void; setHsvAlpha: (next: { hsv: Hsv; alpha: number }, transient: boolean) => void }`. `hex` is always a concrete string — the caller resolves MIXED before calling.

**This is the load-bearing hook.** Read the rationale before implementing.

A picker that stores only a hex loses information. `#000000` has no hue and no
saturation, so dragging the value slider to the bottom and back up returns red
regardless of where you started. Same at `s: 0`. The fix is to keep HSV in the
component and treat the hex as an output.

That creates the opposite hazard: if the hook re-seeds from its `hex` prop on
every change, it will re-seed from the very hex it just emitted, and the hue is
lost anyway. So the hook records what it last emitted and re-seeds **only when
the incoming color is something it did not produce** — which is exactly the
case where the color changed from outside (a new selection, the rail popup, a
palette click, an undo).

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/useColorDraft.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useColorDraft } from "./useColorDraft";

function Harness({
  hex, alpha, onCommit,
}: { hex: string; alpha: number; onCommit: (h: string, a: number, t: boolean) => void }) {
  const d = useColorDraft({ hex, alpha, onCommit });
  return (
    <>
      <output data-testid="hsv">{`${Math.round(d.hsv.h)},${Math.round(d.hsv.s)},${Math.round(d.hsv.v)}`}</output>
      <output data-testid="none">{String(d.isNone)}</output>
      <button onClick={() => d.setSv({ s: 100, v: 0 }, false)}>to black</button>
      <button onClick={() => d.setSv({ s: 100, v: 100 }, false)}>to bright</button>
      <button onClick={() => d.setHue(300, false)}>hue 300</button>
      <button onClick={() => d.setAlpha(50, true)}>half alpha</button>
    </>
  );
}

describe("useColorDraft", () => {
  it("seeds hsv from the incoming hex", () => {
    render(<Harness hex="#ff0000" alpha={100} onCommit={vi.fn()} />);
    expect(screen.getByTestId("hsv")).toHaveTextContent("0,100,100");
  });

  it("flags transparent and still exposes a usable hsv", () => {
    render(<Harness hex="transparent" alpha={0} onCommit={vi.fn()} />);
    expect(screen.getByTestId("none")).toHaveTextContent("true");
    expect(screen.getByTestId("hsv")).toHaveTextContent("0,0,0");
  });

  it("emits the composed hex on a change", () => {
    const onCommit = vi.fn();
    render(<Harness hex="#ff0000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("hue 300"));
    expect(onCommit).toHaveBeenCalledWith("#ff00ff", 100, false);
  });

  it("passes the transient flag straight through", () => {
    const onCommit = vi.fn();
    render(<Harness hex="#ff0000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("half alpha"));
    expect(onCommit).toHaveBeenCalledWith("#ff0000", 50, true);
  });

  it("KEEPS THE HUE through a round trip to black", () => {
    // The reason this hook exists.
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to black"));
    expect(onCommit).toHaveBeenLastCalledWith("#000000", 100, false);
    // The scene echoes the write back as a prop.
    rerender(<Harness hex="#000000" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#0000ff", 100, false);
  });

  it("re-seeds when the color changes from outside", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#00ff00" alpha={100} onCommit={onCommit} />);
    expect(screen.getByTestId("hsv")).toHaveTextContent("120,100,100");
  });

  it("re-seeds when only the alpha changes from outside", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#0000ff" alpha={40} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("hue 300"));
    expect(onCommit).toHaveBeenLastCalledWith("#ff00ff", 40, false);
  });

  it("keeps the hue when only the alpha changes from outside at an achromatic hex", () => {
    // The rail popup (or an undo) changing opacity while the draft sits at black
    // must not discard the hue — re-seeding from "#000000" would lose it.
    const onCommit = vi.fn();
    const { rerender } = render(<Harness hex="#0000ff" alpha={100} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to black"));
    rerender(<Harness hex="#000000" alpha={100} onCommit={onCommit} />);
    rerender(<Harness hex="#000000" alpha={40} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#0000ff", 40, false);
  });

  it("leaves the none state as soon as a control moves", () => {
    const onCommit = vi.fn();
    render(<Harness hex="transparent" alpha={0} onCommit={onCommit} />);
    fireEvent.click(screen.getByText("to bright"));
    expect(onCommit).toHaveBeenLastCalledWith("#ff0000", 100, false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/useColorDraft.test.tsx`
Expected: FAIL — `Failed to resolve import "./useColorDraft"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/useColorDraft.ts`:

```ts
import { useState } from "react";
import { hexToHsv, hsvToHex, type Hsv } from "../../lib/color-convert";

interface UseColorDraftOptions {
  /** Concrete `#rrggbb` or "transparent". The caller resolves MIXED first. */
  hex: string;
  /** 0–100. */
  alpha: number;
  onCommit: (hex: string, alpha: number, transient: boolean) => void;
}

const NEUTRAL: Hsv = { h: 0, s: 0, v: 0 };

interface Draft {
  hsv: Hsv;
  alpha: number;
  /** The (hex, alpha) prop pair we last OBSERVED — updated only on a render
   *  that actually sees a new prop pair. Drives "did the props change at all". */
  seenHex: string;
  seenAlpha: number;
  /** The (hex, alpha) pair we last EMITTED, or null before the first emit.
   *  Used only to recognize an incoming prop change as our own echo.
   *
   *  These are two fields, not one, because `onCommit` updates this draft's
   *  state before the parent can feed the new hex back as a prop: React
   *  re-renders with the SAME, STILL-STALE props right after. One field doing
   *  both jobs would see its own fresh emitted value disagree with the stale
   *  prop, misread that as an outside change, and re-seed from the stale hex —
   *  destroying the hue it just set, before the real echo ever arrives. */
  emittedHex: string | null;
  emittedAlpha: number | null;
}

function seedHsv(hex: string, alpha: number): { hsv: Hsv; alpha: number } {
  return {
    hsv: hexToHsv(hex) ?? NEUTRAL,
    // "transparent" carries alpha 0, but a picker parked at zero opacity is a
    // dead control — the first move should produce a visible color.
    alpha: hex === "transparent" ? 100 : alpha,
  };
}

/**
 * Holds the picker's HSV while the user works, and turns it back into the hex
 * the scene stores.
 *
 * Why HSV lives here rather than being recomputed from the element's hex:
 * `#000000` has no hue and `s: 0` has no hue either, so a picker that
 * round-trips through hex forgets where you were the moment you drag into a
 * corner. Keeping HSV local means dragging value to zero and back returns the
 * hue you started on.
 *
 * The matching hazard is re-seeding from our own output. Every emit records the
 * pair it produced, and the props are only allowed to overwrite the draft when
 * they carry something *else* — a new selection, an undo, a write from the rail
 * popup. That single rule is what makes two surfaces safe to bind to one value.
 */
export function useColorDraft({ hex, alpha, onCommit }: UseColorDraftOptions) {
  const [draft, setDraft] = useState<Draft>(() => ({
    ...seedHsv(hex, alpha),
    seenHex: hex,
    seenAlpha: alpha,
    emittedHex: null,
    emittedAlpha: null,
  }));

  // Adjusting state during render (React's documented pattern) rather than in
  // an effect: an effect would paint one frame of the stale color first.
  let current = draft;
  if (draft.seenHex !== hex || draft.seenAlpha !== alpha) {
    const isEcho = hex === draft.emittedHex && alpha === draft.emittedAlpha;
    // An alpha-only change must not re-seed: the color itself did not move, so
    // discarding the HSV would kill the hue at an achromatic hex — the exact
    // failure this hook exists to prevent. Reachable whenever the other surface
    // (or an undo) changes opacity while the draft sits at #000000.
    const alphaOnly = hex === draft.seenHex;
    current =
      isEcho || alphaOnly
        ? {
            ...draft,
            alpha: hex === "transparent" ? 100 : alpha,
            seenHex: hex,
            seenAlpha: alpha,
          }
        : {
            ...seedHsv(hex, alpha),
            seenHex: hex,
            seenAlpha: alpha,
            emittedHex: null,
            emittedAlpha: null,
          };
    setDraft(current);
  }

  const emit = (hsv: Hsv, nextAlpha: number, transient: boolean) => {
    const nextHex = hsvToHex(hsv);
    // Record what we produced so the echo back through props is not treated as
    // an outside change — this is what preserves the hue. `seenHex`/`seenAlpha`
    // are deliberately NOT touched here; see the Draft doc comment.
    setDraft({ ...current, hsv, alpha: nextAlpha, emittedHex: nextHex, emittedAlpha: nextAlpha });
    onCommit(nextHex, nextAlpha, transient);
  };

  return {
    hsv: current.hsv,
    alpha: current.alpha,
    isNone: hex === "transparent",

    setSv: (sv: { s: number; v: number }, transient: boolean) =>
      emit({ ...current.hsv, ...sv }, current.alpha, transient),

    setHue: (h: number, transient: boolean) =>
      emit({ ...current.hsv, h }, current.alpha, transient),

    setAlpha: (a: number, transient: boolean) => emit(current.hsv, a, transient),

    setHsvAlpha: (next: { hsv: Hsv; alpha: number }, transient: boolean) =>
      emit(next.hsv, next.alpha, transient),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/useColorDraft.test.tsx`
Expected: PASS, 8 tests — in particular "KEEPS THE HUE through a round trip to black".

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/useColorDraft.ts src/ui/color/useColorDraft.test.tsx
git commit -m "feat(color): HSV draft hook preserving hue across achromatic states"
```

---

### Task 11: The write path

**Files:**
- Create: `src/ui/color/useColorTarget.ts`
- Test: `src/ui/color/useColorTarget.test.tsx`

**Interfaces:**
- Consumes: `SelectionStyle` from `src/ui/panels/useSelectionStyle.ts`; `availableParts`, `partSpec`, `normalizeActivePart`, `swapFillStroke`, `ColorPart` (Task 2); `useColorUiState`, `setActivePart`, `recordRecent` (Task 4); `splitColorAlpha`, `combineColorAlpha` from `src/lib/color-alpha.ts`; `MIXED`, `readFormValue` from `src/lib/selection-style.ts`.
- Produces:

```ts
export type QuickColor = "none" | "white" | "grey" | "black";

export interface ColorTarget {
  part: ColorPart;
  available: ColorPart[];
  setPart: (part: ColorPart) => void;
  /** Concrete `#rrggbb` or "transparent" — MIXED already resolved. */
  hex: string;
  /** 0–100. */
  alpha: number;
  isMixed: boolean;
  /** Color for one part, for the chooser boxes. */
  partColor: (part: ColorPart) => string;
  setColor: (hex: string, alpha: number, transient: boolean) => void;
  swap: () => void;
  quickSet: (kind: QuickColor) => void;
}

export function useColorTarget(sel: SelectionStyle): ColorTarget;
```

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/useColorTarget.test.tsx`. The `SelectionStyle` shape is
large, so build a fake rather than mounting Excalidraw:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useColorTarget } from "./useColorTarget";
import { reloadColorStore } from "../../lib/color-store";
import type { SelectionStyle } from "../panels/useSelectionStyle";

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      currentItemStrokeWidth: 2,
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

function Harness({ sel }: { sel: SelectionStyle }) {
  const t = useColorTarget(sel);
  return (
    <>
      <output data-testid="part">{t.part}</output>
      <output data-testid="hex">{t.hex}</output>
      <output data-testid="alpha">{String(t.alpha)}</output>
      <output data-testid="available">{t.available.join(",")}</output>
      <button onClick={() => t.setPart("stroke")}>use stroke</button>
      <button onClick={() => t.setColor("#00ff00", 50, false)}>set green</button>
      <button onClick={() => t.setColor("#00ff00", 50, true)}>set green transient</button>
      <button onClick={() => t.swap()}>swap</button>
      <button onClick={() => t.quickSet("none")}>none</button>
      <button onClick={() => t.quickSet("grey")}>grey</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
});

describe("reading", () => {
  it("reads the fill color of the selection", () => {
    render(<Harness sel={fakeSel()} />);
    expect(screen.getByTestId("part")).toHaveTextContent("fill");
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
    expect(screen.getByTestId("alpha")).toHaveTextContent("100");
  });

  it("splits an 8-digit hex into color and opacity", () => {
    const sel = fakeSel({ elements: [{ ...rect, backgroundColor: "#eeeeee80" }] as never });
    render(<Harness sel={sel} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
    expect(screen.getByTestId("alpha")).toHaveTextContent("50");
  });

  it("falls back to the tool defaults with nothing selected", () => {
    render(<Harness sel={fakeSel({ selectedIds: {}, hasSelection: false, selectedCount: 0 })} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("transparent");
  });

  it("resolves a mixed selection to a concrete color", () => {
    const sel = fakeSel({
      elements: [rect, { ...rect, id: "r2", backgroundColor: "#123456" }] as never,
      selectedIds: { r1: true, r2: true },
      selectedCount: 2,
    });
    render(<Harness sel={sel} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
  });
});

describe("part selection", () => {
  it("switches the active part", () => {
    render(<Harness sel={fakeSel()} />);
    fireEvent.click(screen.getByText("use stroke"));
    expect(screen.getByTestId("part")).toHaveTextContent("stroke");
    expect(screen.getByTestId("hex")).toHaveTextContent("#111111");
  });

  it("forces the text part for a text-only selection", () => {
    const text = { id: "t1", type: "text", strokeColor: "#222222", backgroundColor: "transparent", containerId: null };
    render(<Harness sel={fakeSel({ elements: [text] as never, selectedIds: { t1: true }, textTargetIds: { t1: true }, hasText: true })} />);
    expect(screen.getByTestId("part")).toHaveTextContent("text");
    expect(screen.getByTestId("available")).toHaveTextContent("text");
    expect(screen.getByTestId("hex")).toHaveTextContent("#222222");
  });
});

describe("writing", () => {
  it("writes a combined 8-digit hex to the fill", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("set green"));
    expect(sel.update).toHaveBeenCalled();
  });

  it("records a recent on commit but not mid-drag", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("set green transient"));
    expect(JSON.parse(localStorage.getItem("flow.recentColors") ?? "[]")).toEqual([]);
    fireEvent.click(screen.getByText("set green"));
    expect(JSON.parse(localStorage.getItem("flow.recentColors") ?? "[]")).toEqual(["#00ff00"]);
  });

  it("swaps fill and stroke in one update", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("swap"));
    const [ids, updater, currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual({ r1: true });
    expect(updater(rect)).toEqual({ backgroundColor: "#111111", strokeColor: "#eeeeee" });
    expect(currentItems).toEqual({
      currentItemBackgroundColor: "#1e1e1e",
      currentItemStrokeColor: "transparent",
    });
  });
});

describe("quick colors", () => {
  it("sets a transparent fill for none", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("none"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ backgroundColor: "transparent" });
  });

  it("zeroes the stroke width for none on stroke", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("none"));
    const [, updater, currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ strokeColor: "transparent", strokeWidth: 0 });
    expect(currentItems).toEqual({
      currentItemStrokeColor: "transparent",
      currentItemStrokeWidth: 0,
    });
  });

  it("bumps a zero stroke width back to 1 when a real color is chosen", () => {
    const sel = fakeSel({ elements: [{ ...rect, strokeColor: "transparent", strokeWidth: 0 }] as never });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("grey"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater({ ...rect, strokeColor: "transparent", strokeWidth: 0 }))
      .toEqual({ strokeColor: "#808080", strokeWidth: 1 });
  });

  it("leaves a nonzero stroke width alone", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("grey"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ strokeColor: "#808080" });
  });

  it("does nothing for none on the text part", () => {
    const text = { id: "t1", type: "text", strokeColor: "#222222", backgroundColor: "transparent", containerId: null };
    const sel = fakeSel({ elements: [text] as never, selectedIds: { t1: true }, textTargetIds: { t1: true }, hasText: true });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("none"));
    expect(sel.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/useColorTarget.test.tsx`
Expected: FAIL — `Failed to resolve import "./useColorTarget"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/useColorTarget.ts`:

```ts
import type { SelectionStyle } from "../panels/useSelectionStyle";
import {
  availableParts, partSpec, normalizeActivePart, swapFillStroke, type ColorPart,
} from "../../lib/color-parts";
import { useColorUiState, setActivePart, recordRecent } from "../../lib/color-store";
import { splitColorAlpha, combineColorAlpha } from "../../lib/color-alpha";
import { MIXED, readFormValue } from "../../lib/selection-style";

export type QuickColor = "none" | "white" | "grey" | "black";

/** The baseline colors under the part chooser. */
const QUICK_HEX: Record<Exclude<QuickColor, "none">, string> = {
  white: "#ffffff",
  grey: "#808080",
  black: "#000000",
};

/** Width a stroke is revived at when a color is applied over "none". */
const REVIVED_STROKE_WIDTH = 1;

export interface ColorTarget {
  part: ColorPart;
  available: ColorPart[];
  setPart: (part: ColorPart) => void;
  hex: string;
  alpha: number;
  isMixed: boolean;
  partColor: (part: ColorPart) => string;
  setColor: (hex: string, alpha: number, transient: boolean) => void;
  swap: () => void;
  quickSet: (kind: QuickColor) => void;
}

/**
 * Binds the color UI to the scene.
 *
 * The color is *read* from the selection every render rather than stored, which
 * is what lets the panel and the rail popup both be live views of the same
 * object without a sync layer between them. Only the active part comes from the
 * store, because it has nowhere else to live.
 */
export function useColorTarget(sel: SelectionStyle): ColorTarget {
  const { activePart } = useColorUiState();
  const a = sel.appState as Record<string, unknown> | null;

  const available = availableParts(sel.elements as never, sel.selectedIds);
  const part = normalizeActivePart(available, activePart);

  const fallbackFor = (p: ColorPart): string => {
    const key = partSpec(p, sel.selectedIds, sel.textTargetIds).currentItemKey;
    const value = a?.[key];
    return typeof value === "string" ? value : "transparent";
  };

  /** The raw stored color for a part, with MIXED collapsed to the first value. */
  const rawColor = (p: ColorPart): string => {
    const spec = partSpec(p, sel.selectedIds, sel.textTargetIds);
    const read = readFormValue(
      sel.elements,
      spec.ids,
      (el) => (el as unknown as Record<string, string>)[spec.prop],
      fallbackFor(p),
    );
    if (read !== MIXED) return read;
    // A mixed selection still has to show *something*; blanking the picker
    // would leave no color to nudge. First value wins.
    const first = sel.elements.find((el) => spec.ids[el.id] === true);
    return first
      ? ((first as unknown as Record<string, string>)[spec.prop] ?? fallbackFor(p))
      : fallbackFor(p);
  };

  const spec = partSpec(part, sel.selectedIds, sel.textTargetIds);
  const stored = rawColor(part);
  const { hex, alpha } = splitColorAlpha(stored);

  const isMixed =
    readFormValue(
      sel.elements,
      spec.ids,
      (el) => (el as unknown as Record<string, string>)[spec.prop],
      stored,
    ) === MIXED;

  /**
   * Write one color to the active part. Stroke carries an extra rule: a stroke
   * whose width is 0 is invisible, so applying a real color to it has to give
   * it a width back or the click appears to do nothing.
   *
   * `?? ` not `||` on strokeWidth — 0 is real data here, and coercing it has
   * already cost this project three fork edits (see [[drawing-defaults]]).
   */
  const setColor: ColorTarget["setColor"] = (nextHex, nextAlpha, transient) => {
    const value = combineColorAlpha(nextHex, nextAlpha);
    const revive = part === "stroke" && nextHex !== "transparent";

    sel.update(
      spec.ids,
      (el) => {
        const record = el as unknown as Record<string, unknown>;
        const width = (record.strokeWidth as number | undefined) ?? REVIVED_STROKE_WIDTH;
        const needsWidth = revive && width === 0;
        if (record[spec.prop] === value && !needsWidth) return null;
        return needsWidth
          ? { [spec.prop]: value, strokeWidth: REVIVED_STROKE_WIDTH }
          : { [spec.prop]: value };
      },
      { [spec.currentItemKey]: value },
      transient,
    );

    // Mid-drag writes are noise; only a settled color joins the recents.
    if (!transient) recordRecent(nextHex);
  };

  const swap: ColorTarget["swap"] = () => {
    sel.update(sel.selectedIds, (el) => swapFillStroke(el as never), {
      currentItemBackgroundColor: fallbackFor("stroke"),
      currentItemStrokeColor: fallbackFor("fill"),
    });
  };

  const quickSet: ColorTarget["quickSet"] = (kind) => {
    if (kind !== "none") {
      setColor(QUICK_HEX[kind], 100, false);
      return;
    }
    // Invisible text is a footgun, not a feature.
    if (part === "text") return;

    if (part === "stroke") {
      sel.update(
        spec.ids,
        () => ({ strokeColor: "transparent", strokeWidth: 0 }),
        { currentItemStrokeColor: "transparent", currentItemStrokeWidth: 0 },
      );
      return;
    }
    sel.update(spec.ids, (el) => {
      const record = el as unknown as Record<string, unknown>;
      return record.backgroundColor === "transparent" ? null : { backgroundColor: "transparent" };
    }, { currentItemBackgroundColor: "transparent" });
  };

  return {
    part,
    available,
    setPart: setActivePart,
    hex,
    alpha,
    isMixed,
    partColor: rawColor,
    setColor,
    swap,
    quickSet,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/useColorTarget.test.tsx`
Expected: PASS, 14 tests. The swap test asserts the exact `currentItems` payload
— if `fallbackFor` returns something else for your `appState` fake, fix the
fake, not the hook.

- [ ] **Step 5: Full suite and typecheck**

Run: `npm test -- --run && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/ui/color/useColorTarget.ts src/ui/color/useColorTarget.test.tsx
git commit -m "feat(color): selection-derived write path with stroke-width coupling"
```

---

**Phase 2 checkpoint.** Seven picker primitives and two hooks, all unit-tested,
none of it mounted. The app still renders the old Color and Color Swatches
panels. `npm test -- --run && npm run typecheck` green before Phase 3.

---

## Phase 3 — The Color panel

> **Spec correction — no migration code needed.** The spec's "Retired and
> migrated" table calls for a no-op migration in `panel-dock-state` for saved
> layouts naming `swatches`. That machinery already exists: `syncPanelDefs`
> (`src/ui/panels/dock/panel-dock-state.ts:155`) filters persisted panels
> against the registered ids and drops anything unknown, and
> `DEFAULT_DOCK_STATE.panels` is empty. Do **not** add a
> `LEGACY_PANEL_ID_RENAMES` entry — mapping `swatches` → `color` would produce
> two panels with the same id. Task 14 adds a regression test instead.

### Task 12: Part chooser

**Files:**
- Create: `src/ui/color/PartChooser.tsx`
- Modify: `src/ui/color/color.css` (append)
- Test: `src/ui/color/PartChooser.test.tsx`

**Interfaces:**
- Consumes: `ColorPart` (Task 2); `ColorTarget`, `QuickColor` (Task 11).
- Produces: `PartChooser({ target, compact }: { target: ColorTarget; compact?: boolean })`. `compact` drops the quartet's labels and shrinks the boxes for the tool rail; the rail still shows the quartet.

Layout rules, from the reference screenshot:

- **fill** is a solid square, offset up and to the left
- **stroke** is a thick ring, offset down and to the right
- **text** is a solid square carrying a `T`, offset furthest down-right
- the active part renders last in DOM order and gets a higher `z-index`, so it
  sits in front
- the double-headed arrow sits top-right and swaps fill and stroke
- a part whose color is `"transparent"` renders the red-slash treatment
- a mixed value renders a checker

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/PartChooser.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartChooser } from "./PartChooser";
import type { ColorTarget } from "./useColorTarget";

function target(over: Partial<ColorTarget> = {}): ColorTarget {
  return {
    part: "fill",
    available: ["fill", "stroke"],
    setPart: vi.fn(),
    hex: "#eeeeee",
    alpha: 100,
    isMixed: false,
    partColor: (p) => (p === "fill" ? "#eeeeee" : "#111111"),
    setColor: vi.fn(),
    swap: vi.fn(),
    quickSet: vi.fn(),
    ...over,
  };
}

describe("PartChooser", () => {
  it("renders a box per available part", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /stroke/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^text/i })).not.toBeInTheDocument();
  });

  it("marks the active part checked", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /stroke/i })).not.toBeChecked();
  });

  it("brings a back box forward on click", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(t.setPart).toHaveBeenCalledWith("stroke");
  });

  it("swaps through the arrow button", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("button", { name: /swap fill and stroke/i }));
    expect(t.swap).toHaveBeenCalledTimes(1);
  });

  it("shows all three boxes for a labeled container", () => {
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows one box for a text-only selection", () => {
    render(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    const boxes = screen.getAllByRole("radio");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName(/text/i);
  });

  it("hides the swap arrow when stroke is unavailable", () => {
    render(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(screen.queryByRole("button", { name: /swap/i })).not.toBeInTheDocument();
  });

  it("marks a transparent part as none", () => {
    render(<PartChooser target={target({ partColor: () => "transparent" })} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveClass("flow-clr-part--none");
  });

  it("marks a mixed active part", () => {
    render(<PartChooser target={target({ isMixed: true })} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveClass("flow-clr-part--mixed");
  });

  it("fires quickSet from the quartet", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("button", { name: /^none$/i }));
    expect(t.quickSet).toHaveBeenCalledWith("none");
    fireEvent.click(screen.getByRole("button", { name: /^grey$/i }));
    expect(t.quickSet).toHaveBeenCalledWith("grey");
  });

  it("still shows the quartet in compact mode", () => {
    render(<PartChooser target={target()} compact />);
    expect(screen.getByRole("button", { name: /^black$/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/PartChooser.test.tsx`
Expected: FAIL — `Failed to resolve import "./PartChooser"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/PartChooser.tsx`:

```tsx
import "./color.css";
import type { ColorPart } from "../../lib/color-parts";
import type { ColorTarget, QuickColor } from "./useColorTarget";

interface PartChooserProps {
  target: ColorTarget;
  /** Tool-rail variant: smaller boxes, same behaviour. */
  compact?: boolean;
}

const PART_LABEL: Record<ColorPart, string> = {
  fill: "Fill",
  stroke: "Stroke",
  text: "Text",
};

const QUICK: { kind: QuickColor; label: string; hex: string }[] = [
  { kind: "none", label: "None", hex: "transparent" },
  { kind: "white", label: "White", hex: "#ffffff" },
  { kind: "grey", label: "Grey", hex: "#808080" },
  { kind: "black", label: "Black", hex: "#000000" },
];

/**
 * Illustrator's fill/stroke boxes. The front box is the part every other
 * control in the picker is editing, and clicking a back box brings it forward.
 *
 * Radios rather than buttons: this is a single choice among a small set, which
 * is what a radiogroup means, and it gets arrow-key navigation for free.
 */
export function PartChooser({ target, compact = false }: PartChooserProps) {
  const { part, available, setPart, isMixed, partColor, swap, quickSet } = target;
  const canSwap = available.includes("fill") && available.includes("stroke");

  // The active part renders last so it paints over its neighbours.
  const ordered = [...available].sort((x, y) =>
    x === part ? 1 : y === part ? -1 : 0,
  );

  return (
    <div className={`flow-clr-chooser${compact ? " flow-clr-chooser--compact" : ""}`}>
      <div className="flow-clr-chooser__stack" role="radiogroup" aria-label="Color target">
        {ordered.map((p) => {
          const color = partColor(p);
          const none = color === "transparent";
          const mixed = isMixed && p === part;
          const classes = [
            "flow-clr-part",
            `flow-clr-part--${p}`,
            p === part ? "flow-clr-part--active" : "",
            none ? "flow-clr-part--none" : "",
            mixed ? "flow-clr-part--mixed" : "",
          ].filter(Boolean).join(" ");

          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === part}
              aria-label={`${PART_LABEL[p]}${none ? ", none" : ""}${mixed ? ", mixed" : ""}`}
              title={PART_LABEL[p]}
              className={classes}
              style={none || mixed ? undefined : { ["--flow-clr-part-color" as string]: color }}
              onClick={() => setPart(p)}
            >
              {p === "text" && <span className="flow-clr-part__glyph" aria-hidden="true">T</span>}
            </button>
          );
        })}

        {canSwap && (
          <button
            type="button"
            className="flow-clr-chooser__swap"
            aria-label="Swap fill and stroke"
            title="Swap fill and stroke"
            onClick={swap}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h11a4 4 0 0 1 4 4v5" />
              <path d="M7 5 4 8l3 3" />
              <path d="m16 14 3 3 3-3" />
            </svg>
          </button>
        )}
      </div>

      <div className="flow-clr-quartet">
        {QUICK.map((q) => (
          <button
            key={q.kind}
            type="button"
            className={`flow-clr-chip${q.kind === "none" ? " flow-clr-chip--none" : ""}`}
            style={q.kind === "none" ? undefined : { background: q.hex }}
            aria-label={q.label}
            title={q.label}
            onClick={() => quickSet(q.kind)}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append the styles**

Append to `src/ui/color/color.css`:

```css
.flow-clr-chooser {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.flow-clr-chooser__stack {
  position: relative;
  width: 74px;
  height: 74px;
}

.flow-clr-chooser--compact .flow-clr-chooser__stack {
  width: 52px;
  height: 52px;
}

.flow-clr-part {
  position: absolute;
  width: 46px;
  height: 46px;
  padding: 0;
  cursor: pointer;
  background: var(--flow-clr-part-color, #fff);
  border: 2px solid var(--flow-ink);
}

.flow-clr-chooser--compact .flow-clr-part {
  width: 32px;
  height: 32px;
}

.flow-clr-part--fill { top: 0; left: 0; }
.flow-clr-part--stroke { right: 0; bottom: 0; }
.flow-clr-part--text { right: 0; bottom: 0; }

/* The stroke box is a ring: a thick border around a hole. */
.flow-clr-part--stroke {
  background:
    linear-gradient(var(--flow-clr-part-color, #fff) 0 0) padding-box,
    linear-gradient(var(--flow-clr-part-color, #fff) 0 0) border-box;
  border: 2px solid var(--flow-ink);
  box-shadow: inset 0 0 0 8px var(--flow-clr-part-color, #fff), inset 0 0 0 10px #fff;
}

.flow-clr-part--active { z-index: 2; }

.flow-clr-part--none {
  background: linear-gradient(
    to bottom right,
    #fff calc(50% - 1.5px), #e03131 calc(50% - 1.5px),
    #e03131 calc(50% + 1.5px), #fff calc(50% + 1.5px)
  );
}

.flow-clr-part--mixed {
  background-image: conic-gradient(#c8c8c8 0 25%, #fff 0 50%, #c8c8c8 0 75%, #fff 0);
  background-size: 8px 8px;
}

.flow-clr-part__glyph {
  font-weight: 700;
  font-size: 20px;
  line-height: 1;
  color: var(--flow-ink);
  mix-blend-mode: difference;
}

.flow-clr-chooser__swap {
  position: absolute;
  top: -4px;
  right: -4px;
  z-index: 3;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  cursor: pointer;
  color: var(--flow-ink);
  background: none;
  border: none;
}

.flow-clr-quartet {
  display: flex;
  gap: 4px;
}

.flow-clr-chip {
  width: 22px;
  height: 22px;
  padding: 0;
  cursor: pointer;
  border: 1px solid var(--flow-ink);
}

.flow-clr-chip--none {
  background: linear-gradient(
    to bottom right,
    #fff calc(50% - 1px), #e03131 calc(50% - 1px),
    #e03131 calc(50% + 1px), #fff calc(50% + 1px)
  );
}
```

The stroke ring's `box-shadow` inset technique is fiddly; if it renders wrong,
replace it with a nested `::after` hole. **Verify visually in the running app**
before moving on — the tests only assert classes, not appearance.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/PartChooser.test.tsx`
Expected: PASS, 11 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/PartChooser.tsx src/ui/color/color.css src/ui/color/PartChooser.test.tsx
git commit -m "feat(color): Illustrator-style fill/stroke/text part chooser"
```

---

### Task 13: Palette section

**Files:**
- Create: `src/ui/color/PaletteSection.tsx`
- Modify: `src/ui/color/color.css` (append)
- Test: `src/ui/color/PaletteSection.test.tsx`

**Interfaces:**
- Consumes: `usePaletteState`, `addPalette`, `removePalette`, `renamePalette`, `setDefaultPalette`, `addSwatch`, `updateSwatch`, `removeSwatches`, `reorderSwatches` from `src/lib/palette-store.ts`.
- Produces: `PaletteSection({ currentColor, onPick }: { currentColor: string; onPick: (hex: string) => void })`.

This absorbs `SwatchesPanel` and `SwatchGrid`. Behaviour changes from the old
panel, all deliberate:

| Old | New |
|---|---|
| Grid `[+]` opened `SwatchPicker` to invent a color | Grid `[+]` adds `currentColor` directly — no dialog |
| Clicking a swatch selected it for deletion | Clicking a swatch **applies** it via `onPick`; ⌘/Ctrl-click selects for deletion |
| Double-click opened `SwatchPicker` to edit | Double-click applies too; editing is "apply, adjust, re-add" |
| "★ Set as default" button | Gone — the dropdown selection *is* the active palette, persisted via `setDefaultPalette` |
| Rename input in its own row | Double-click the select to rename in place |

Copy `SwatchGrid`'s drag-reorder handlers verbatim rather than rewriting them;
they already work.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/PaletteSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteSection } from "./PaletteSection";
import { reloadPaletteStore, usePaletteState } from "../../lib/palette-store";

beforeEach(() => {
  localStorage.clear();
  reloadPaletteStore();
});

function setup(currentColor = "#123456") {
  const onPick = vi.fn();
  render(<PaletteSection currentColor={currentColor} onPick={onPick} />);
  return { onPick };
}

describe("PaletteSection", () => {
  it("lists the seeded palettes and selects the default", () => {
    setup();
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(1);
    expect(select.selectedOptions[0].textContent).toBe("Pastel");
  });

  it("applies a swatch on click", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0]);
    expect(onPick).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
  });

  it("adds the current color through the grid plus tile", () => {
    setup("#123456");
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(screen.getByRole("button", { name: /add current color/i }));
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before + 1);
    expect(screen.getByRole("button", { name: "Swatch #123456" })).toBeInTheDocument();
  });

  it("switches palettes and persists the choice", () => {
    setup();
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    const vibrant = [...select.options].find((o) => o.textContent === "Vibrant")!;
    fireEvent.change(select, { target: { value: vibrant.value } });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Vibrant");
    expect(localStorage.getItem("flow.defaultPaletteId")).toBe(vibrant.value);
  });

  it("adds a palette", () => {
    setup();
    const before = (screen.getByLabelText("Palette") as HTMLSelectElement).options.length;
    fireEvent.click(screen.getByRole("button", { name: /add palette/i }));
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).options).toHaveLength(before + 1);
  });

  it("selects a swatch for deletion with a modifier click and removes it", () => {
    setup();
    const first = screen.getAllByRole("button", { name: /^swatch /i })[0];
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(first, { metaKey: true });
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /remove selected swatches/i }));
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before - 1);
  });

  it("does not apply a color on a modifier click", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0], { metaKey: true });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("asks before deleting a palette when nothing is selected", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /delete palette/i }));
    expect(screen.getByRole("alertdialog", { name: /delete palette/i })).toBeInTheDocument();
  });

  it("renames in place on double-click", () => {
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    const input = screen.getByLabelText("Palette name");
    fireEvent.change(input, { target: { value: "Mine" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Mine");
  });

  it("has no set-as-default control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /default/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/color/PaletteSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./PaletteSection"`.

- [ ] **Step 3: Write the implementation**

Read `src/ui/panels/SwatchesPanel.tsx` and `src/ui/panels/SwatchGrid.tsx` first;
this is those two, merged and re-aimed. Create `src/ui/color/PaletteSection.tsx`:

```tsx
import { useRef, useState } from "react";
import "./color.css";
import {
  usePaletteState, addPalette, removePalette, renamePalette,
  setDefaultPalette, addSwatch, removeSwatches, reorderSwatches,
} from "../../lib/palette-store";

interface PaletteSectionProps {
  /** The picker's live color, added by the grid's [+] tile. */
  currentColor: string;
  /** Applying a swatch to the active part. */
  onPick: (hex: string) => void;
}

/**
 * Palette management, folded into the Color panel — picking a color and
 * curating the set you pick from are one activity, and they used to live in two
 * panels.
 *
 * The dropdown selection *is* the active palette: there is no separate
 * "default", so choosing a palette here is what `useDefaultPaletteColors`
 * elsewhere resolves to. A plain click applies a swatch; ⌘/Ctrl-click selects
 * it for the trash, which keeps the common action one click and the destructive
 * one deliberate.
 */
export function PaletteSection({ currentColor, onPick }: PaletteSectionProps) {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const dragFrom = useRef<number | null>(null);

  // Resolve defensively: the id may point at a just-deleted palette.
  const current = palettes.find((p) => p.id === defaultPaletteId) ?? palettes[0];

  const choosePalette = (id: string) => {
    setDefaultPalette(id);
    setSelected([]);
    setConfirming(false);
  };

  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
      return;
    }
    setConfirming(true);
  };

  const onSwatchClick = (index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
      );
      return;
    }
    setSelected([]);
    onPick(current.colors[index]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      e.preventDefault();
      removeSwatches(current.id, selected);
      setSelected([]);
    }
  };

  const sel = new Set(selected);

  return (
    <div className="flow-clr-palette" onKeyDown={onKeyDown}>
      <div className="flow-clr-palette__grid">
        <button
          type="button"
          className="flow-clr-palette__add"
          aria-label="Add current color to palette"
          title="Add current color to palette"
          onClick={() => addSwatch(current.id, currentColor)}
        >
          +
        </button>
        {current.colors.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            className="flow-clr-palette__tile"
            style={{ background: c }}
            aria-label={`Swatch ${c}`}
            aria-pressed={sel.has(i)}
            title={c}
            draggable
            onClick={(e) => onSwatchClick(i, e)}
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from !== null && from !== i) reorderSwatches(current.id, from, i);
              setSelected([]);
            }}
          />
        ))}
      </div>

      <div className="flow-clr-palette__row">
        {renaming ? (
          <input
            className="flow-clr-palette__name"
            aria-label="Palette name"
            autoFocus
            defaultValue={current.name}
            onBlur={(e) => {
              renamePalette(current.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <select
            className="flow-clr-palette__select"
            aria-label="Palette"
            value={current.id}
            title="Double-click to rename"
            onChange={(e) => choosePalette(e.target.value)}
            onDoubleClick={() => setRenaming(true)}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label="Add palette"
          onClick={() => choosePalette(addPalette().id)}
        >
          +
        </button>
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          onClick={onTrash}
        >
          🗑
        </button>
      </div>

      {confirming && (
        <div className="flow-clr-palette__confirm" role="alertdialog" aria-label="Delete palette">
          <p>Delete the “{current.name}” palette?</p>
          <div className="flow-clr-palette__confirm-actions">
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
            <button
              type="button"
              aria-label="Confirm delete"
              onClick={() => {
                removePalette(current.id);
                setConfirming(false);
                setSelected([]);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Append the styles**

Append to `src/ui/color/color.css`. Read the `.flow-sw-*` rules in
`src/ui/panels/panels.css` and port their sizing so the grid keeps the density
it has today:

```css
.flow-clr-palette {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.flow-clr-palette__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(26px, 1fr));
  gap: 4px;
}

.flow-clr-palette__add,
.flow-clr-palette__tile {
  aspect-ratio: 1;
  padding: 0;
  cursor: pointer;
  border: 1px solid var(--flow-border);
  border-radius: 3px;
}

.flow-clr-palette__add {
  font-size: 16px;
  line-height: 1;
  background: none;
}

.flow-clr-palette__tile[aria-pressed="true"] {
  outline: 2px solid var(--flow-accent);
  outline-offset: 1px;
}

.flow-clr-palette__row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.flow-clr-palette__select,
.flow-clr-palette__name {
  min-width: 0;
  flex: 1 1 auto;
  height: 28px;
}

.flow-clr-palette__icon {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0;
  cursor: pointer;
  background: none;
  border: 1px solid var(--flow-border);
  border-radius: 4px;
}

.flow-clr-palette__confirm {
  padding: 8px;
  background: var(--flow-panel-bg);
  border: 1px solid var(--flow-border);
  border-radius: 4px;
}

.flow-clr-palette__confirm-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --run src/ui/color/PaletteSection.test.tsx`
Expected: PASS, 10 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `npm run typecheck`

```bash
git add src/ui/color/PaletteSection.tsx src/ui/color/color.css src/ui/color/PaletteSection.test.tsx
git commit -m "feat(color): palette section merging the Swatches panel into Color"
```

---

### Task 14: Assemble the panel and retire Swatches

**Files:**
- Rewrite: `src/ui/panels/ColorPanel.tsx`, `src/ui/panels/ColorPanel.test.tsx`
- Modify: `src/ui/panels/PanelsRoot.tsx` (drop line 43 and the import)
- Delete: `src/ui/panels/SwatchesPanel.tsx`, `SwatchesPanel.test.tsx`, `SwatchGrid.tsx`, `SwatchGrid.test.tsx`, `SwatchPicker.tsx`, `SwatchPicker.test.tsx`
- Modify: `src/ui/panels/dock/panel-dock-state.test.ts` (add the regression test)

**Interfaces:**
- Consumes: everything from Tasks 5–13.
- Produces: `ColorPanel({ sel }: { sel: SelectionStyle })` — unchanged signature, so `PanelsRoot` needs no change beyond removing the swatches entry.

Layout, top to bottom, per the reference screenshot: part chooser and saturation
box side by side; the quartet under the chooser (it ships inside `PartChooser`);
then a row of eyedropper + preview + the two stacked sliders; then the numeric
fields; then the palette section.

- [ ] **Step 1: Write the failing test**

Replace `src/ui/panels/ColorPanel.test.tsx` entirely:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ColorPanel } from "./ColorPanel";
import { reloadColorStore } from "../../lib/color-store";
import { reloadPaletteStore } from "../../lib/palette-store";
import type { SelectionStyle } from "./useSelectionStyle";

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
  reloadPaletteStore();
});

describe("ColorPanel", () => {
  it("renders every section", () => {
    render(<ColorPanel sel={fakeSel()} />);
    expect(screen.getByRole("radiogroup", { name: /color target/i })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /saturation/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Hue")).toBeInTheDocument();
    expect(screen.getByLabelText("Palette")).toBeInTheDocument();
  });

  it("no longer renders the old fill/stroke/text rows", () => {
    render(<ColorPanel sel={fakeSel()} />);
    expect(screen.queryByLabelText("Fill opacity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Stroke color")).not.toBeInTheDocument();
  });

  it("seeds the picker from the selection's fill", () => {
    render(<ColorPanel sel={fakeSel()} />);
    // #eeeeee is achromatic and nearly white.
    expect(screen.getByLabelText("Lightness")).toHaveValue(93);
  });

  it("follows the active part to the stroke color", () => {
    render(<ColorPanel sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(screen.getByLabelText("Lightness")).toHaveValue(7);
  });

  it("writes when a palette swatch is applied", () => {
    const sel = fakeSel();
    render(<ColorPanel sel={sel} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0]);
    expect(sel.update).toHaveBeenCalled();
  });

  it("writes when a hue is dragged", () => {
    const sel = fakeSel();
    render(<ColorPanel sel={sel} />);
    const hue = screen.getByRole("slider", { name: /hue/i });
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    expect(sel.update).toHaveBeenCalled();
  });
});
```

Verify the two lightness expectations against the Task 1 module before
trusting them.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/panels/ColorPanel.test.tsx`
Expected: FAIL — the old panel has no radiogroup.

- [ ] **Step 3: Rewrite the panel**

Replace `src/ui/panels/ColorPanel.tsx` entirely:

```tsx
import "../color/color.css";
import { PartChooser } from "../color/PartChooser";
import { SaturationBox } from "../color/SaturationBox";
import { PickerRow } from "../color/PickerRow";
import { NumericFields } from "../color/NumericFields";
import { PaletteSection } from "../color/PaletteSection";
import { useColorTarget } from "../color/useColorTarget";
import { useColorDraft } from "../color/useColorDraft";
import { useColorUiState, setNumericMode } from "../../lib/color-store";
import { hsvToHex } from "../../lib/color-convert";
import type { SelectionStyle } from "./useSelectionStyle";

/**
 * The one place color is edited. The part chooser picks which of the
 * selection's colors every other control below it is aimed at; the picker reads
 * and writes that color live through `useColorTarget`, so the panel is always a
 * view of the current object rather than a form you submit.
 */
export function ColorPanel({ sel }: { sel: SelectionStyle }) {
  const target = useColorTarget(sel);
  const { numericMode } = useColorUiState();

  const draft = useColorDraft({
    hex: target.hex,
    alpha: target.alpha,
    onCommit: target.setColor,
  });

  return (
    <div className="flow-clr-panel">
      <div className="flow-clr-panel__top">
        <PartChooser target={target} />
        <SaturationBox hsv={draft.hsv} onChange={draft.setSv} />
      </div>

      <PickerRow
        hsv={draft.hsv}
        alpha={draft.alpha}
        isNone={draft.isNone}
        onHue={draft.setHue}
        onAlpha={draft.setAlpha}
      />

      <NumericFields
        hsv={draft.hsv}
        alpha={draft.alpha}
        mode={numericMode}
        onModeChange={setNumericMode}
        onChange={draft.setHsvAlpha}
      />

      <PaletteSection
        currentColor={hsvToHex(draft.hsv)}
        onPick={(hex) => target.setColor(hex, draft.alpha, false)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Append the panel layout styles**

Append to `src/ui/color/color.css`:

```css
.flow-clr-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px;
}

.flow-clr-panel__top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.flow-clr-panel__top > .flow-clr-satbox {
  flex: 1 1 auto;
}
```

The row's own styles (`.flow-clr-row`) already landed with `PickerRow` in
Task 8 — do not redefine them here.

- [ ] **Step 5: Drop the Swatches panel**

In `src/ui/panels/PanelsRoot.tsx`, delete the `SwatchesPanel` import and the
registry line:

```tsx
    { id: "swatches", label: "Color Swatches", render: () => <SwatchesPanel /> },
```

Then delete the six files:

```bash
git rm src/ui/panels/SwatchesPanel.tsx src/ui/panels/SwatchesPanel.test.tsx \
       src/ui/panels/SwatchGrid.tsx src/ui/panels/SwatchGrid.test.tsx \
       src/ui/panels/SwatchPicker.tsx src/ui/panels/SwatchPicker.test.tsx
```

Leave `src/ui/panels/controls/ColorSwatch.tsx` alone — `PreferencesDialog.tsx:207`
and `BackgroundControl.tsx:15` still use it.

- [ ] **Step 6: Add the stale-layout regression test**

Append to `src/ui/panels/dock/panel-dock-state.test.ts`:

```ts
it("drops a persisted panel id that no longer exists", () => {
  // A layout saved before the Swatches panel was merged into Color.
  const stored = normalizeDockState({
    panels: [
      { id: "color", order: 0, visible: true },
      { id: "swatches", order: 1, visible: true },
    ],
  });
  const synced = syncPanelDefs(stored, ["color", "stroke"]);
  expect(synced.panels.map((p) => p.id)).toEqual(["color", "stroke"]);
});
```

Match the imports and the `SubPanelState` fields that file already uses — the
object above is illustrative, and `normalizeDockState` will fill defaults.

- [ ] **Step 7: Run the full suite**

Run: `npm test -- --run && npm run typecheck`
Expected: all green. Any test still importing a deleted file is a leftover —
delete it.

- [ ] **Step 8: Verify in the running app**

Run: `npm run dev`, open the Controls dock. Confirm: only one Color panel;
selecting a rectangle shows its fill; clicking the stroke box brings it forward
and the picker jumps to the stroke color; dragging the saturation box changes
the shape live and lands as **one** undo step; ⌘Z restores the original color.
Check the stroke ring renders as a ring.

- [ ] **Step 9: Commit**

```bash
git add -A src/ui/panels src/ui/color
git commit -m "feat(color): single Color panel; retire the Swatches panel"
```

---

**Phase 3 checkpoint.** The dock now has one Color panel doing everything.
The tool rail is untouched.

---

## Phase 4 — Tool rail and popup

> **Spec correction — `shouldRedock` needs no retuning.** The spec lists it as a
> risk. It is `x < REDOCK_MARGIN` where `REDOCK_MARGIN = 10`
> (`src/ui/toolbar/toolbar-state.ts:24,51`), testing the rail's **left edge**
> against the viewport's left edge. That is independent of rail width, so
> widening 48 → 88 does not affect it. No change; Task 15 adds a test pinning
> the behaviour so a future change to either constant is caught.

### Task 15: Widen the rail to two columns

**Files:**
- Modify: `src/ui/toolbar/ToolBar.tsx:14` (the `RAIL_WIDTH` constant)
- Modify: `src/ui/toolbar/toolbar.css:77` (`.flow-toolbar__tools`)
- Modify: `src/ui/toolbar/ToolBar.test.tsx`, `src/ui/toolbar/toolbar-state.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RAIL_WIDTH` is now `88`. `App.tsx:464` and the `--flow-toolbar-reserved` custom property both read the constant, so the canvas gutter follows automatically — **do not** hardcode 88 anywhere else.

- [ ] **Step 1: Write the failing test**

Append to `src/ui/toolbar/ToolBar.test.tsx`, matching its existing render helper:

```tsx
it("is 88px wide so the tools sit in two columns", () => {
  expect(RAIL_WIDTH).toBe(88);
});

it("reserves the canvas gutter at the docked width", () => {
  renderToolbar({ visible: true, floating: false });
  expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
    .toBe("88px");
});

it("reserves nothing while floating", () => {
  renderToolbar({ visible: true, floating: true });
  expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
    .toBe("0px");
});
```

Add `RAIL_WIDTH` to that file's import. Append to
`src/ui/toolbar/toolbar-state.test.ts`:

```ts
it("redocks on the left edge regardless of rail width", () => {
  // shouldRedock tests the rail's left edge against the viewport, so the
  // 48 -> 88 widening must not change the threshold.
  expect(shouldRedock(9)).toBe(true);
  expect(shouldRedock(10)).toBe(false);
  expect(shouldRedock(87)).toBe(false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/ui/toolbar/ToolBar.test.tsx`
Expected: FAIL — `expected 48 to be 88`.

- [ ] **Step 3: Widen the constant**

In `src/ui/toolbar/ToolBar.tsx`, change line 14 and its comment:

```ts
/** Docked rail width; also the horizontal gutter reserved on the left. Two
 *  columns of 40px tool buttons plus padding — the second column exists to
 *  make room for the shape tools coming later, and for the color control
 *  pinned at the bottom. */
export const RAIL_WIDTH = 88;
```

- [ ] **Step 4: Make the tools a two-column grid**

In `src/ui/toolbar/toolbar.css`, replace the `.flow-toolbar__tools` rule:

```css
.flow-toolbar__tools {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 4px;
  overflow-y: auto;
}
```

Read the surrounding `.flow-toolbar__btn` rule and confirm the buttons still
size correctly in a grid cell; if they were relying on `flex-direction: column`
for their width, give them `width: 100%`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/ui/toolbar/`
Expected: PASS. Existing rail tests must stay green — if one asserts a 48px
geometry, update that number; if one asserts *behaviour*, it should not need
touching.

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`. The rail is two columns; the canvas insets correctly with no
overlap and no gap; tearing it off and dragging back to the left edge still
redocks; hiding it via the hamburger reclaims the gutter.

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar
git commit -m "feat(toolbar): widen the tool rail to two columns"
```

---

### Task 16: Rail color control and popup

**Files:**
- Create: `src/ui/toolbar/RailColorControl.tsx`, `src/ui/toolbar/ColorPopup.tsx`
- Modify: `src/ui/toolbar/ToolBar.tsx` (mount the control), `src/ui/toolbar/toolbar.css` (append)
- Test: `src/ui/toolbar/RailColorControl.test.tsx`

**Interfaces:**
- Consumes: `PartChooser`, `SaturationBox`, `HueSlider`, `AlphaSlider`, `ColorPreview`, `EyeDropperButton`, `useColorTarget`, `useColorDraft` (Phase 2–3); `useColorUiState` (Task 4); `SelectionStyle`.
- Produces: `RailColorControl({ sel }: { sel: SelectionStyle })`. `ToolBar` gains a required `sel: SelectionStyle` prop, so `App.tsx` must pass the same `sel` it already gives `PanelsRoot`.

The popup contains exactly what the reference screenshot draws: saturation box,
then eyedropper + preview + hue + alpha, then the six recents. **No palette
dropdown and no quartet inside the popup** — the quartet is part of the chooser,
which sits in the rail beneath it.

Dismissal mirrors `ToolbarConfigMenu`: outside `pointerdown` closes, `Escape`
closes and returns focus to the trigger.

- [ ] **Step 1: Write the failing test**

Create `src/ui/toolbar/RailColorControl.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RailColorControl } from "./RailColorControl";
import { reloadColorStore, recordRecent } from "../../lib/color-store";
import type { SelectionStyle } from "../panels/useSelectionStyle";

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
});

describe("RailColorControl", () => {
  it("renders the compact part chooser", () => {
    render(<RailColorControl sel={fakeSel()} />);
    expect(screen.getByRole("radiogroup", { name: /color target/i })).toBeInTheDocument();
  });

  it("keeps the popup closed initially", () => {
    render(<RailColorControl sel={fakeSel()} />);
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("opens the popup from the active box", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("dialog", { name: /color picker/i })).toBeInTheDocument();
  });

  it("switches part rather than opening when a back box is clicked", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /stroke/i })).toBeChecked();
  });

  it("shows the picker controls but no palette dropdown", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getByRole("application", { name: /saturation/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Palette")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Hue", { selector: "input" })).not.toBeInTheDocument();
  });

  it("renders six recent slots", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    expect(screen.getAllByRole("button", { name: /recent color slot/i })).toHaveLength(6);
  });

  it("fills slots from the store and applies one on click", () => {
    recordRecent("#00ff00");
    const sel = fakeSel();
    render(<RailColorControl sel={sel} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.click(screen.getByRole("button", { name: "Recent color #00ff00" }));
    expect(sel.update).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("closes on an outside pointer press", () => {
    render(
      <>
        <button>outside</button>
        <RailColorControl sel={fakeSel()} />
      </>,
    );
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.pointerDown(screen.getByText("outside"));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });

  it("closes from the X button", () => {
    render(<RailColorControl sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.click(screen.getByRole("button", { name: /close color picker/i }));
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/ui/toolbar/RailColorControl.test.tsx`
Expected: FAIL — `Failed to resolve import "./RailColorControl"`.

- [ ] **Step 3: Write ColorPopup**

Create `src/ui/toolbar/ColorPopup.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import "../color/color.css";
import "./toolbar.css";
import { SaturationBox } from "../color/SaturationBox";
import { PickerRow } from "../color/PickerRow";
import { useColorDraft } from "../color/useColorDraft";
import { useColorUiState } from "../../lib/color-store";
import { RECENT_LIMIT } from "../../lib/recent-colors";
import type { ColorTarget } from "../color/useColorTarget";

interface ColorPopupProps {
  target: ColorTarget;
  /** Viewport coordinates for the popup's top-left. */
  anchor: { top: number; left: number };
  onClose: () => void;
}

/**
 * The rail's compact picker. Deliberately smaller than the panel: no numeric
 * fields and no palette management, because reaching for the rail means
 * "give me a color now" — the panel is where you go to be precise.
 */
export function ColorPopup({ target, anchor, onClose }: ColorPopupProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { recents } = useColorUiState();

  const draft = useColorDraft({
    hex: target.hex,
    alpha: target.alpha,
    onCommit: target.setColor,
  });

  // Dismissal mirrors ToolbarConfigMenu: outside press or Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Always six slots so the strip does not reflow as it fills.
  const slots = Array.from({ length: RECENT_LIMIT }, (_, i) => recents[i] ?? null);

  return createPortal(
    <div
      ref={ref}
      className="flow-clr-popup"
      role="dialog"
      aria-label="Color picker"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <button
        type="button"
        className="flow-clr-popup__close"
        aria-label="Close color picker"
        onClick={onClose}
      >
        ×
      </button>

      <SaturationBox hsv={draft.hsv} onChange={draft.setSv} />

      <PickerRow
        hsv={draft.hsv}
        alpha={draft.alpha}
        isNone={draft.isNone}
        onHue={draft.setHue}
        onAlpha={draft.setAlpha}
      />

      <div className="flow-clr-recents">
        {slots.map((hex, i) => (
          <button
            key={i}
            type="button"
            className="flow-clr-recents__slot"
            style={hex ? { background: hex } : undefined}
            aria-label={hex ? `Recent color ${hex}` : `Recent color slot ${i + 1}, empty`}
            title={hex ?? undefined}
            disabled={!hex}
            onClick={() => hex && target.setColor(hex, draft.alpha, false)}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
```

Note the empty-slot label still matches `/recent color slot/i` while a filled
one reads `Recent color #00ff00` — that is what lets the two tests above
distinguish them.

- [ ] **Step 4: Write RailColorControl**

Create `src/ui/toolbar/RailColorControl.tsx`:

```tsx
import { useRef, useState } from "react";
import "./toolbar.css";
import { PartChooser } from "../color/PartChooser";
import { useColorTarget } from "../color/useColorTarget";
import { ColorPopup } from "./ColorPopup";
import type { SelectionStyle } from "../panels/useSelectionStyle";

/** Gap between the rail's right edge and the popup. */
const POPUP_GAP = 8;

/**
 * The rail's color control: the same part chooser the panel uses, with one
 * extra behaviour — clicking the box that is *already* active opens the compact
 * picker, while clicking a back box just brings it forward. That keeps a single
 * click meaning "switch part" and a second click meaning "edit it".
 */
export function RailColorControl({ sel }: { sel: SelectionStyle }) {
  const target = useColorTarget(sel);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const anchor = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    return {
      top: Math.max(8, (r?.top ?? 0) - 200),
      left: (r?.right ?? 0) + POPUP_GAP,
    };
  };

  const chooserTarget = {
    ...target,
    setPart: (part: typeof target.part) => {
      if (part === target.part) {
        setOpen((o) => !o);
        return;
      }
      target.setPart(part);
    },
  };

  return (
    <div className="flow-toolbar__color" ref={wrapRef}>
      <PartChooser target={chooserTarget} compact />
      {open && (
        <ColorPopup target={target} anchor={anchor()} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Mount it in the rail**

In `src/ui/toolbar/ToolBar.tsx`: add `sel: SelectionStyle` to `ToolBarProps`,
accept it in the signature, import `RailColorControl`, and render it directly
after the `.flow-toolbar__tools` div and before the `{menuOpen && …}` block:

```tsx
      <RailColorControl sel={sel} />
```

Then in `src/App.tsx`, pass the existing `sel` down to `<ToolBar …>`. It is
already in scope — the same value handed to `PanelsRoot`.

- [ ] **Step 6: Append the styles**

Append to `src/ui/toolbar/toolbar.css`:

```css
/* Pinned to the bottom of the rail, below the scrolling tool grid. */
.flow-toolbar__color {
  display: flex;
  justify-content: center;
  margin-top: auto;
  padding: 8px 4px;
  border-top: 1px solid var(--flow-border);
}
```

And to `src/ui/color/color.css`:

```css
.flow-clr-popup {
  position: fixed;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 280px;
  padding: 12px;
  background: var(--flow-panel-bg);
  border: 1px solid var(--flow-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 18%);
}

.flow-clr-popup__close {
  position: absolute;
  top: -14px;
  right: -14px;
  width: 28px;
  height: 28px;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  background: var(--flow-panel-bg);
  border: 1px solid var(--flow-border);
  border-radius: 50%;
  box-shadow: 0 2px 6px rgb(0 0 0 / 18%);
}

.flow-clr-recents {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 6px;
}

.flow-clr-recents__slot {
  aspect-ratio: 1;
  padding: 0;
  cursor: pointer;
  background: var(--flow-panel-bg);
  border: 1px solid var(--flow-border);
  border-radius: 4px;
}

.flow-clr-recents__slot:disabled {
  cursor: default;
}
```

The rail's flex column must allow `margin-top: auto` to push the control down —
confirm `.flow-toolbar` is `display: flex; flex-direction: column`, and that
`.flow-toolbar__tools` has `flex: 1 1 auto; min-height: 0` so it scrolls instead
of squashing the control.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- --run src/ui/toolbar/`
Expected: PASS, including the 10 new ones. `ToolBar.test.tsx` now needs a `sel`
prop in its render helper — add the same fake used above.

- [ ] **Step 8: Verify in the running app**

Run: `npm run dev`. Select a shape; the rail chooser shows its colors. Click the
front box → popup opens beside the rail. Change the hue → the shape and the
**Color panel** both follow live. Close, open the panel, change a color there →
the rail chooser follows. Apply three colors and confirm they accumulate in the
popup's recents, newest first. Reload; the recents survive.

- [ ] **Step 9: Commit**

```bash
git add src/ui/toolbar src/ui/color/color.css src/App.tsx
git commit -m "feat(toolbar): rail color control with compact picker popup"
```

---

### Task 17: End-to-end coverage

**Files:**
- Rewrite: `e2e/color-panel.spec.ts`
- Delete: `e2e/color-swatches.spec.ts` (the panel it drives is gone; its palette assertions move into the rewritten spec)

**Interfaces:**
- Consumes: the shipped UI from Tasks 14 and 16.
- Produces: nothing importable.

Read `e2e/color-panel.spec.ts` and `e2e/align-panel.spec.ts` first for the
house helpers (`drawRect`, the `.flow-pnl` wait). Reuse them rather than
inventing new ones.

- [ ] **Step 1: Write the spec**

Replace `e2e/color-panel.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";

/** Draw a rectangle by dragging; leaves it selected. */
async function drawRect(page: Page, x1: number, y1: number, x2: number, y2: number) {
  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(x1, y1);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 6 });
  await page.mouse.up();
}

const panel = ".flow-clr-panel";
const popup = '[role="dialog"][aria-label="Color picker"]';

test("the dock has exactly one color panel", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await expect(page.getByRole("radiogroup", { name: "Color target" }).first()).toBeVisible();
  await expect(page.getByText("Color Swatches")).toHaveCount(0);
});

test("the panel follows the selection and writes back", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const lightness = page.locator(panel).getByLabel("Lightness");
  const before = await lightness.inputValue();

  await page.locator(panel).getByRole("slider", { name: "Hue" }).click({ position: { x: 10, y: 7 } });
  await expect(lightness).not.toHaveValue(before);
});

test("switching part retargets the picker", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const fillL = await page.locator(panel).getByLabel("Lightness").inputValue();
  await page.locator(panel).getByRole("radio", { name: /Stroke/ }).click();
  await expect(page.locator(panel).getByLabel("Lightness")).not.toHaveValue(fillL);
});

test("a slider drag is a single undo step", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const lightness = page.locator(panel).getByLabel("Lightness");
  const original = await lightness.inputValue();

  const hue = page.locator(panel).getByRole("slider", { name: "Hue" });
  const box = (await hue.boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2, { steps: 8 });
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(lightness).not.toHaveValue(original);

  await page.keyboard.press("Control+z");
  await expect(lightness).toHaveValue(original);
});

test("none on stroke zeroes the width and a color revives it", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("radio", { name: /Stroke/ }).click();
  await page.locator(panel).getByRole("button", { name: "None" }).click();
  await expect(page.getByLabel("Stroke width")).toHaveValue("0");

  await page.locator(panel).getByRole("button", { name: "Grey" }).click();
  await expect(page.getByLabel("Stroke width")).toHaveValue("1");
});

test("swap exchanges fill and stroke", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  const fillL = await page.locator(panel).getByLabel("Lightness").inputValue();

  await page.locator(panel).getByRole("button", { name: "Swap fill and stroke" }).click();
  await expect(page.locator(panel).getByLabel("Lightness")).not.toHaveValue(fillL);
});

test("the rail popup and the panel stay in step", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  const railFill = page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ });
  await railFill.click();
  await expect(page.locator(popup)).toBeVisible();

  const panelL = await page.locator(panel).getByLabel("Lightness").inputValue();
  await page.locator(popup).getByRole("slider", { name: "Hue" }).click({ position: { x: 150, y: 7 } });
  await expect(page.locator(panel).getByLabel("Lightness")).not.toHaveValue(panelL);

  await page.keyboard.press("Escape");
  await expect(page.locator(popup)).toHaveCount(0);
});

test("recents accumulate and survive a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(panel).getByRole("button", { name: "Black" }).click();
  await page.locator(panel).getByRole("button", { name: "White" }).click();

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #ffffff" })).toBeVisible();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #000000" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: "Recent color #ffffff" })).toBeVisible();
});

test("selecting text collapses the chooser to the text part", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await page.getByRole("button", { name: "Text" }).click();
  await page.mouse.click(600, 340);
  await page.keyboard.type("hello");
  await page.keyboard.press("Escape");

  const radios = page.locator(panel).getByRole("radio");
  await expect(radios).toHaveCount(1);
  await expect(radios.first()).toHaveAccessibleName(/Text/);
});

test("adding the current color to a palette persists", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);
  await page.locator(panel).getByRole("button", { name: "Black" }).click();

  await page.locator(panel).getByRole("button", { name: "Add current color to palette" }).click();
  await expect(page.locator(panel).getByRole("button", { name: "Swatch #000000" })).toBeVisible();

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await expect(page.locator(panel).getByRole("button", { name: "Swatch #000000" })).toBeVisible();
});
```

- [ ] **Step 2: Delete the obsolete spec**

```bash
git rm e2e/color-swatches.spec.ts
```

- [ ] **Step 3: Kill stray dev servers, then run**

[[excalidraw-upgrade]] records that stale Vite servers make e2e results
untrustworthy. Before running:

```bash
pkill -f "vite" || true
npm run test:e2e -- e2e/color-panel.spec.ts
```

Expected: 10 passing. Selectors are the most likely failure — read the actual
DOM with `--debug` rather than loosening assertions. The "Stroke width" label
comes from the Stroke panel; confirm its accessible name against
`src/ui/panels/StrokePanel.tsx` and fix the spec if it differs.

- [ ] **Step 4: Run the whole e2e suite**

Run: `npm run test:e2e`
Expected: all green. Other specs may reference the Color Swatches panel or the
old Fill/Stroke rows — update them to the new UI.

- [ ] **Step 5: Commit**

```bash
git add -A e2e
git commit -m "test(e2e): cover the merged color panel and rail popup"
```

---

## Phase 5 — Eyedropper

### Task 18: Wire the vendor eyedropper

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/index.tsx` (2 added lines)
- Modify: `src/excalidraw-fork.d.ts`
- Create: `src/lib/eyedropper.ts`, `src/lib/eyedropper.test.ts`
- Modify: `src/ui/panels/ColorPanel.tsx`, `src/ui/toolbar/ColorPopup.tsx` (pass `onPick`)

**Interfaces:**
- Consumes: `activeEyeDropperAtom`, `editorJotaiStore` from `@excalidraw/excalidraw` (newly exported).
- Produces: `openEyeDropper(opts: { part: ColorPart; onSelect: (hex: string) => void }): void` and `cancelEyeDropper(): void`.

**This is a fork edit.** Per [[flow-fork-strategy]], keep it additive and
minimal. Both symbols already exist and are exported from their own modules —
`activeEyeDropperAtom` at
`vendor/excalidraw/packages/excalidraw/components/EyeDropper.tsx:35` and
`editorJotaiStore` at `packages/excalidraw/editor-jotai.ts:18` — so the fork
change is two re-export lines in the package index, exactly the shape of the
existing `getSearchMatches` export at `index.tsx:559`. Nothing is modified, only
surfaced.

`LayerUI` already renders the overlay whenever the atom is set
(`LayerUI.tsx:512`), so flow needs no component of its own.

- [ ] **Step 1: Add the fork exports**

In `vendor/excalidraw/packages/excalidraw/index.tsx`, beside the
`getSearchMatches` export at line 559:

```tsx
// flow: surface the eyedropper so a host-side color picker can open the
// vendor's own overlay. Additive re-exports only — LayerUI already renders
// <EyeDropper/> whenever this atom is set.
export { activeEyeDropperAtom } from "./components/EyeDropper";
export { editorJotaiStore } from "./editor-jotai";
```

- [ ] **Step 2: Rebuild the vendor package**

[[excalidraw-upgrade]] records that a fork export is invisible to flow until the
package is rebuilt, and that the generated types are a separate gotcha.

```bash
npm run build:excalidraw
```

Expected: completes without error. This is slow — several minutes.

- [ ] **Step 3: Declare the types**

Read `src/excalidraw-fork.d.ts` for the module-augmentation style already in use
and add:

```ts
  /** flow fork export: the vendor's eyedropper trigger. Setting this atom makes
   *  LayerUI render the picking overlay; it clears itself on select/cancel. */
  export const activeEyeDropperAtom: {
    // Opaque handle — only ever passed to editorJotaiStore.set/get.
    readonly __brand: unique symbol;
  };

  export const editorJotaiStore: {
    set: (atom: unknown, value: unknown) => void;
    get: (atom: unknown) => unknown;
  };
```

If the rebuild emitted real declarations for these, delete this block and use
them instead — generated types beat hand-written ones.

- [ ] **Step 4: Write the failing test**

Create `src/lib/eyedropper.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const set = vi.fn();
vi.mock("@excalidraw/excalidraw", () => ({
  activeEyeDropperAtom: { __atom: true },
  editorJotaiStore: { set: (...args: unknown[]) => set(...args) },
}));

const { openEyeDropper, cancelEyeDropper } = await import("./eyedropper");

beforeEach(() => set.mockClear());

describe("openEyeDropper", () => {
  it("sets the atom with a payload the vendor accepts", () => {
    openEyeDropper({ part: "fill", onSelect: vi.fn() });
    const [atom, payload] = set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(atom).toEqual({ __atom: true });
    expect(payload).toMatchObject({
      keepOpenOnAlt: false,
      colorPickerType: "elementBackground",
    });
    expect(typeof payload.onSelect).toBe("function");
  });

  it("maps stroke and text to the stroke picker type", () => {
    openEyeDropper({ part: "stroke", onSelect: vi.fn() });
    expect((set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe("elementStroke");
    set.mockClear();
    openEyeDropper({ part: "text", onSelect: vi.fn() });
    expect((set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe("elementStroke");
  });

  it("forwards the picked color as a scrubbed hex", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });
    const payload = set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("#FF0000", {});
    expect(onSelect).toHaveBeenCalledWith("#ff0000");
  });

  it("ignores an unparseable picked color", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });
    const payload = set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("rgb(1,2,3)", {});
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clears the atom on cancel", () => {
    cancelEyeDropper();
    expect(set).toHaveBeenCalledWith({ __atom: true }, null);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- --run src/lib/eyedropper.test.ts`
Expected: FAIL — `Failed to resolve import "./eyedropper"`.

- [ ] **Step 6: Write the bridge**

Create `src/lib/eyedropper.ts`:

```ts
// src/lib/eyedropper.ts
import { activeEyeDropperAtom, editorJotaiStore } from "@excalidraw/excalidraw";
import { scrubHex } from "./color-palettes";
import type { ColorPart } from "./color-parts";

/** The vendor's own picker-type discriminator; it drives the alt-drag preview. */
const PICKER_TYPE: Record<ColorPart, string> = {
  fill: "elementBackground",
  stroke: "elementStroke",
  // Text color is stored on strokeColor, so it previews as a stroke.
  text: "elementStroke",
};

interface OpenEyeDropperOptions {
  part: ColorPart;
  /** Receives a scrubbed `#rrggbb`. Never called for an unparseable pick. */
  onSelect: (hex: string) => void;
}

/**
 * Open Excalidraw's own eyedropper.
 *
 * flow does not render the overlay: `LayerUI` already mounts `<EyeDropper/>`
 * whenever this atom holds a payload, and clears it on select or cancel. So the
 * whole integration is setting one atom — which is why the fork edit is two
 * re-export lines rather than a ported component.
 */
export function openEyeDropper({ part, onSelect }: OpenEyeDropperOptions): void {
  editorJotaiStore.set(activeEyeDropperAtom, {
    // flow's picker closes on pick; alt-to-keep-open would strand the overlay
    // above a popup that has already dismissed.
    keepOpenOnAlt: false,
    colorPickerType: PICKER_TYPE[part],
    onSelect: (color: string) => {
      // The vendor can hand back any CSS color; the panels only speak hex.
      const hex = scrubHex(color);
      if (hex) onSelect(hex);
    },
  });
}

/** Dismiss the overlay (e.g. the popup closed underneath it). */
export function cancelEyeDropper(): void {
  editorJotaiStore.set(activeEyeDropperAtom, null);
}
```

- [ ] **Step 7: Pass `onPick` at both call sites**

In `src/ui/panels/ColorPanel.tsx`, import `openEyeDropper` and add the `onPick`
prop to the existing `<PickerRow …>`:

```tsx
        onPick={() =>
          openEyeDropper({
            part: target.part,
            onSelect: (hex) => target.setColor(hex, draft.alpha, false),
          })
        }
```

Do the same on the `<PickerRow …>` in `src/ui/toolbar/ColorPopup.tsx`.
`PickerRow` already forwards `onPick` to `EyeDropperButton`, so no other file
changes — which is the payoff for having extracted the row in Task 8.

- [ ] **Step 8: Run tests**

Run: `npm test -- --run && npm run typecheck`
Expected: all green. The `preview.test.tsx` assertion that the button is
disabled without a handler still passes — it renders the component directly.

- [ ] **Step 9: Verify in the running app**

Run: `npm run dev`. Draw two shapes in different colors. Select one, click the
eyedropper in the Color panel, click the other shape — the first takes the
second's color, in one undo step. Repeat from the rail popup. Press Escape
mid-pick and confirm the overlay dismisses with nothing written.

- [ ] **Step 10: Commit**

The vendor submodule commits separately.

Confirm the submodule is on `flow-next` first (`git -C vendor/excalidraw branch
--show-current`) — that is the live fork branch. Also fix `.gitmodules`, which
still names the stale `flow` branch:

```bash
git config -f .gitmodules submodule.vendor/excalidraw.branch flow-next
```

```bash
git -C vendor/excalidraw add packages/excalidraw/index.tsx
git -C vendor/excalidraw commit -m "flow: export activeEyeDropperAtom and editorJotaiStore"
git add .gitmodules vendor/excalidraw src/lib/eyedropper.ts src/lib/eyedropper.test.ts \
        src/excalidraw-fork.d.ts src/ui/panels/ColorPanel.tsx src/ui/toolbar/ColorPopup.tsx
git commit -m "feat(color): wire the vendor eyedropper into both pickers"
```

If `dist/` is tracked and rebuilt, commit it in its own `chore(dist):` commit —
match whatever the repo's recent history does.

---

## Phase 6 — Land it

### Task 19: Final verification and project memory

**Files:**
- Create: `.claude/memory/color-system.md`
- Modify: `.claude/memory/MEMORY.md`, `.claude/memory/color-swatches.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing importable.

Per `CLAUDE.md`, memory is **repo-local**. Do not write to the global Claude
account.

- [ ] **Step 1: Full verification**

```bash
pkill -f "vite" || true
npm run typecheck && npm test -- --run && npm run test:e2e
```

Expected: three green runs. Record the actual counts — you will cite them in the
memory file, and [[verification-before-completion]] applies: no success claim
without the output in front of you.

- [ ] **Step 2: Confirm nothing was orphaned**

```bash
grep -rn "SwatchesPanel\|SwatchPicker\|SwatchGrid" src e2e || echo "clean"
grep -rn "ColorSwatch" src | grep -v "controls/ColorSwatch"
```

Expected: the first prints `clean`. The second must show **only**
`PreferencesDialog.tsx` and `BackgroundControl.tsx` — those two keep the old
small well deliberately.

- [ ] **Step 3: Write the memory file**

Create `.claude/memory/color-system.md`, matching the style of the existing
memory files (read `color-swatches.md` and `style-memory.md` first):

```markdown
# Color system

Shipped 2026-08-11. Replaced four scattered color surfaces with one Color panel
plus a tool-rail control. Spec:
`docs/superpowers/specs/2026-08-11-color-system-redesign-design.md`.

## The load-bearing idea

**The color is derived from the selection, never stored.** `useColorTarget`
reads it every render through `useSelectionStyle`, so the Color panel and the
rail popup are two views of one truth with no sync layer. Only the active part,
the recents and the numeric mode live in `color-store.ts` — they have no home on
the canvas.

The matching subtlety is `useColorDraft`. HSV must be held locally or hue dies
at `#000000` and at `s: 0`; but a hook that re-seeds from its own emitted hex
loses the hue anyway. It records what it emitted and re-seeds **only** on a
color it did not produce. Touch that rule and hue preservation breaks silently —
`useColorDraft.test.tsx` has the round-trip-to-black test that catches it.

## Layout of the code

- `src/lib/color-convert.ts` — hex/RGB/HSV/HSL, **unrounded floats** (rounding
  inside conversions drifts the color during a drag)
- `src/lib/color-parts.ts` — which parts a selection exposes and where each one
  writes. Text-only selections expose `["text"]` alone
- `src/lib/color-store.ts`, `src/lib/recent-colors.ts` — active part, 6 recents
  (`flow.recentColors`, cross-document, no scene scan), numeric mode
- `src/ui/color/` — every picker primitive, `useColorDraft`, `useColorTarget`
- `src/ui/toolbar/RailColorControl.tsx` + `ColorPopup.tsx` — the rail surface

## Traps

- **`strokeWidth` with `??`, never `||`.** `quickSet("none")` on stroke writes
  width 0, and applying a color over it revives width 1. See [[drawing-defaults]]
  — falsy coercion on a legitimate 0 has cost this project three fork edits.
- **`ColorSwatch` was NOT deleted.** `PreferencesDialog` and `BackgroundControl`
  still use it for non-element colors.
- **The "default palette" concept is gone.** The panel's dropdown selection *is*
  the active palette, still persisted under `flow.defaultPaletteId`.
- **Fork edit:** two re-exports in `packages/excalidraw/index.tsx`
  (`activeEyeDropperAtom`, `editorJotaiStore`). Needs `npm run build:excalidraw`
  to be visible. `LayerUI` renders the overlay itself; flow only sets the atom.
- `RAIL_WIDTH` is 88 and read by `App.tsx` for the canvas gutter — never
  hardcode it. `shouldRedock` tests the left edge and is width-independent.
```

- [ ] **Step 4: Update the memory index**

Add one line to `.claude/memory/MEMORY.md`, matching the existing format:

```markdown
- [Color system](color-system.md) — 2026-08-11: one Color panel (part chooser + HSV picker + merged palettes) and a rail color control; color derived from the selection, `useColorDraft` guards hue; fork export #3 (eyedropper atom)
```

- [ ] **Step 5: Amend the superseded memory**

`color-swatches.md` describes the Swatches panel that no longer exists. Add a
note at its top rather than deleting the file — the palette-store design it
documents is still live:

```markdown
> **Superseded 2026-08-11:** the Swatches *panel* is gone, merged into the Color
> panel — see [[color-system]]. `palette-store` and the seeded palettes below
> are unchanged and still current.
```

Update its one-line entry in `MEMORY.md` to say the panel was merged away.

- [ ] **Step 6: Commit**

```bash
git add .claude/memory
git commit -m "docs(memory): record the color system redesign"
```

- [ ] **Step 7: Update the spec's status**

In `docs/superpowers/specs/2026-08-11-color-system-redesign-design.md`, change
the header to `**Status:** shipped 2026-08-11`, and correct the two risks that
dissolved on inspection: the eyedropper export was a two-line re-export, and
`shouldRedock` needed no retuning. Also correct the "Retired and migrated" row
claiming a `panel-dock-state` migration was needed — `syncPanelDefs` already
handled it.

```bash
git add docs/superpowers/specs
git commit -m "docs(spec): mark the color redesign shipped and correct three risks"
```

---

## Plan self-review

Checked against the spec after writing.

**Spec coverage.** Every mechanism section maps to a task: state → 4, 11; pure
modules → 1, 2, 3; components → 5–9, 12, 13; part chooser → 12; numeric fields →
9; write path → 11; tool rail → 15, 16; eyedropper → 18; palette section → 13;
retired/migrated → 14; testing → distributed plus 17; risks → 15, 18.

**Three spec claims corrected, in place, with reasons:**

1. The `panel-dock-state` migration is unnecessary — `syncPanelDefs` already
   drops unknown ids (flagged at the head of Phase 3).
2. `shouldRedock` needs no retuning — it tests the left edge, not the width
   (flagged at the head of Phase 4).
3. The eyedropper export was the spec's one unverified risk; both symbols are
   already exported from their own modules, so it is two re-export lines and the
   browser-API fallback is not needed.

**One spec gap found and filled.** The spec never said what `quickSet("none")`
does on the **text** part. Task 11 makes it a no-op and says why.

**Type consistency.** `ColorPart`, `PartSpec`, `ColorTarget`, `QuickColor`,
`Hsv`/`Hsl`/`Rgb`, `NumericMode`, `AreaPos` and `RECENT_LIMIT` are each defined
once and referenced with the same names throughout. Alpha is 0–100 everywhere
except the `NumericFields` display layer, which is called out explicitly in
Task 9. `hsvToHsl`/`hslToHsv` were used in Task 9 before being defined, so
Task 9 Step 4 adds them to the Task 1 module with tests.

**Known soft spots for the implementer.** Three places where the plan's
arithmetic or CSS should be verified rather than trusted, each flagged at the
step: the HSL expectations in Task 9 and Task 14, the stroke-ring `box-shadow`
in Task 12, and the Playwright selectors in Task 17.
