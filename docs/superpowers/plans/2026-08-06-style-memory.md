# Per-category style memory — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remember the style of the last element you selected or edited, per category, and apply it to the next element you draw in that category — so recolouring an arrow never changes what the next rectangle looks like.

**Architecture:** A pure `style-memory.ts` owns the taxonomy (four categories: shape, linear, text, freedraw), the element→`currentItem*` snapshot mapping, and the "only apply what renders" filter. A session-only module singleton `style-memory-store.ts` holds the four buckets. A `useStyleMemory` hook subscribes to Excalidraw's `onChange` and does three things: adopts a single newly-selected element's style, folds `currentItem*` drift into the buckets of the selected categories, and loads the right bucket into `currentItem*` when the active tool changes. Only **contended** keys — ones two or more categories can render — are bucketed; everything else stays resident in appState where vendor already handles it correctly.

**Tech Stack:** React 19, TypeScript, Vite, Vitest + Testing Library (jsdom), Playwright, Excalidraw via the `vendor/excalidraw` submodule.

**Spec:** `docs/superpowers/specs/2026-08-06-style-memory-design.md`

## Global Constraints

- **Exactly one fork edit, in Task 5.** `currentItemCornerRadius` and `currentItemPadding` are added to vendor `appState.ts` and read at two creation sites. Tasks 1–4 touch only `src/` and `e2e/`. Do not modify `vendor/excalidraw` in any other task.
- **Vendor rebuild procedure** (from `.claude/memory/selection-mode.md`, learned the hard way): run the package build from `vendor/excalidraw/packages/excalidraw` as `node ../../scripts/buildPackage.js` — running it from the submodule root fails. `yarn` is blocked on Node 25. `buildPackage.js` does **not** emit types; regenerate them with `node_modules/.bin/tsc -p tsconfig.json` from that same directory (it prints pre-existing upstream type errors — cornerRadius/Point noise, unrelated to our edit). Never `rm -rf dist` without regenerating types, or flow's tsc cannot resolve `@excalidraw/excalidraw`.
- **Fork edits must be committed on the submodule's `flow` branch AND the parent gitlink bumped**, or the change is not durable (`dist/` is gitignored).
- **The four categories** are exactly `"shape" | "linear" | "text" | "freedraw"`. Never add a fifth. Image, frame, iframe, embeddable, laser, eraser, hand and selection map to `null` — never adopted from, never applied to.
- **Contended keys** (bucketed, swapped on tool change) are exactly these eight: `currentItemStrokeColor`, `currentItemBackgroundColor`, `currentItemFillStyle`, `currentItemStrokeWidth`, `currentItemStrokeStyle`, `currentItemOpacity`, `currentItemRoundness`, `currentItemCornerRadius`.
- **Resident keys** (never bucketed, never swapped) are everything else, notably: `currentItemTextColor`, `currentItemFontFamily`, `currentItemFontSize`, `currentItemTextAlign`, `currentItemPadding`, `currentItemArrowType`, `currentItemStartArrowhead`, `currentItemEndArrowhead`, `currentItemStartArrowheadSize`, `currentItemEndArrowheadSize`. Adoption still *writes* them; the swap never touches them.
- **`currentItemRoughness` is excluded entirely** — from buckets and from snapshots. Sloppiness is an app-wide flow preference re-asserted at the call site; bucketing it would fight `App.tsx`.
- **The load uses `CaptureUpdateAction.NEVER`.** It changes defaults only and touches no element; a defaults swap must never become an undo entry.
- **Test commands:** `npm test -- --run` (unit), `npm run typecheck`, `npx playwright test <file>` (e2e). The dev server for e2e is started by `playwright.config.ts`.
- **Never modify a test to make it pass.** If a test fails, fix the implementation.

---

### Task 1: The pure taxonomy — `style-memory.ts`

**Files:**
- Create: `src/lib/style-memory.ts`
- Test: `src/lib/style-memory.test.ts`

**Interfaces:**
- Consumes: `effectiveCornerRadius` and `cornerRadiusApplies` from `src/lib/corner-radius.ts`; `effectivePadding` from `src/lib/padding.ts`. Both are existing pure modules with no Excalidraw imports.
- Produces:
  ```ts
  export type StyleCategory = "shape" | "linear" | "text" | "freedraw";
  export type StyleBucket = Record<string, unknown>;
  export interface StyleElement {
    id: string;
    type: string;
    [key: string]: unknown;
  }
  export interface LoadTarget {
    category: StyleCategory;
    /** Excalidraw `activeTool.type`, e.g. "rectangle" | "ellipse" | "arrow" | "line". */
    toolType: string;
    /** Live `currentItemArrowType`; only consulted when toolType === "arrow". */
    arrowType: string;
  }
  export const CONTENDED_KEYS: readonly string[];
  export const CATEGORY_KEYS: Record<StyleCategory, readonly string[]>;
  export function contendedOnly(patch: StyleBucket): StyleBucket;
  export function categoryOfElement(type: string): StyleCategory | null;
  export function categoryOfTool(toolType: string): StyleCategory | null;
  export function snapshotElement(el: StyleElement): StyleBucket;
  export function snapshotContainerPadding(el: StyleElement): StyleBucket;
  export function applicableKeys(target: LoadTarget): readonly string[];
  ```

**Context:** This module must not import from `@excalidraw/excalidraw`. Loading that package under jsdom runs module-level UI code that throws — the reason `selection-style.ts`, `corner-radius.ts` and `padding.ts` are all vendor-free. Follow that convention.

`snapshotElement` reads element props and returns `currentItem*` keys. It returns keys for the element's own category **plus** any resident keys that element owns — adoption writes the whole snapshot through, so arrowheads and font size must be in it even though they are never bucketed.

- [ ] **Step 1: Write the failing test**

Create `src/lib/style-memory.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CONTENDED_KEYS,
  CATEGORY_KEYS,
  contendedOnly,
  categoryOfElement,
  categoryOfTool,
  snapshotElement,
  snapshotContainerPadding,
  applicableKeys,
} from "./style-memory";

describe("categoryOfElement", () => {
  it("maps the drawable element types to their category", () => {
    expect(categoryOfElement("rectangle")).toBe("shape");
    expect(categoryOfElement("diamond")).toBe("shape");
    expect(categoryOfElement("ellipse")).toBe("shape");
    expect(categoryOfElement("arrow")).toBe("linear");
    expect(categoryOfElement("line")).toBe("linear");
    expect(categoryOfElement("text")).toBe("text");
    expect(categoryOfElement("freedraw")).toBe("freedraw");
  });

  it("returns null for types with no style memory", () => {
    expect(categoryOfElement("image")).toBeNull();
    expect(categoryOfElement("frame")).toBeNull();
    expect(categoryOfElement("iframe")).toBeNull();
    expect(categoryOfElement("embeddable")).toBeNull();
  });
});

describe("categoryOfTool", () => {
  it("maps drawing tools to their category", () => {
    expect(categoryOfTool("rectangle")).toBe("shape");
    expect(categoryOfTool("arrow")).toBe("linear");
    expect(categoryOfTool("line")).toBe("linear");
    expect(categoryOfTool("text")).toBe("text");
    expect(categoryOfTool("freedraw")).toBe("freedraw");
  });

  it("returns null for non-drawing tools", () => {
    expect(categoryOfTool("selection")).toBeNull();
    expect(categoryOfTool("hand")).toBeNull();
    expect(categoryOfTool("eraser")).toBeNull();
    expect(categoryOfTool("laser")).toBeNull();
    expect(categoryOfTool("image")).toBeNull();
    expect(categoryOfTool("frame")).toBeNull();
  });
});

describe("CATEGORY_KEYS", () => {
  it("buckets only contended keys", () => {
    for (const keys of Object.values(CATEGORY_KEYS)) {
      for (const key of keys) expect(CONTENDED_KEYS).toContain(key);
    }
  });

  it("never buckets a resident key", () => {
    const resident = [
      "currentItemTextColor",
      "currentItemFontFamily",
      "currentItemFontSize",
      "currentItemTextAlign",
      "currentItemPadding",
      "currentItemArrowType",
      "currentItemStartArrowhead",
      "currentItemEndArrowhead",
      "currentItemStartArrowheadSize",
      "currentItemEndArrowheadSize",
    ];
    for (const key of resident) expect(CONTENDED_KEYS).not.toContain(key);
  });

  it("never buckets roughness — sloppiness is an app-wide preference", () => {
    expect(CONTENDED_KEYS).not.toContain("currentItemRoughness");
  });

  it("contendedOnly keeps contended keys and drops resident ones", () => {
    expect(
      contendedOnly({
        currentItemStrokeColor: "#ff0000",
        currentItemFontSize: 40,
        currentItemEndArrowhead: "dot",
      }),
    ).toEqual({ currentItemStrokeColor: "#ff0000" });
  });

  it("contendedOnly keeps an explicit undefined but drops an absent key", () => {
    const out = contendedOnly({ currentItemCornerRadius: undefined });
    expect("currentItemCornerRadius" in out).toBe(true);
    expect("currentItemStrokeColor" in out).toBe(false);
  });

  it("gives text only opacity, and freedraw only the stroke set", () => {
    expect([...CATEGORY_KEYS.text]).toEqual(["currentItemOpacity"]);
    expect([...CATEGORY_KEYS.freedraw].sort()).toEqual([
      "currentItemOpacity",
      "currentItemStrokeColor",
      "currentItemStrokeStyle",
      "currentItemStrokeWidth",
    ]);
  });
});

describe("snapshotElement", () => {
  it("records a rectangle's stroke, fill and roundness", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 100,
      height: 80,
      strokeColor: "#ff0000",
      backgroundColor: "#00ff00",
      fillStyle: "solid",
      strokeWidth: 4,
      strokeStyle: "dashed",
      opacity: 60,
      roundness: null,
    });
    expect(snap).toMatchObject({
      currentItemStrokeColor: "#ff0000",
      currentItemBackgroundColor: "#00ff00",
      currentItemFillStyle: "solid",
      currentItemStrokeWidth: 4,
      currentItemStrokeStyle: "dashed",
      currentItemOpacity: 60,
      currentItemRoundness: "sharp",
    });
  });

  it("maps a set roundness to \"round\"", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 100,
      height: 80,
      roundness: { type: 3 },
    });
    expect(snap.currentItemRoundness).toBe("round");
  });

  it("records a text element's colour under currentItemTextColor, not stroke", () => {
    const snap = snapshotElement({
      id: "t",
      type: "text",
      strokeColor: "#123456",
      fontFamily: 7,
      fontSize: 40,
      textAlign: "center",
      opacity: 100,
    });
    expect(snap.currentItemTextColor).toBe("#123456");
    expect(snap.currentItemStrokeColor).toBeUndefined();
    expect(snap.currentItemFontFamily).toBe(7);
    expect(snap.currentItemFontSize).toBe(40);
    expect(snap.currentItemTextAlign).toBe("center");
  });

  it("derives arrowType elbow / round / sharp", () => {
    const base = { id: "a", type: "arrow", width: 100, height: 10 };
    expect(snapshotElement({ ...base, elbowed: true }).currentItemArrowType).toBe("elbow");
    expect(
      snapshotElement({ ...base, elbowed: false, roundness: { type: 2 } }).currentItemArrowType,
    ).toBe("round");
    expect(
      snapshotElement({ ...base, elbowed: false, roundness: null }).currentItemArrowType,
    ).toBe("sharp");
  });

  it("records an arrow's arrowheads and their sizes", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
      roundness: null,
      startArrowhead: null,
      endArrowhead: "dot",
      startArrowheadSize: 6,
      endArrowheadSize: 12,
    });
    expect(snap.currentItemStartArrowhead).toBeNull();
    expect(snap.currentItemEndArrowhead).toBe("dot");
    expect(snap.currentItemStartArrowheadSize).toBe(6);
    expect(snap.currentItemEndArrowheadSize).toBe(12);
  });

  it("does not give an arrow a roundness default — arrows derive it from arrowType", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
      roundness: { type: 2 },
    });
    expect(snap.currentItemRoundness).toBeUndefined();
  });

  it("records an explicit cornerRadius on a rectangle", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 200,
      height: 100,
      cornerRadius: 24,
    });
    expect(snap.currentItemCornerRadius).toBe(24);
  });

  it("records the derived cornerRadius when the field is unset", () => {
    // effectiveCornerRadius: an unset rectangle renders the 32px adaptive radius,
    // but only when roundness is set; a square-cornered rectangle reads 0.
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 200,
      height: 100,
      roundness: { type: 3 },
    });
    expect(typeof snap.currentItemCornerRadius).toBe("number");
  });

  it("omits cornerRadius where it has no meaning", () => {
    const ellipse = snapshotElement({ id: "e", type: "ellipse", width: 100, height: 100 });
    expect(ellipse.currentItemCornerRadius).toBeUndefined();

    const plainArrow = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
    });
    expect(plainArrow.currentItemCornerRadius).toBeUndefined();
  });

  it("records cornerRadius for an elbow arrow", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: true,
      cornerRadius: 8,
    });
    expect(snap.currentItemCornerRadius).toBe(8);
  });

  it("never records roughness", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 10,
      height: 10,
      roughness: 2,
    });
    expect(snap.currentItemRoughness).toBeUndefined();
  });

  it("returns nothing for an element with no category", () => {
    expect(snapshotElement({ id: "i", type: "image", strokeColor: "#f00" })).toEqual({});
  });
});

describe("snapshotContainerPadding", () => {
  it("records a container's effective padding", () => {
    expect(snapshotContainerPadding({ id: "r", type: "rectangle", padding: 20 })).toEqual({
      currentItemPadding: 20,
    });
  });

  it("falls back to the vendor default when unset", () => {
    expect(snapshotContainerPadding({ id: "r", type: "ellipse" })).toEqual({
      currentItemPadding: 5,
    });
  });

  it("returns nothing for a non-container", () => {
    expect(snapshotContainerPadding({ id: "a", type: "arrow" })).toEqual({});
  });
});

describe("applicableKeys", () => {
  const keysFor = (toolType: string, category: "shape" | "linear" | "text" | "freedraw", arrowType = "sharp") =>
    applicableKeys({ category, toolType, arrowType });

  it("gives a rectangle every shape key", () => {
    expect([...keysFor("rectangle", "shape")].sort()).toEqual([...CATEGORY_KEYS.shape].sort());
  });

  it("drops cornerRadius for an ellipse", () => {
    expect(keysFor("ellipse", "shape")).not.toContain("currentItemCornerRadius");
    expect(keysFor("ellipse", "shape")).toContain("currentItemRoundness");
  });

  it("drops cornerRadius and roundness for a sharp arrow", () => {
    const keys = keysFor("arrow", "linear", "sharp");
    expect(keys).not.toContain("currentItemCornerRadius");
    expect(keys).not.toContain("currentItemRoundness");
    expect(keys).toContain("currentItemStrokeColor");
  });

  it("keeps cornerRadius for an elbow arrow", () => {
    expect(keysFor("arrow", "linear", "elbow")).toContain("currentItemCornerRadius");
  });

  it("keeps roundness but drops cornerRadius for a line", () => {
    const keys = keysFor("line", "linear");
    expect(keys).toContain("currentItemRoundness");
    expect(keys).not.toContain("currentItemCornerRadius");
  });

  it("drops roundness for freedraw", () => {
    expect(keysFor("freedraw", "freedraw")).not.toContain("currentItemRoundness");
  });

  it("never yields a resident key", () => {
    for (const tool of ["rectangle", "ellipse", "arrow", "line", "freedraw", "text"] as const) {
      const category = categoryOfTool(tool)!;
      for (const key of applicableKeys({ category, toolType: tool, arrowType: "elbow" })) {
        expect(CONTENDED_KEYS).toContain(key);
      }
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/style-memory.test.ts`
Expected: FAIL — `Failed to resolve import "./style-memory"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/style-memory.ts`:

```ts
/**
 * Per-category style memory — the pure layer. Owns the four categories, the
 * element-props → `currentItem*` snapshot mapping, and the filter that decides
 * which remembered keys may be applied to a given creation target.
 *
 * Kept free of Excalidraw imports (mirroring selection-style.ts, corner-radius.ts
 * and padding.ts) so it unit-tests under jsdom; the package barrel pulls runtime
 * that throws there. The stateful store lives in style-memory-store.ts and the
 * React bridge in ui/useStyleMemory.ts; this module stays pure.
 */

import { cornerRadiusApplies, effectiveCornerRadius, type RadiusElement } from "./corner-radius";
import { effectivePadding, type PaddingElement } from "./padding";

/** The four style memories. Anything not covered here has none. */
export type StyleCategory = "shape" | "linear" | "text" | "freedraw";

/** A partial set of Excalidraw `currentItem*` defaults. */
export type StyleBucket = Record<string, unknown>;

/** The minimum a scene element must expose to be snapshotted. */
export interface StyleElement {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** What a load is about to create, enough to filter the bucket down. */
export interface LoadTarget {
  category: StyleCategory;
  /** Excalidraw `activeTool.type`. */
  toolType: string;
  /** Live `currentItemArrowType`; only consulted when `toolType` is "arrow". */
  arrowType: string;
}

const ELEMENT_CATEGORY: Record<string, StyleCategory> = {
  rectangle: "shape",
  diamond: "shape",
  ellipse: "shape",
  arrow: "linear",
  line: "linear",
  text: "text",
  freedraw: "freedraw",
};

/** The category an element's style is remembered under, or null for types with
 *  no meaningful style (image, frame, iframe, embeddable). */
export function categoryOfElement(type: string): StyleCategory | null {
  return ELEMENT_CATEGORY[type] ?? null;
}

/** The category a tool draws into, or null for tools that create nothing we
 *  style (selection, hand, eraser, laser, image, frame). */
export function categoryOfTool(toolType: string): StyleCategory | null {
  return ELEMENT_CATEGORY[toolType] ?? null;
}

const STROKE_KEYS = [
  "currentItemStrokeColor",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemOpacity",
] as const;

const SURFACE_KEYS = [
  ...STROKE_KEYS,
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemRoundness",
  "currentItemCornerRadius",
] as const;

/**
 * The `currentItem*` keys each category buckets. Only **contended** keys appear
 * — ones two or more categories can actually render. A key just one category
 * uses (font size, arrowheads, padding, arrow type) is already correct in
 * Excalidraw's single flat slot because nothing else overwrites it, so bucketing
 * it would be motion without effect. Those stay resident.
 *
 * `shape` and `linear` are both surfaces: a closed line renders its fill, and
 * `newLinearElement` reads `currentItemRoundness` just as rectangles do.
 */
export const CATEGORY_KEYS: Record<StyleCategory, readonly string[]> = {
  shape: SURFACE_KEYS,
  linear: SURFACE_KEYS,
  text: ["currentItemOpacity"],
  freedraw: STROKE_KEYS,
};

/** Every contended key, deduplicated — what the drift watcher folds. */
export const CONTENDED_KEYS: readonly string[] = [
  ...new Set(Object.values(CATEGORY_KEYS).flat()),
];

/** `patch` reduced to the keys a bucket is allowed to hold. Resident keys are
 *  dropped: they live authoritatively in appState, with nothing to swap. */
export function contendedOnly(patch: StyleBucket): StyleBucket {
  const out: StyleBucket = {};
  for (const key of CONTENDED_KEYS) {
    if (key in patch) out[key] = patch[key];
  }
  return out;
}

/** Whether a numeric corner radius means anything for this element. */
const hasRadius = (el: StyleElement) =>
  cornerRadiusApplies(el as unknown as RadiusElement);

const CONTAINER_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

/**
 * The `currentItem*` values an element's style implies. Includes resident keys
 * as well as contended ones: adoption writes the whole snapshot through, so
 * arrowheads and font size must be present even though they are never bucketed.
 *
 * `currentItemRoughness` is deliberately absent — sloppiness is an app-wide flow
 * preference re-asserted at the call site, and shadowing it here would fight App.
 */
export function snapshotElement(el: StyleElement): StyleBucket {
  const category = categoryOfElement(el.type);
  if (!category) return {};

  const snap: StyleBucket = { currentItemOpacity: el.opacity };

  if (category === "text") {
    // Text colour is independent of stroke in the fork; new text reads
    // currentItemTextColor (vendor App.tsx:5314).
    snap.currentItemTextColor = el.strokeColor;
    snap.currentItemFontFamily = el.fontFamily;
    snap.currentItemFontSize = el.fontSize;
    snap.currentItemTextAlign = el.textAlign;
    return snap;
  }

  snap.currentItemStrokeColor = el.strokeColor;
  snap.currentItemStrokeWidth = el.strokeWidth;
  snap.currentItemStrokeStyle = el.strokeStyle;

  if (category === "freedraw") return snap;

  snap.currentItemBackgroundColor = el.backgroundColor;
  snap.currentItemFillStyle = el.fillStyle;

  if (el.type === "arrow") {
    // Arrows derive their curve from arrowType, never from currentItemRoundness
    // (vendor App.tsx:7752), so recording a roundness for them would be a lie.
    snap.currentItemArrowType = el.elbowed ? "elbow" : el.roundness ? "round" : "sharp";
    snap.currentItemStartArrowhead = el.startArrowhead;
    snap.currentItemEndArrowhead = el.endArrowhead;
    snap.currentItemStartArrowheadSize = el.startArrowheadSize;
    snap.currentItemEndArrowheadSize = el.endArrowheadSize;
  } else {
    snap.currentItemRoundness = el.roundness ? "round" : "sharp";
  }

  if (hasRadius(el)) {
    // effectiveCornerRadius resolves an unset field to what is actually drawn.
    snap.currentItemCornerRadius = effectiveCornerRadius(el as unknown as RadiusElement);
  }

  return snap;
}

/**
 * A container's text padding, recorded separately because the field lives on the
 * shape while the setting belongs to text. The bridge folds this into the text
 * adoption when a captioned container is selected.
 */
export function snapshotContainerPadding(el: StyleElement): StyleBucket {
  if (!CONTAINER_TYPES.has(el.type)) return {};
  return { currentItemPadding: effectivePadding(el as unknown as PaddingElement) };
}

/**
 * The bucket keys that may be applied to a creation target. Anything that would
 * be inert or wrong on that target is dropped rather than stamped — an ellipse
 * has no corner radius, a plain arrow has no bends to soften, and an arrow's
 * curve comes from arrowType rather than roundness.
 */
export function applicableKeys(target: LoadTarget): readonly string[] {
  const owned = CATEGORY_KEYS[target.category];
  const drop = new Set<string>();

  if (target.toolType === "arrow") {
    drop.add("currentItemRoundness");
    if (target.arrowType !== "elbow") drop.add("currentItemCornerRadius");
  } else if (target.toolType === "line" || target.toolType === "ellipse") {
    drop.add("currentItemCornerRadius");
  }

  return owned.filter((key) => !drop.has(key));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/lib/style-memory.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean. `currentItemCornerRadius` and `currentItemPadding` are plain strings here, so nothing depends on the Task 5 fork yet.

- [ ] **Step 6: Commit**

```bash
git add src/lib/style-memory.ts src/lib/style-memory.test.ts
git commit -m "feat(style-memory): pure category taxonomy, snapshot and apply filter"
```

---

### Task 2: The session store — `style-memory-store.ts`

**Files:**
- Create: `src/lib/style-memory-store.ts`
- Test: `src/lib/style-memory-store.test.ts`

**Interfaces:**
- Consumes: `StyleCategory`, `StyleBucket`, `LoadTarget`, `CATEGORY_KEYS`, `CONTENDED_KEYS`, `applicableKeys` from Task 1's `src/lib/style-memory.ts`.
- Produces:
  ```ts
  export function adopt(category: StyleCategory, snapshot: StyleBucket): void;
  export function record(categories: readonly StyleCategory[], patch: StyleBucket): void;
  export function resolveLoad(target: LoadTarget): StyleBucket;
  export function getActiveCategory(): StyleCategory;
  export function setActiveCategory(category: StyleCategory): void;
  export function resetStyleMemory(): void;
  ```

**Context:** Module-level singleton, matching the `palette-store` precedent (`.claude/memory/color-swatches.md`). Session-only: no `localStorage`, no entry in `FLOW_GLOBAL_APP_STATE_KEYS`. Because the state is module-level, **every test must call `resetStyleMemory()` in `beforeEach`** or state leaks between tests — the same hazard `useSelectionStyle.test.tsx` handles with `resetDeferred()`.

`adopt` takes a full snapshot including resident keys but stores **only the contended subset** — resident keys are the caller's job to write through to appState. `record` folds a patch into several categories at once, keeping only contended keys.

- [ ] **Step 1: Write the failing test**

Create `src/lib/style-memory-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  adopt,
  record,
  resolveLoad,
  getActiveCategory,
  setActiveCategory,
  resetStyleMemory,
} from "./style-memory-store";

describe("style-memory-store", () => {
  // Module-level singleton: without this, one test's buckets leak into the next.
  beforeEach(() => {
    resetStyleMemory();
  });

  it("starts empty, so a load yields no patch", () => {
    expect(resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" })).toEqual({});
  });

  it("defaults the active category to shape", () => {
    expect(getActiveCategory()).toBe("shape");
  });

  it("adopts a snapshot and replays its contended keys", () => {
    adopt("shape", {
      currentItemStrokeColor: "#ff0000",
      currentItemStrokeWidth: 4,
      currentItemFontSize: 40, // resident — must not be stored
    });

    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect(patch.currentItemStrokeColor).toBe("#ff0000");
    expect(patch.currentItemStrokeWidth).toBe(4);
    expect(patch.currentItemFontSize).toBeUndefined();
  });

  it("makes the adopted category active", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });
    expect(getActiveCategory()).toBe("linear");
  });

  it("keeps the buckets isolated", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#00ff00" });
  });

  it("records one patch into several categories at once", () => {
    record(["shape", "linear"], { currentItemStrokeColor: "#0000ff" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });

  it("merges a later record over an earlier one, key by key", () => {
    adopt("shape", { currentItemStrokeColor: "#ff0000", currentItemStrokeWidth: 4 });
    record(["shape"], { currentItemStrokeColor: "#00ff00" });

    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect(patch.currentItemStrokeColor).toBe("#00ff00");
    expect(patch.currentItemStrokeWidth).toBe(4);
  });

  it("drops resident keys from a record", () => {
    record(["text"], { currentItemFontSize: 40, currentItemOpacity: 50 });

    const patch = resolveLoad({ category: "text", toolType: "text", arrowType: "sharp" });
    expect(patch.currentItemFontSize).toBeUndefined();
    expect(patch.currentItemOpacity).toBe(50);
  });

  it("filters the load by target — an ellipse gets no corner radius", () => {
    adopt("shape", { currentItemCornerRadius: 24, currentItemStrokeColor: "#ff0000" });

    const rect = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    const ellipse = resolveLoad({ category: "shape", toolType: "ellipse", arrowType: "sharp" });
    expect(rect.currentItemCornerRadius).toBe(24);
    expect(ellipse.currentItemCornerRadius).toBeUndefined();
    expect(ellipse.currentItemStrokeColor).toBe("#ff0000");
  });

  it("gives an elbow arrow the remembered radius but a sharp arrow none", () => {
    adopt("linear", { currentItemCornerRadius: 8 });

    expect(
      resolveLoad({ category: "linear", toolType: "arrow", arrowType: "elbow" }),
    ).toMatchObject({ currentItemCornerRadius: 8 });
    expect(
      resolveLoad({ category: "linear", toolType: "arrow", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("lets the active category be set without adopting", () => {
    setActiveCategory("freedraw");
    expect(getActiveCategory()).toBe("freedraw");
  });

  it("resets every bucket and the active category", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });
    resetStyleMemory();

    expect(getActiveCategory()).toBe("shape");
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/lib/style-memory-store.test.ts`
Expected: FAIL — `Failed to resolve import "./style-memory-store"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/style-memory-store.ts`:

```ts
/**
 * The four style buckets, held for the session only.
 *
 * Module-level singleton (same shape as palette-store) so the panels, the tool
 * rail and the onChange bridge all see one memory without prop-drilling through
 * App. Deliberately not persisted: nothing lands in localStorage and nothing is
 * added to FLOW_GLOBAL_APP_STATE_KEYS, so a saved document can neither restore
 * nor clobber it.
 *
 * Buckets hold contended keys only. Resident keys (font size, arrowheads,
 * padding, arrow type) live authoritatively in Excalidraw's appState — nothing
 * contends for them, so there is nothing to swap.
 */

import {
  applicableKeys,
  contendedOnly,
  type LoadTarget,
  type StyleBucket,
  type StyleCategory,
} from "./style-memory";

const emptyBuckets = (): Record<StyleCategory, StyleBucket> => ({
  shape: {},
  linear: {},
  text: {},
  freedraw: {},
});

let buckets = emptyBuckets();
let activeCategory: StyleCategory = "shape";

/**
 * Take on a whole element's style. The caller passes the full snapshot — resident
 * keys included, since it writes those straight to appState — and only the
 * contended subset is stored. Adopting also makes the category active.
 */
export function adopt(category: StyleCategory, snapshot: StyleBucket): void {
  buckets[category] = { ...buckets[category], ...contendedOnly(snapshot) };
  activeCategory = category;
}

/** Fold an edit into each given category's bucket. */
export function record(categories: readonly StyleCategory[], patch: StyleBucket): void {
  const contended = contendedOnly(patch);
  for (const category of categories) {
    buckets[category] = { ...buckets[category], ...contended };
  }
}

/**
 * The appState patch to apply before creating `target`. Only keys actually
 * recorded are returned, so an untouched bucket yields `{}` and Excalidraw's own
 * defaults stand.
 */
export function resolveLoad(target: LoadTarget): StyleBucket {
  const bucket = buckets[target.category];
  const patch: StyleBucket = {};
  for (const key of applicableKeys(target)) {
    if (key in bucket) patch[key] = bucket[key];
  }
  return patch;
}

/** The bucket an edit lands in when nothing is selected. */
export function getActiveCategory(): StyleCategory {
  return activeCategory;
}

export function setActiveCategory(category: StyleCategory): void {
  activeCategory = category;
}

/** Clear every bucket. Exported for tests — the app never resets mid-session. */
export function resetStyleMemory(): void {
  buckets = emptyBuckets();
  activeCategory = "shape";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/lib/style-memory-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/style-memory-store.ts src/lib/style-memory-store.test.ts
git commit -m "feat(style-memory): session-scoped bucket store"
```

---

### Task 3: The onChange bridge — `useStyleMemory`

**Files:**
- Create: `src/ui/useStyleMemory.ts`
- Test: `src/ui/useStyleMemory.test.tsx`

**Interfaces:**
- Consumes: everything Tasks 1 and 2 produce, plus `ExcalidrawAPI` from `src/lib/excalidraw-scene.ts`.
- Produces: `export function useStyleMemory(api: ExcalidrawAPI | null): void` — a side-effect-only hook, no return value.

**Context:** Subscribe with `api.onChange` inside a `useEffect`, exactly as `useSelectionStyle` (`src/ui/panels/useSelectionStyle.ts:71`) and `useActiveTool` (`src/ui/toolbar/useActiveTool.ts:34`) already do, and return the unsubscribe. Unlike those two, this hook renders nothing, so it must **not** call a state setter — no `useReducer` bump. All prior observations live in refs.

The hook writes appState through `api.updateScene`. That triggers `onChange` again, so every write is conditional and the refs are updated **before** writing, making the re-entrant callback a no-op.

Excalidraw's `CaptureUpdateAction` must be imported from `@excalidraw/excalidraw`. The test therefore needs the same `vi.mock` stub `useSelectionStyle.test.tsx` uses — loading the real package under jsdom runs module-level UI code that throws.

- [ ] **Step 1: Write the failing test**

Create `src/ui/useStyleMemory.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// The hook imports CaptureUpdateAction from the Excalidraw package; loading the
// real package in jsdom runs module-level UI code that throws. Stub the one
// export it uses.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY", EVENTUALLY: "EVENTUALLY", NEVER: "NEVER" },
}));

import { useStyleMemory } from "./useStyleMemory";
import { resetStyleMemory, resolveLoad, getActiveCategory } from "../lib/style-memory-store";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

/** A fake canvas whose appState and elements can be driven between onChange fires. */
function makeApi(elements: El[]) {
  const listeners: Array<() => void> = [];
  let depth = 0;
  const appState: Record<string, unknown> = {
    selectedElementIds: {},
    activeTool: { type: "selection" },
    currentItemArrowType: "sharp",
    currentItemStrokeColor: "#1e1e1e",
    currentItemStrokeWidth: 2,
    currentItemStrokeStyle: "solid",
    currentItemBackgroundColor: "transparent",
    currentItemFillStyle: "solid",
    currentItemOpacity: 100,
    currentItemRoundness: "sharp",
  };
  const api = {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: (fn: () => void) => {
      listeners.push(fn);
      return () => listeners.splice(listeners.indexOf(fn), 1);
    },
    // Faithful to the real canvas: a write fires onChange again. That is what
    // exercises the hook's loop guard. The depth cap turns a broken guard into a
    // loud failure instead of a hung test run.
    updateScene: vi.fn((arg: { appState?: Record<string, unknown> }) => {
      Object.assign(appState, arg.appState ?? {});
      depth += 1;
      if (depth > 5) {
        throw new Error("updateScene recursed too deeply — the loop guard is broken");
      }
      try {
        listeners.forEach((fn) => fn());
      } finally {
        depth -= 1;
      }
    }),
  };
  return {
    api: api as unknown as ExcalidrawAPI & { updateScene: ReturnType<typeof vi.fn> },
    appState,
    setElements: (next: El[]) => {
      elements = next;
    },
    /** Mutate appState then fire the canvas's change callback, as Excalidraw would. */
    change: (patch: Record<string, unknown>) => {
      Object.assign(appState, patch);
      listeners.forEach((fn) => fn());
    },
  };
}

const rect = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  width: 100,
  height: 80,
  strokeColor: "#ff0000",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 4,
  strokeStyle: "solid",
  opacity: 100,
  roundness: null,
  ...over,
});

const arrow = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "arrow",
  width: 100,
  height: 10,
  strokeColor: "#0000ff",
  backgroundColor: "transparent",
  fillStyle: "solid",
  strokeWidth: 1,
  strokeStyle: "solid",
  opacity: 100,
  elbowed: false,
  roundness: null,
  ...over,
});

describe("useStyleMemory", () => {
  beforeEach(() => {
    resetStyleMemory();
  });

  it("is inert with a null api", () => {
    expect(() => renderHook(() => useStyleMemory(null))).not.toThrow();
  });

  it("adopts a single newly-selected element into its bucket", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });

    expect(getActiveCategory()).toBe("shape");
    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#ff0000", currentItemStrokeWidth: 4 });
  });

  it("writes the adopted snapshot through to appState", () => {
    const h = makeApi([arrow("a", { endArrowhead: "dot", endArrowheadSize: 12 })]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { a: true } });

    // Resident keys have no other write point — adoption is what carries them.
    expect(h.appState.currentItemEndArrowhead).toBe("dot");
    expect(h.appState.currentItemEndArrowheadSize).toBe(12);
    expect(h.appState.currentItemStrokeColor).toBe("#0000ff");
  });

  it("leaves the buckets alone when several elements are added at once", () => {
    const h = makeApi([rect("r"), rect("s", { strokeColor: "#00ff00" })]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, s: true } });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("adopts on a later single add even after a bulk selection", () => {
    const h = makeApi([rect("r"), rect("s", { strokeColor: "#00ff00" }), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, s: true } });
    h.change({ selectedElementIds: { r: true, s: true, a: true } });

    expect(getActiveCategory()).toBe("linear");
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });

  it("adopts a captioned container into both the shape and text buckets", () => {
    const h = makeApi([
      rect("c", { boundElements: [{ id: "t", type: "text" }], padding: 20 }),
      {
        id: "t",
        type: "text",
        containerId: "c",
        strokeColor: "#123456",
        fontFamily: 7,
        fontSize: 40,
        textAlign: "center",
        opacity: 100,
      },
    ]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { c: true } });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#ff0000" });
    // Text colour, font and the container's padding are resident — written through.
    expect(h.appState.currentItemTextColor).toBe("#123456");
    expect(h.appState.currentItemFontSize).toBe(40);
    expect(h.appState.currentItemPadding).toBe(20);
  });

  it("does not let an arrow's style reach a newly drawn box", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    // Adopt the box, then the arrow. The arrow was selected most recently, so
    // appState now carries its #0000ff / width 1 — only a real bucket swap can
    // put the box's #ff0000 / width 4 back.
    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });
    h.change({ selectedElementIds: {} });
    expect(h.appState.currentItemStrokeColor).toBe("#0000ff");

    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.appState.currentItemStrokeColor).toBe("#ff0000");
    expect(h.appState.currentItemStrokeWidth).toBe(4);
    const load = h.api.updateScene.mock.calls.map((c) => c[0]).pop();
    expect(load.appState.currentItemStrokeColor).toBe("#ff0000");
  });

  it("uses CaptureUpdateAction.NEVER so a defaults swap is not an undo entry", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });
    h.change({ selectedElementIds: {} });
    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.api.updateScene).toHaveBeenCalled();
    for (const [arg] of h.api.updateScene.mock.calls) {
      expect(arg.captureUpdate).toBe("NEVER");
      expect(arg.elements).toBeUndefined();
    }
  });

  it("writes nothing on a tool change whose values already match", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.change({ selectedElementIds: {}, activeTool: { type: "rectangle" } });
    h.api.updateScene.mockClear();

    // Back to selection and out again: the bucket now equals live appState.
    h.change({ activeTool: { type: "selection" } });
    h.change({ activeTool: { type: "rectangle" } });

    expect(h.api.updateScene).not.toHaveBeenCalled();
  });

  it("writes nothing when a non-drawing tool is activated", () => {
    const h = makeApi([rect("r")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });
    h.api.updateScene.mockClear();
    h.change({ activeTool: { type: "hand" } });

    expect(h.api.updateScene).not.toHaveBeenCalled();
  });

  it("folds a currentItem edit into every category in the selection", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true, a: true } });
    h.change({ currentItemStrokeColor: "#abcdef" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#abcdef" });
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#abcdef" });
  });

  it("folds an edit made with an empty selection into the active category", () => {
    const h = makeApi([arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { a: true } }); // active = linear
    h.change({ selectedElementIds: {} });
    h.change({ currentItemStrokeWidth: 9 });

    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeWidth: 9 });
    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("does not fold its own load back into the wrong bucket", () => {
    const h = makeApi([rect("r"), arrow("a")]);
    renderHook(() => useStyleMemory(h.api));

    h.change({ selectedElementIds: { r: true } });   // shape ← #ff0000
    h.change({ selectedElementIds: {} });
    h.change({ selectedElementIds: { a: true } });   // linear ← #0000ff, active = linear
    h.change({ selectedElementIds: {} });
    h.change({ activeTool: { type: "rectangle" } }); // loads shape's #ff0000

    // The load moved currentItemStrokeColor. If that drift were folded into the
    // still-active linear bucket, the arrow's remembered stroke would be lost.
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/ui/useStyleMemory.test.tsx`
Expected: FAIL — `Failed to resolve import "./useStyleMemory"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/useStyleMemory.ts`:

```ts
import { useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";
import {
  CONTENDED_KEYS,
  categoryOfElement,
  categoryOfTool,
  contendedOnly,
  snapshotContainerPadding,
  snapshotElement,
  type StyleBucket,
  type StyleCategory,
  type StyleElement,
} from "../lib/style-memory";
import {
  adopt,
  getActiveCategory,
  record,
  resolveLoad,
  setActiveCategory,
} from "../lib/style-memory-store";

type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];
type SelectedIds = Record<string, boolean | undefined>;

const selectedIdSet = (ids: SelectedIds): Set<string> =>
  new Set(Object.keys(ids).filter((id) => ids[id] === true));

/** The `currentItem*` values currently live on appState, contended keys only. */
function readContended(appState: Record<string, unknown>): StyleBucket {
  const out: StyleBucket = {};
  for (const key of CONTENDED_KEYS) out[key] = appState[key];
  return out;
}

/** Keys of `next` whose value differs from `prev`. */
function changedKeys(prev: StyleBucket, next: StyleBucket): string[] {
  return CONTENDED_KEYS.filter((key) => !Object.is(prev[key], next[key]));
}

/**
 * Per-category style memory, wired to the live canvas.
 *
 * Renders nothing and holds no state — every prior observation lives in a ref,
 * so the hook never re-renders App. Three jobs, all driven off one `onChange`:
 *
 *  - **Adopt on select.** A selection change that adds exactly one element
 *    snapshots that element's style into its bucket and writes the whole
 *    snapshot through to `currentItem*`. Bulk adds (marquee, Ctrl+A) are
 *    deliberately ignored: there is no last-clicked element, and rewriting the
 *    defaults from an arbitrary member of a crowd is worse than doing nothing.
 *  - **Capture edits.** Any other movement in a contended `currentItem*` key is
 *    folded into the buckets of the categories present in the selection, or the
 *    active category when nothing is selected. Watching the destination rather
 *    than the callers catches panel writes, `executeAction` dispatches that
 *    carry their own defaults, and vendor keyboard shortcuts alike.
 *  - **Load on tool change.** Activating a drawing tool swaps that category's
 *    bucket into `currentItem*`, filtered to the keys that render on what is
 *    about to be created.
 *
 * Every write goes through `updateScene`, which fires `onChange` again — so the
 * refs are updated *before* writing and each write is skipped when it would
 * change nothing, leaving the re-entrant callback a no-op.
 */
export function useStyleMemory(api: ExcalidrawAPI | null): void {
  const prevSelected = useRef<Set<string>>(new Set());
  const prevContended = useRef<StyleBucket>({});
  const prevToolKey = useRef<string>("");
  const primed = useRef(false);

  useEffect(() => {
    if (!api) return;

    /**
     * Write a `currentItem*` patch. Keys already holding that value are dropped,
     * and `prevContended` is advanced to the post-write values *before* the write
     * lands — so the `onChange` this provokes sees no drift and folds nothing.
     * Without that ordering the hook would fold its own load into whichever
     * bucket happens to be active, silently corrupting it.
     */
    const applyPatch = (patch: StyleBucket, appState: Record<string, unknown>) => {
      const next: StyleBucket = {};
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (Object.is(appState[key], value)) continue;
        next[key] = value;
      }
      if (Object.keys(next).length === 0) return;

      prevContended.current = { ...prevContended.current, ...contendedOnly(next) };

      api.updateScene({
        appState: next as UpdateAppState,
        // Defaults only, no element touched — never an undo entry.
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    };

    const sync = () => {
      const appState = api.getAppState() as unknown as Record<string, unknown>;
      const elements = api.getSceneElements() as unknown as readonly StyleElement[];

      const selected = selectedIdSet((appState.selectedElementIds ?? {}) as SelectedIds);
      const added = [...selected].filter((id) => !prevSelected.current.has(id));
      prevSelected.current = selected;

      const contended = readContended(appState);
      const drift = changedKeys(prevContended.current, contended);
      prevContended.current = contended;

      const toolType =
        ((appState.activeTool as { type?: string } | undefined)?.type ?? "selection") as string;
      const arrowType = (appState.currentItemArrowType as string) ?? "sharp";
      const toolKey = `${toolType}:${arrowType}`;
      const toolChanged = toolKey !== prevToolKey.current;
      prevToolKey.current = toolKey;

      // The first pass only primes the refs. Without this every contended key
      // reads as drift on mount and the vendor defaults get folded into a bucket.
      if (!primed.current) {
        primed.current = true;
        return;
      }

      // 1. Adopt on select — exactly one element newly added to the selection.
      //    A bulk add (marquee, Ctrl+A) has no last-clicked element and is
      //    deliberately ignored.
      if (added.length === 1) {
        const el = elements.find((e) => e.id === added[0]);
        const category = el ? categoryOfElement(el.type) : null;
        if (el && category) {
          const snapshot = snapshotElement(el);
          adopt(category, snapshot);

          // A captioned container carries text settings too: its bound text
          // feeds the text bucket, and the container's own padding rides along,
          // because padding lives on the shape but belongs to the caption.
          const boundTextId = (
            (el.boundElements ?? []) as readonly { id: string; type: string }[]
          ).find((b) => b.type === "text")?.id;
          const boundText = boundTextId ? elements.find((e) => e.id === boundTextId) : undefined;
          const textSnapshot = boundText
            ? { ...snapshotElement(boundText), ...snapshotContainerPadding(el) }
            : {};
          if (boundText) {
            adopt("text", textSnapshot);
            // Adopting the caption made "text" active; the clicked element wins.
            setActiveCategory(category);
          }

          // Resident keys have no other write point, so the whole snapshot goes
          // through. Contended keys are safe to write too — the next tool change
          // reloads them from the correct bucket regardless.
          applyPatch({ ...snapshot, ...textSnapshot }, appState);
          return;
        }
      }

      // 2. Capture edits. Any contended movement this hook did not cause is a
      //    user edit; fold it into every category the selection contains, or the
      //    active one when nothing is selected.
      if (drift.length > 0) {
        const categories = categoriesInSelection(elements, selected);
        const patch: StyleBucket = {};
        for (const key of drift) patch[key] = contended[key];
        record(categories.length > 0 ? categories : [getActiveCategory()], patch);
      }

      // 3. Load on tool change. The pair (tool, arrowType) is the trigger, not
      //    the tool alone: elbow-ness decides whether cornerRadius applies, so
      //    cycling arrow variants with `A` must re-resolve.
      if (toolChanged) {
        const category = categoryOfTool(toolType);
        if (!category) return;
        setActiveCategory(category);
        applyPatch(resolveLoad({ category, toolType, arrowType }), appState);
      }
    };

    sync();
    return api.onChange(sync);
  }, [api]);
}

/** The categories represented by the currently selected elements. */
function categoriesInSelection(
  elements: readonly StyleElement[],
  selected: Set<string>,
): StyleCategory[] {
  const found = new Set<StyleCategory>();
  for (const el of elements) {
    if (!selected.has(el.id)) continue;
    const category = categoryOfElement(el.type);
    if (category) found.add(category);
  }
  return [...found];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run src/ui/useStyleMemory.test.tsx`
Expected: PASS, all cases green. If `"does not fold its own load back into the wrong bucket"` fails, the ref-before-write ordering described above is wrong — fix the hook, not the test.

- [ ] **Step 5: Run the whole unit suite and typecheck**

Run: `npm test -- --run && npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/ui/useStyleMemory.ts src/ui/useStyleMemory.test.tsx
git commit -m "feat(style-memory): onChange bridge for adopt, capture and load"
```

---

### Task 4: Mount in App, and prove it end to end

**Files:**
- Modify: `src/App.tsx`
- Test: `e2e/style-memory.spec.ts` (create)

**Interfaces:**
- Consumes: `useStyleMemory(api)` from Task 3.
- Produces: nothing new; this task makes the feature live for everything except radius, which needs Task 5's fork edit.

**Context:** `App` already holds the API in `excalidrawApi` state (`src/App.tsx:75`), set from the `excalidrawAPI` callback prop (`:398`). Call the hook at the top level of `App` alongside the other hooks — it takes `excalidrawApi` (the state, not `apiRef`), because it must re-run its effect when the API becomes available.

The e2e helper mirrors `e2e/drawing-defaults.spec.ts`: click a rail tool by accessible name, then drag on the canvas. A freshly drawn shape ends up selected, so the panels show its values. Colour swatches must be pinned exactly as `e2e/color-panel.spec.ts` does, or these tests depend on whatever the shipped default palette happens to contain.

- [ ] **Step 1: Write the failing e2e test**

Create `e2e/style-memory.spec.ts`:

```ts
import { test, expect, type Page } from "@playwright/test";
import { SEED_VERSION } from "../src/lib/color-palettes";

/**
 * Pin the picker's presets before boot. These tests assert on exact colours, so
 * they must not depend on which colours the shipped default palette contains.
 */
async function pinPresets(page: Page) {
  await page.addInitScript((version: string) => {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "e2e", name: "E2E", colors: ["#e03131", "#2f9e44", "#1971c2"] },
      ]),
    );
    localStorage.setItem("flow.defaultPaletteId", "e2e");
    localStorage.setItem("flow.paletteSeedVersion", version);
  }, String(SEED_VERSION));
}

/** Draw with a rail tool; the new element ends up selected. */
async function draw(page: Page, tool: string, x2: number, y2: number) {
  await page
    .getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: tool, exact: true })
    .click();
  await page.mouse.move(560, 340);
  await page.mouse.down();
  await page.mouse.move(x2, y2, { steps: 8 });
  await page.mouse.up();
}

/** Click empty canvas to clear the selection. */
async function deselect(page: Page) {
  await page.getByRole("toolbar", { name: "Tools" })
    .getByRole("button", { name: "Selection", exact: true })
    .click();
  await page.mouse.click(1000, 700);
}

test("a second box inherits the first box's stroke width", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", 760, 480);
  const width = page.getByLabel("Stroke width");
  await width.fill("7");
  await width.blur();
  await expect(width).toHaveValue("7");

  await deselect(page);
  await draw(page, "Rectangle", 900, 620);

  await expect(page.getByLabel("Stroke width")).toHaveValue("7");
});

test("an arrow's stroke width does not reach the next box", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // Give the shape bucket a distinctive width.
  await draw(page, "Rectangle", 760, 480);
  const boxWidth = page.getByLabel("Stroke width");
  await boxWidth.fill("7");
  await boxWidth.blur();

  // Now give the arrow bucket a different one.
  await deselect(page);
  await draw(page, "Arrow", 900, 400);
  const arrowWidth = page.getByLabel("Stroke width");
  await arrowWidth.fill("2");
  await arrowWidth.blur();
  await expect(arrowWidth).toHaveValue("2");

  // A new box must come back at 7, not the arrow's 2.
  await deselect(page);
  await draw(page, "Rectangle", 900, 620);

  await expect(page.getByLabel("Stroke width")).toHaveValue("7");
});

test("selecting an element adopts its style for the next one of that kind", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  // Two boxes with different widths; re-select the first, then draw a third.
  await draw(page, "Rectangle", 700, 450);
  const first = page.getByLabel("Stroke width");
  await first.fill("8");
  await first.blur();

  await deselect(page);
  await draw(page, "Rectangle", 1000, 640);
  const second = page.getByLabel("Stroke width");
  await second.fill("3");
  await second.blur();

  // Click the first box again — adopting it should restore 8 as the default.
  await deselect(page);
  await page.mouse.click(620, 390);
  await expect(page.getByLabel("Stroke width")).toHaveValue("8");

  await deselect(page);
  await draw(page, "Rectangle", 1200, 500);
  await expect(page.getByLabel("Stroke width")).toHaveValue("8");
});

test("a text element's font size does not disturb shape defaults", async ({ page }) => {
  await pinPresets(page);
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", 760, 480);
  const width = page.getByLabel("Stroke width");
  await width.fill("6");
  await width.blur();

  await deselect(page);
  await draw(page, "Rectangle", 900, 620);
  await expect(page.getByLabel("Stroke width")).toHaveValue("6");
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `npx playwright test e2e/style-memory.spec.ts`
Expected: FAIL — the second box comes back at the default stroke width, not the remembered one, because `useStyleMemory` is not mounted yet.

- [ ] **Step 3: Mount the hook in App**

In `src/App.tsx`, add the import beside the other `./ui` imports:

```ts
import { useStyleMemory } from "./ui/useStyleMemory";
```

Then call it inside `App`, at the top level with the other hooks — after `excalidrawApi` is declared (`src/App.tsx:75`) and before the render. Add it directly below the `provider` memo:

```ts
  // Per-category style memory: adopts the last selected/edited element's style
  // and applies it to the next element drawn in that category. Renders nothing.
  useStyleMemory(excalidrawApi);
```

- [ ] **Step 4: Run the e2e test to verify it passes**

Run: `npx playwright test e2e/style-memory.spec.ts`
Expected: PASS, all four tests.

- [ ] **Step 5: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npx playwright test`
Expected: everything green. Pay particular attention to `e2e/drawing-defaults.spec.ts` and `e2e/stroke-panel.spec.ts` — they assert on fresh-element defaults and are the most likely to be disturbed by this feature. If one now fails because a previous test in the same file left a bucket populated, the test is revealing real behaviour: each Playwright test gets a fresh page and therefore a fresh session-only store, so a failure means the store is leaking across pages — fix the implementation.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx e2e/style-memory.spec.ts
git commit -m "feat(style-memory): mount the bridge in App"
```

---

### Task 5: Fork edit — remembered corner radius and padding

**Files:**
- Modify: `vendor/excalidraw/packages/excalidraw/appState.ts`
- Modify: `vendor/excalidraw/packages/excalidraw/components/App.tsx:7856` (`baseElementAttributes`) and `:7740` (`newArrowElement`)
- Test: `e2e/style-memory.spec.ts` (append)

**Interfaces:**
- Consumes: `currentItemCornerRadius` and `currentItemPadding`, already produced by `snapshotElement` / `snapshotContainerPadding` (Task 1) and already carried by the `shape` and `linear` buckets (Task 2). Until this task they are written to appState and read by nobody — inert, harmless, and now made live.
- Produces: two new appState fields that Excalidraw's creation sites honour.

**Context:** `cornerRadius` and `padding` are already flow fork element fields, added in vendor commit `bcfbfff6` ("fork hooks for flow's Transform panel"). Neither has a `currentItem*` counterpart, which is why a radius set on one box is not inherited by the next. This task adds them.

Both stay **optional**. When the bucket has no value the field is left unset and the existing derived default stands — 32px adaptive for rectangles, 16px for elbow arrows, `BOUND_TEXT_PADDING` = 5 for containers. Writing them only at creation is deliberate: per `.claude/memory/flow-optional-prop-undo.md`, a fork-added optional prop can never be undone back to never-set, but a prop born with its element vanishes when undo removes the element.

Read the **Global Constraints** block above before touching the submodule. The build and type-regeneration procedure is exact and is not discoverable from the vendor's own docs.

- [ ] **Step 1: Write the failing e2e test**

Append to `e2e/style-memory.spec.ts`:

```ts
test("a second box inherits the first box's corner radius", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", 760, 480);
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("18");
  await radius.blur();
  await expect(radius).toHaveValue("18");

  await deselect(page);
  await draw(page, "Rectangle", 900, 620);

  await expect(page.getByLabel("Corner radius", { exact: true })).toHaveValue("18");
});

test("an ellipse is never stamped with a remembered corner radius", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  await draw(page, "Rectangle", 760, 480);
  const radius = page.getByLabel("Corner radius", { exact: true });
  await radius.fill("18");
  await radius.blur();

  await deselect(page);
  await draw(page, "Ellipse", 900, 620);

  // The radius control does not apply to ellipses, so it reads back disabled
  // and empty rather than carrying the box's 18.
  await expect(page.getByLabel("Corner radius", { exact: true })).toBeDisabled();
});
```

- [ ] **Step 2: Run the e2e test to verify it fails**

Run: `npx playwright test e2e/style-memory.spec.ts -g "corner radius"`
Expected: the first new test FAILS — the second box reads `0`, because nothing reads `currentItemCornerRadius` yet. The ellipse test should already pass; it guards against a regression introduced by this task.

- [ ] **Step 3: Add the two appState fields**

In `vendor/excalidraw/packages/excalidraw/appState.ts`, add defaults beside the other `currentItem*` entries (the block at `:30-47`):

```ts
    // flow: remembered corner radius / container text padding for new elements.
    // Undefined means "not remembered" — the derived default stands.
    currentItemCornerRadius: undefined,
    currentItemPadding: undefined,
```

And add them to the persistence map beside the other `currentItem*` entries (`:154-178`):

```ts
  currentItemCornerRadius: { browser: true, export: false, server: false },
  currentItemPadding: { browser: true, export: false, server: false },
```

Add the fields to the `AppState` type in `vendor/excalidraw/packages/excalidraw/types.ts`, alongside the other `currentItem*` declarations:

```ts
  /** flow: remembered corner radius for new rectangles/diamonds and elbow
   *  arrows. Undefined leaves the derived default in place. */
  currentItemCornerRadius: number | undefined;
  /** flow: remembered bound-text padding for new shape containers. */
  currentItemPadding: number | undefined;
```

- [ ] **Step 4: Read the two creation sites at the point of the edit**

Run: `sed -n 7850,7885p vendor/excalidraw/packages/excalidraw/components/App.tsx`
Expected: the `baseElementAttributes` object, ending with `roundness: this.getCurrentItemRoundness(elementType)`, then the `newElement({ type: elementType, ...baseElementAttributes })` branch.

Run: `sed -n 7738,7770p vendor/excalidraw/packages/excalidraw/components/App.tsx`
Expected: the `newArrowElement({ ... })` call, including `elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow`.

Line numbers drift as the fork moves; locate the code by these landmarks rather than trusting the numbers.

- [ ] **Step 5: Apply the remembered values at creation**

In `createGenericElementOnPointerDown`, extend `baseElementAttributes`. `getCurrentItemRoundness(elementType)` already does per-type gating there; mirror it:

```ts
      roundness: this.getCurrentItemRoundness(elementType),
      // flow: a remembered corner radius applies to rectangles and diamonds
      // only — an ellipse has no corners to round. Padding applies to any shape
      // container, since it may later be given bound text. Both stay optional:
      // undefined leaves the element's derived default in place.
      cornerRadius:
        elementType === "rectangle" || elementType === "diamond"
          ? this.state.currentItemCornerRadius
          : undefined,
      padding: this.state.currentItemPadding,
```

In the `newArrowElement` call, add `cornerRadius` beside `elbowed`, gated the same way `elbowed` and `fixedSegments` already are:

```ts
              elbowed: this.state.currentItemArrowType === ARROW_TYPE.elbow,
              // flow: only an elbow arrow has bends to soften.
              cornerRadius:
                this.state.currentItemArrowType === ARROW_TYPE.elbow
                  ? this.state.currentItemCornerRadius
                  : undefined,
```

- [ ] **Step 6: Rebuild the vendor package and regenerate types**

```bash
cd vendor/excalidraw/packages/excalidraw
node ../../scripts/buildPackage.js
node_modules/.bin/tsc -p tsconfig.json
cd -
```

Expected: the build succeeds. `tsc` prints pre-existing upstream type errors (cornerRadius/Point noise) — those are unrelated to this edit and are expected. What matters is that `dist/types` is regenerated; without it flow's own `tsc` cannot resolve `@excalidraw/excalidraw`.

- [ ] **Step 7: Run the e2e test to verify it passes**

Run: `npx playwright test e2e/style-memory.spec.ts`
Expected: PASS, all six tests including both radius cases.

- [ ] **Step 8: Run the full suite**

Run: `npm test -- --run && npm run typecheck && npx playwright test`
Expected: everything green. `e2e/drawing-defaults.spec.ts` asserts a fresh rectangle has a `0` corner radius — that must still hold, because an empty bucket writes no `currentItemCornerRadius` at all.

- [ ] **Step 9: Commit the submodule, then the parent**

The fork edit is only durable if both land — `dist/` is gitignored, so the parent repo tracks the submodule by gitlink.

```bash
cd vendor/excalidraw
git checkout flow
git add packages/excalidraw/appState.ts packages/excalidraw/types.ts packages/excalidraw/components/App.tsx
git commit -m "feat(fork): currentItemCornerRadius and currentItemPadding for new elements"
cd -
git add vendor/excalidraw e2e/style-memory.spec.ts
git commit -m "feat(style-memory): inherit corner radius and container padding"
```

---

### Task 6: Record the work in project memory

**Files:**
- Create: `.claude/memory/style-memory.md`
- Modify: `.claude/memory/MEMORY.md`

**Interfaces:**
- Consumes: the shipped behaviour from Tasks 1–5.
- Produces: nothing code-facing.

**Context:** `CLAUDE.md` requires substantial sessions to leave a repo-local memory plus a one-line pointer in the index. Keep it to what is not derivable from the code or git history: the design rules a future reader would otherwise have to re-derive, and the traps.

- [ ] **Step 1: Write the memory file**

Create `.claude/memory/style-memory.md`:

```markdown
# Per-category style memory

Shipped 2026-08-06. Spec: `docs/superpowers/specs/2026-08-06-style-memory-design.md`.
Plan: `docs/superpowers/plans/2026-08-06-style-memory.md`.

Four session-scoped buckets — shape, linear, text, freedraw — remember the last
selected or edited element's style and apply it to the next element drawn in
that category. `src/lib/style-memory.ts` (pure), `src/lib/style-memory-store.ts`
(singleton), `src/ui/useStyleMemory.ts` (onChange bridge, mounted in App).

## The rules that are not obvious from the code

- **Only contended keys are bucketed.** A `currentItem*` key two or more
  categories can render (stroke colour/width/style, opacity, background, fill,
  roundness, cornerRadius) needs a bucket. Everything else — font size,
  arrowheads, padding, arrowType, textColor — is *resident*: vendor's single
  slot is already correct because nothing else writes it. Adoption still writes
  resident keys through; the swap never touches them.
- **Adopt-on-select fires only for a single-element add.** Marquee and Ctrl+A
  deliberately change nothing — there is no last-clicked element.
- **Edits are captured by watching `currentItem*` drift**, not by instrumenting
  the callers. That is what catches `executeAction` dispatches (TextPanel's font
  family) and vendor keyboard shortcuts, and why `useSelectionStyle` needed no
  change at all.
- **Arrows never take `currentItemRoundness`** — they derive their curve from
  `currentItemArrowType` (vendor `App.tsx`, `newArrowElement`). Lines *do* read
  it. `applicableKeys` encodes this; getting it backwards silently squares off
  curved arrows.
- **The load uses `CaptureUpdateAction.NEVER`.** It changes defaults only. Using
  IMMEDIATELY here puts a phantom entry on the undo stack for every tool click.

## Traps

- The bridge writes via `updateScene`, which re-fires `onChange`. The refs must
  be updated *before* the write or the hook folds its own load back into the
  wrong bucket. `useStyleMemory.test.tsx` pins this with
  `"does not fold its own load back into the wrong bucket"` — do not weaken it.
- `style-memory-store.ts` is a module singleton, so every test needs
  `resetStyleMemory()` in `beforeEach` (same hazard as `resetDeferred`).
- `currentItemRoughness` is deliberately excluded. Sloppiness is an app-wide
  preference re-asserted at the call site; see [[flow-sloppiness-global]].

## Known gap

Double-click-to-text and Enter-on-a-container create text without a tool change,
so they miss the load. Only `currentItemOpacity` is affected — every other text
key is resident. In practice flow folds alpha into an 8-digit colour hex rather
than moving element opacity, so no flow control writes `currentItemOpacity`
today.

## Fork edit

`currentItemCornerRadius` and `currentItemPadding` added to vendor `appState.ts`
+ `types.ts`, read at `baseElementAttributes` in
`createGenericElementOnPointerDown` and at `newArrowElement`. Extends the
`bcfbfff6` fork commit that already owns the `cornerRadius`/`padding` element
fields. See [[arrowhead-size]] for the same pattern and [[selection-mode]] for
the vendor rebuild procedure.
```

- [ ] **Step 2: Add the index pointer**

Append one line to `.claude/memory/MEMORY.md`, matching the existing format:

```markdown
- [Style memory](style-memory.md) — four session-scoped per-category style buckets (shape/linear/text/freedraw); adopt-on-select + currentItem* drift capture + load-on-tool-change; only contended keys are bucketed; fork adds currentItemCornerRadius/Padding; shipped 2026-08-06
```

- [ ] **Step 3: Commit**

```bash
git add .claude/memory/style-memory.md .claude/memory/MEMORY.md
git commit -m "docs(memory): record the per-category style memory work"
```
