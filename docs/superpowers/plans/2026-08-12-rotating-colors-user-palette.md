# Rotating colors → user palette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn flow's six-slot "recent colors" cache into a real, editable, auto-updating **Recent** palette that only the rail popup's picker appends to, and only when it closes.

**Architecture:** The rotating list and the user palette become **one array** — a `ColorPalette` with a fixed id living in `flow.colorPalettes`. `palette-store.ts` gains an ensure-exists step and a `recordUsedColor` mutation; `RailColorControl` captures the last color its popup session wrote and flushes it on close or unmount; the popup's strip becomes a view of the palette's first six entries. The parallel `flow.recentColors` store, `recordRecent`, and `recent-colors.ts` are retired.

**Tech Stack:** TypeScript, React 19, `useSyncExternalStore` module-singleton stores, Vitest + React Testing Library, Playwright.

Spec: [`docs/superpowers/specs/2026-08-12-rotating-colors-user-palette-design.md`](../specs/2026-08-12-rotating-colors-user-palette-design.md)

## Global Constraints

- **Zero fork edits.** Nothing in this plan touches `vendor/excalidraw`. No `npm run build:excalidraw` is needed at any point.
- **No new runtime dependency.**
- **`RECENT_PALETTE_ID = "flow-recent"`**, `RECENT_PALETTE_NAME = "Recent"`, `RECENT_PALETTE_LIMIT = 20`, `RECENT_STRIP_SLOTS = 6`. Exact values, exact names.
- **Do NOT add the Recent palette to `BUILTIN_PALETTE_NAMES`** and **do NOT bump `SEED_VERSION`.** `migrateBuiltins` overwrites every palette named in that list from its seed colors — registering Recent there would wipe the user's history on the next bump. It must stay classified as user-made.
- **`aria-disabled`, never `disabled`,** on any inert control inside `PaletteSection`. Chrome delivers no mouse events at all to a disabled form control, and this grid's drop targets run on mouse events. jsdom does not model this, so only e2e can catch a regression.
- **`??` never `||`** anywhere a numeric zero could be coerced (`strokeWidth`). Not touched by this plan, but the surrounding code depends on it.
- Store-backed vitest files need the `mockLocalStorage` + `vi.stubGlobal("localStorage", …)` shim — jsdom's native `localStorage` is non-functional in this project's vitest setup. Copy the block verbatim from `src/lib/palette-store.test.ts:8-32`.
- Every task ends green on `npx vitest run` and `npm run typecheck`.
- Before any e2e run: `pkill -f vite`. Stray dev servers from an earlier run make e2e results untrustworthy.

## Baseline

Record these before starting so a regression is visible:

```bash
npx vitest run 2>&1 | tail -5
npm run typecheck
```

The e2e suite's known-healthy state is **130 passed / 2 failed**. The two failures are `e2e/text-panel.spec.ts:201` and `:225` (container padding) — deterministic, reproduce on `main`, out of scope. A third name in the failure list is the documented parallel-load flake (`new-document.spec.ts:60`, `style-memory.spec.ts`, `selection-mode.spec.ts:57`); re-run that spec alone before investigating.

## File Structure

**Modified:**
- `src/lib/color-palettes.ts` — three new exported constants beside the existing palette constants. No logic.
- `src/lib/palette-store.ts` — ensure-exists in `load()`, `recordUsedColor` mutation, `getRecentPaletteColors`/`useRecentPaletteColors` read pair, `removePalette` guard.
- `src/app/preferences.ts` — absorbs `normalizeRecents` as a private helper; `setRecentColors` deleted, `getRecentColors` kept as the migration's only reader.
- `src/lib/color-store.ts` — loses `recents` and `recordRecent`; keeps `activePart` and `numericMode`.
- `src/ui/toolbar/RailColorControl.tsx` — owns capture: wrapped target, `lastHex` ref, flush on close and on unmount.
- `src/ui/toolbar/ColorPopup.tsx` — strip reads the Recent palette; owns `RECENT_STRIP_SLOTS`.
- `src/ui/color/useColorTarget.ts` — `recordRecent` call removed, then `setColor`/`adjustColor` collapse into one `setColor`.
- `src/ui/color/PaletteSection.tsx` — delete-palette inert for the Recent palette.
- `src/ui/panels/ColorPanel.tsx` — call-site updates for the collapse.

**Deleted:**
- `src/lib/recent-colors.ts` and `src/lib/recent-colors.test.ts`.

**Test files created/modified:** `src/lib/palette-store.test.ts`, `src/lib/color-store.test.ts`, `src/ui/toolbar/RailColorControl.test.tsx`, `src/ui/color/PaletteSection.test.tsx`, `src/ui/color/useColorTarget.test.tsx`, `e2e/color-panel.spec.ts`.

---

### Task 1: The Recent palette exists

Create the palette and guarantee it survives every load path, seeding it once from the legacy key.

**Files:**
- Modify: `src/lib/color-palettes.ts` (append constants after `SEED_VERSION`, ~line 26)
- Modify: `src/lib/palette-store.ts:36-47` (`load`), plus a new `ensureRecentPalette`
- Test: `src/lib/palette-store.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `RECENT_PALETTE_ID: string`, `RECENT_PALETTE_NAME: string`, `RECENT_PALETTE_LIMIT: number` from `src/lib/color-palettes.ts`. After this task, `store.getSnapshot().palettes` always contains an entry whose `id === RECENT_PALETTE_ID`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/palette-store.test.ts`. The file's existing `beforeEach` (`localStorage.clear()` + `store.reloadPaletteStore()`) already gives each test a fresh seed.

```ts
import {
  RECENT_PALETTE_ID,
  RECENT_PALETTE_NAME,
  RECENT_PALETTE_LIMIT,
} from "./color-palettes";

describe("the Recent palette", () => {
  const recent = () => store.getSnapshot().palettes.find((p) => p.id === RECENT_PALETTE_ID);

  it("exists after a fresh seed", () => {
    expect(recent()).toBeDefined();
    expect(recent()!.name).toBe(RECENT_PALETTE_NAME);
    expect(recent()!.colors).toEqual([]);
  });

  it("is not the default palette", () => {
    expect(store.getSnapshot().defaultPaletteId).not.toBe(RECENT_PALETTE_ID);
  });

  it("is appended to stored palettes that predate it", () => {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([{ id: "p1", name: "Mine", colors: ["#112233"] }]),
    );
    localStorage.setItem("flow.defaultPaletteId", "p1");
    localStorage.setItem("flow.paletteSeedVersion", String(SEED_VERSION));
    store.reloadPaletteStore();

    const palettes = store.getSnapshot().palettes;
    expect(palettes.map((p) => p.id)).toEqual(["p1", RECENT_PALETTE_ID]);
    expect(store.getSnapshot().defaultPaletteId).toBe("p1");
  });

  it("seeds from the legacy flow.recentColors key on creation", () => {
    localStorage.setItem("flow.recentColors", JSON.stringify(["#ff0000", "#00ff00"]));
    store.reloadPaletteStore();
    expect(recent()!.colors).toEqual(["#ff0000", "#00ff00"]);
  });

  it("does NOT re-seed from the legacy key once the palette exists", () => {
    // The migration is a one-shot on creation. A stale legacy key must never
    // resurrect colors the user has since deleted from the palette.
    localStorage.setItem("flow.recentColors", JSON.stringify(["#ff0000"]));
    store.reloadPaletteStore();
    store.removeSwatches(RECENT_PALETTE_ID, [0]);
    expect(recent()!.colors).toEqual([]);

    store.reloadPaletteStore();
    expect(recent()!.colors).toEqual([]);
  });

  it("survives a builtin migration with its colors intact", () => {
    // migrateBuiltins runs when the stored seed version is behind. It must
    // classify Recent as user-made and carry it through untouched — if Recent
    // were ever added to BUILTIN_PALETTE_NAMES this test goes red.
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "p1", name: "Mine", colors: ["#112233"] },
        { id: RECENT_PALETTE_ID, name: "Recent", colors: ["#abcdef"] },
      ]),
    );
    localStorage.setItem("flow.paletteSeedVersion", "0");
    store.reloadPaletteStore();

    expect(recent()!.colors).toEqual(["#abcdef"]);
    expect(store.getSnapshot().palettes.filter((p) => p.id === RECENT_PALETTE_ID)).toHaveLength(1);
  });

  it("persists itself so the next load does not re-create it", () => {
    const stored = JSON.parse(localStorage.getItem("flow.colorPalettes")!);
    expect(stored.some((p: { id: string }) => p.id === RECENT_PALETTE_ID)).toBe(true);
  });

  it("caps the legacy seed at the palette limit", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      `#${i.toString(16).padStart(2, "0")}0000`,
    );
    localStorage.setItem("flow.recentColors", JSON.stringify(many));
    store.reloadPaletteStore();
    expect(recent()!.colors.length).toBeLessThanOrEqual(RECENT_PALETTE_LIMIT);
  });
});
```

Add `SEED_VERSION` to the `./color-palettes` import if the file does not already import it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: FAIL — `RECENT_PALETTE_ID` is not exported from `./color-palettes`.

- [ ] **Step 3: Add the constants**

In `src/lib/color-palettes.ts`, directly after the `SEED_VERSION` declaration:

```ts
/**
 * The auto-maintained palette the rail popup appends to. Its id is **fixed**,
 * not generated, because it is the only stable handle code has on it — the
 * user can rename the palette like any other, and matching by name (the way
 * builtins are matched) would lose it the moment they did.
 *
 * Deliberately NOT in `BUILTIN_PALETTE_NAMES`: `migrateBuiltins` refreshes
 * everything in that list *in place from its seed colors*, which would erase
 * the user's accumulated history on the next `SEED_VERSION` bump. Staying out
 * of the list is what makes it get carried through as user-made instead.
 */
export const RECENT_PALETTE_ID = "flow-recent";

/** Its name on creation; the user may rename it, the id is the handle. */
export const RECENT_PALETTE_NAME = "Recent";

/**
 * How many colors it holds. Matches the builtins' 20 so it reads as a peer in
 * the dropdown rather than a stub. Eviction is from the **tail**, so a
 * hand-added swatch (which `addSwatch` appends) is the first to go once full.
 */
export const RECENT_PALETTE_LIMIT = 20;
```

- [ ] **Step 4: Add ensure-exists to the store**

In `src/lib/palette-store.ts`, extend the `./color-palettes` import with `RECENT_PALETTE_ID`, `RECENT_PALETTE_NAME`, `RECENT_PALETTE_LIMIT`, and the `../app/preferences` import with `getRecentColors`.

Add above `load()`:

```ts
/**
 * Guarantee the Recent palette exists, on every load path.
 *
 * This is why the feature needs no `SEED_VERSION` bump: existence is asserted
 * on load rather than seeded once, so an install at any seed version picks it
 * up on its next boot.
 *
 * The legacy `flow.recentColors` key is read **only** on the run that creates
 * the palette. Reading it again later would resurrect colors the user has
 * since deleted, since nothing clears that key.
 */
function ensureRecentPalette(current: PaletteState): PaletteState {
  if (current.palettes.some((p) => p.id === RECENT_PALETTE_ID)) return current;
  const recent: ColorPalette = {
    id: RECENT_PALETTE_ID,
    name: RECENT_PALETTE_NAME,
    colors: getRecentColors().slice(0, RECENT_PALETTE_LIMIT),
  };
  // Appended last, and never made the default — Pastel keeps that job.
  return persist({ ...current, palettes: [...current.palettes, recent] });
}
```

Then wrap all three `load()` return paths:

```ts
function load(): PaletteState {
  const palettes = getColorPalettes();
  if (palettes.length === 0) return ensureRecentPalette(seedFresh());
  if (getPaletteSeedVersion() < SEED_VERSION) {
    return ensureRecentPalette(migrateBuiltins(palettes));
  }

  let defaultPaletteId = getDefaultPaletteId() ?? "";
  if (!palettes.some((p) => p.id === defaultPaletteId)) {
    defaultPaletteId = palettes[0].id;
    setDefaultPaletteId(defaultPaletteId);
  }
  return ensureRecentPalette({ palettes, defaultPaletteId });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 6: Run the full unit suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green. Existing tests that assert a palette *count* will need updating to account for the new entry — fix them by adding one, not by weakening the assertion.

- [ ] **Step 7: Commit**

```bash
git add src/lib/color-palettes.ts src/lib/palette-store.ts src/lib/palette-store.test.ts
git commit -m "feat(color): add the auto-maintained Recent palette"
```

---

### Task 2: `recordUsedColor` and the read pair

The single write path into the list, and a stable-reference reader for the popup strip.

**Files:**
- Modify: `src/lib/palette-store.ts`
- Test: `src/lib/palette-store.test.ts`

**Interfaces:**
- Consumes: `RECENT_PALETTE_ID`, `RECENT_PALETTE_LIMIT` (Task 1).
- Produces:
  - `recordUsedColor(color: string): void`
  - `getRecentPaletteColors(): string[]` — stable reference between commits
  - `useRecentPaletteColors(): string[]`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/palette-store.test.ts`:

```ts
describe("recordUsedColor", () => {
  const colors = () =>
    store.getSnapshot().palettes.find((p) => p.id === RECENT_PALETTE_ID)!.colors;

  it("unshifts a new color", () => {
    store.recordUsedColor("#ff0000");
    store.recordUsedColor("#00ff00");
    expect(colors()).toEqual(["#00ff00", "#ff0000"]);
  });

  it("is a complete no-op for a color already present — no reorder", () => {
    // Deliberately NOT move-to-front. The list is a grid the user looks at and
    // curates by hand; re-using a color must not reshuffle their layout.
    store.recordUsedColor("#ff0000");
    store.recordUsedColor("#00ff00");
    store.recordUsedColor("#ff0000");
    expect(colors()).toEqual(["#00ff00", "#ff0000"]);
  });

  it("does not notify subscribers on a no-op", () => {
    store.recordUsedColor("#ff0000");
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.recordUsedColor("#ff0000");
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it("normalizes forgiving input the way swatches do", () => {
    store.recordUsedColor("ABC");
    expect(colors()).toEqual(["#aabbcc"]);
  });

  it("strips an alpha byte rather than storing a near-duplicate", () => {
    store.recordUsedColor("#ff000080");
    store.recordUsedColor("#ff0000");
    expect(colors()).toEqual(["#ff0000"]);
  });

  it("rejects transparent and other non-hex input", () => {
    store.recordUsedColor("transparent");
    store.recordUsedColor("");
    expect(colors()).toEqual([]);
  });

  it("evicts from the tail at the limit", () => {
    for (let i = 0; i < RECENT_PALETTE_LIMIT; i++) {
      store.recordUsedColor(`#${i.toString(16).padStart(2, "0")}0000`);
    }
    const oldest = colors()[RECENT_PALETTE_LIMIT - 1];
    store.recordUsedColor("#ffffff");
    expect(colors()).toHaveLength(RECENT_PALETTE_LIMIT);
    expect(colors()[0]).toBe("#ffffff");
    expect(colors()).not.toContain(oldest);
  });

  it("persists across a reload", () => {
    store.recordUsedColor("#123456");
    store.reloadPaletteStore();
    expect(colors()).toContain("#123456");
  });
});

describe("getRecentPaletteColors", () => {
  it("returns a stable reference between commits", () => {
    // useSyncExternalStore re-renders forever if the snapshot getter returns a
    // fresh array each call — the same contract getDefaultPaletteColors keeps.
    expect(store.getRecentPaletteColors()).toBe(store.getRecentPaletteColors());
  });

  it("returns a new reference after a commit", () => {
    const before = store.getRecentPaletteColors();
    store.recordUsedColor("#123456");
    expect(store.getRecentPaletteColors()).not.toBe(before);
    expect(store.getRecentPaletteColors()).toEqual(["#123456"]);
  });

  it("tracks the palette even after the user renames it", () => {
    store.renamePalette(RECENT_PALETTE_ID, "My colors");
    store.recordUsedColor("#123456");
    expect(store.getRecentPaletteColors()).toEqual(["#123456"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: FAIL — `store.recordUsedColor is not a function`.

- [ ] **Step 3: Implement**

In `src/lib/palette-store.ts`, add a module-level cache beside `colorsCache`:

```ts
let recentCache: { forState: PaletteState; value: string[] } | null = null;

/** Stable empty result, so an absent palette doesn't hand out a fresh []. */
const NO_COLORS: string[] = [];
```

Clear it wherever `colorsCache` is cleared — in `commit()` and in `reloadPaletteStore()`:

```ts
  colorsCache = null;
  recentCache = null;
```

Add to the read API, next to `getDefaultPaletteColors`:

```ts
/** The Recent palette's colors. Same stable-reference contract as
 *  `getDefaultPaletteColors` — a fresh array per call loops React forever. */
export function getRecentPaletteColors(): string[] {
  if (recentCache && recentCache.forState === state) return recentCache.value;
  const p = state.palettes.find((x) => x.id === RECENT_PALETTE_ID);
  const value = p ? p.colors : NO_COLORS;
  recentCache = { forState: state, value };
  return value;
}

export function useRecentPaletteColors(): string[] {
  return useSyncExternalStore(subscribe, getRecentPaletteColors, getRecentPaletteColors);
}
```

Add to the mutations:

```ts
/**
 * Record a color the user settled on. The **only** automatic route into the
 * Recent palette — called once per rail-popup session, when it closes.
 *
 * A color already in the list is a complete no-op, not a move-to-front: this
 * palette is a grid the user looks at and curates by hand, and re-using a
 * color must not reshuffle it under them.
 */
export function recordUsedColor(color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  const palette = state.palettes.find((p) => p.id === RECENT_PALETTE_ID);
  if (!palette || palette.colors.includes(hex)) return;
  commit({
    ...state,
    palettes: mapPalette(RECENT_PALETTE_ID, (p) => ({
      ...p,
      colors: [hex, ...p.colors].slice(0, RECENT_PALETTE_LIMIT),
    })),
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/palette-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/palette-store.ts src/lib/palette-store.test.ts
git commit -m "feat(color): recordUsedColor and the Recent palette read pair"
```

---

### Task 3: Capture on popup close, strip reads the palette

The behavioral switchover. After this task the feature works end to end.

**Files:**
- Modify: `src/ui/toolbar/RailColorControl.tsx`
- Modify: `src/ui/toolbar/ColorPopup.tsx:9,29,96,130-143`
- Test: `src/ui/toolbar/RailColorControl.test.tsx`

**Interfaces:**
- Consumes: `recordUsedColor`, `useRecentPaletteColors` (Task 2).
- Produces: `RECENT_STRIP_SLOTS = 6` exported from `src/ui/toolbar/ColorPopup.tsx`. No other module depends on this task's internals.

**Why one task and not two:** the strip's data source and the write path have to move together. Pointing the strip at the palette while `recordRecent` still feeds the old store would leave the strip frozen; recording to the palette while the strip still reads the old store would make the feature invisible. Splitting them produces a broken intermediate commit.

- [ ] **Step 1: Write the failing tests**

In `src/ui/toolbar/RailColorControl.test.tsx`, replace the `reloadColorStore, recordRecent` import from `../../lib/color-store` with:

```ts
import { reloadColorStore } from "../../lib/color-store";
import {
  recordUsedColor,
  reloadPaletteStore,
  getRecentPaletteColors,
} from "../../lib/palette-store";
```

Add `reloadPaletteStore()` to the existing `beforeEach`, after `reloadColorStore()`.

Rewrite the existing `"fills slots from the store and applies one on click"` test to source its color from the palette:

```ts
  it("fills slots from the Recent palette and applies one on click", () => {
    recordUsedColor("#00ff00");
    const sel = fakeSel();
    render(<RailColorControl sel={sel} />);
    fireEvent.click(screen.getByRole("radio", { name: /fill/i }));
    fireEvent.click(screen.getByRole("button", { name: "Recent color #00ff00" }));
    // Asserting only `toHaveBeenCalled()` would pass even if the wrong recent
    // (or a hardcoded color) were applied — check the actual payload.
    expect(sel.update).toHaveBeenCalledTimes(1);
    const [, updater, currentItems] = vi.mocked(sel.update).mock.calls[0];
    expect(currentItems).toEqual({ currentItemBackgroundColor: "#00ff00" });
    expect(updater(rect as never)).toEqual({ backgroundColor: "#00ff00" });
  });
```

Then append a new describe block:

```ts
describe("recording the popup session's color", () => {
  /**
   * A selection whose fill is **saturated**.
   *
   * This matters more than it looks. The shared `rect` fixture's fill is
   * `#eeeeee`, which has s=0 — and a hue change on an achromatic color yields
   * the identical hex every time. Every write in a session would then be the
   * same color, `recordUsedColor` would dedupe them, and the "exactly one
   * color per session" test below would pass even against a broken
   * record-on-every-write implementation. A saturated fill makes each hue step
   * a genuinely distinct hex, so that test can actually fail.
   */
  const satSel = () =>
    fakeSel({
      elements: [{ ...rect, backgroundColor: "#ff0000" }] as unknown as SelectionStyle["elements"],
    });

  /**
   * Nudge the hue by N arrow presses. `HueSlider` handles arrows only — it has
   * no Home/End (see `slider-keys.ts`), so there is no jump-to-a-known-value
   * shortcut. Each press is one write through the draft.
   *
   * `sel.update` is a mock, so the element never actually changes and the
   * draft's prop stays `#ff0000` across renders. That is fine and intended:
   * `useColorDraft` holds the live HSV itself and only re-seeds on a genuine
   * outside change, so successive presses accumulate rather than snapping back.
   */
  const nudgeHue = (steps: number) => {
    const slider = screen.getByRole("slider", { name: /hue/i });
    for (let i = 0; i < steps; i++) fireEvent.keyDown(slider, { key: "ArrowRight" });
  };

  const openPopup = () => fireEvent.click(screen.getByRole("radio", { name: /fill/i }));

  it("records nothing when the popup is opened and closed untouched", () => {
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toEqual([]);
  });

  it("records nothing while the popup is still open", () => {
    // The whole point of the deferral: a color joins the list when the session
    // ends, not while the user is still hunting for it.
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(30);
    expect(getRecentPaletteColors()).toEqual([]);
  });

  it("records the color on close", () => {
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(30);
    fireEvent.click(screen.getByRole("button", { name: /close color picker/i }));
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("records exactly one color for a session of many distinct writes", () => {
    // 60 arrow presses, 60 distinct hexes, one entry.
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(60);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("records the LAST color the session wrote, not an earlier one", () => {
    // Seed an entry, then end the session ON it: hue-drag first (distinct
    // hexes that must NOT be recorded), then click the seeded slot last. If
    // any write but the last were recorded, the palette would grow.
    recordUsedColor("#0000ff");
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(40);
    fireEvent.click(screen.getByRole("button", { name: "Recent color #0000ff" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toEqual(["#0000ff"]);
  });

  it("records the hue color when the drag is what comes last", () => {
    // The mirror of the test above, so neither can pass by ordering accident.
    recordUsedColor("#0000ff");
    render(<RailColorControl sel={satSel()} />);
    openPopup();
    fireEvent.click(screen.getByRole("button", { name: "Recent color #0000ff" }));
    nudgeHue(40);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(getRecentPaletteColors()).toHaveLength(2);
    expect(getRecentPaletteColors()[1]).toBe("#0000ff");
  });

  it("records on an unmount while the popup is still open", () => {
    // Not the Escape/outside-click path. View ▸ Show Toolbar makes ToolBar
    // return null, unmounting this component with the popup open — the same
    // hazard cancelEyeDropper guards in this file. A session's color must not
    // be lost to it.
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(45);
    unmount();
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("does not record twice when a close is followed by an unmount", () => {
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    openPopup();
    nudgeHue(45);
    fireEvent.keyDown(window, { key: "Escape" });
    const after = getRecentPaletteColors();
    expect(after).toHaveLength(1);
    unmount();
    expect(getRecentPaletteColors()).toEqual(after);
  });

  it("records when the active box is clicked a second time to close", () => {
    // The active box toggles `open` directly and never reaches `closePopup` —
    // the most common way of closing the popup, and the one a flush wired only
    // into `closePopup` would silently miss.
    render(<RailColorControl sel={satSel()} />);
    const box = screen.getByRole("radio", { name: /fill/i });
    fireEvent.click(box);
    nudgeHue(30);
    fireEvent.pointerDown(box);
    fireEvent.click(box);
    expect(screen.queryByRole("dialog", { name: /color picker/i })).not.toBeInTheDocument();
    expect(getRecentPaletteColors()).toHaveLength(1);
  });

  it("does not record a write made outside the popup", () => {
    // The quartet chips sit on the rail, outside the popup, and already
    // deliberately skip recording — white/grey/black have permanent chips one
    // click away, so caching them would evict colors the user actually chose.
    const { unmount } = render(<RailColorControl sel={satSel()} />);
    fireEvent.click(screen.getByRole("button", { name: /^white$/i }));
    unmount();
    expect(getRecentPaletteColors()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/toolbar/RailColorControl.test.tsx`
Expected: FAIL — `recordUsedColor` is imported but nothing calls it; the recording assertions get `[]`.

- [ ] **Step 3: Implement capture in `RailColorControl.tsx`**

Add imports:

```ts
import { useEffect } from "react";
import { recordUsedColor } from "../../lib/palette-store";
```

Inside the component, after `arrowNavRef`:

```ts
  /**
   * The last hex this popup session wrote, or null if it wrote nothing.
   *
   * One ref, not a hex plus a dirty flag: null already means "untouched", and
   * a second field would be one more thing to leave stranded. Transient
   * mid-drag writes simply overwrite it, which is what makes a forty-event hue
   * drag contribute one color instead of forty.
   */
  const lastHex = useRef<string | null>(null);

  /** Settle the session's color into the Recent palette. Idempotent: it nulls
   *  the ref, so a close followed by an unmount records once, not twice. */
  const flushSession = () => {
    const hex = lastHex.current;
    lastHex.current = null;
    if (hex) recordUsedColor(hex);
  };

  /**
   * The popup can be unmounted with a session in flight — `View ▸ Show
   * Toolbar` makes `ToolBar` return null, taking this component and the popup
   * with it. Same hazard `cancelEyeDropper` guards in ColorPopup/ColorPanel,
   * same cleanup-effect shape. Without this the session's color is lost.
   * `lastHex` is a ref and `recordUsedColor` a module import, so the empty
   * dep array closes over nothing stale.
   */
  useEffect(() => () => flushSession(), []);

  /**
   * What the popup writes through. Recording lives here, not in
   * `useColorTarget`, because this component owns the popup's open/close and
   * is therefore the only place that knows when a session ended. Wrapping the
   * target rather than threading a callback into `ColorPopup` also keeps the
   * popup itself ignorant of recording entirely.
   */
  const popupTarget: ColorTarget = {
    ...target,
    setColor: (hex, alpha, transient) => {
      target.setColor(hex, alpha, transient);
      lastHex.current = hex;
    },
    adjustColor: (hex, alpha, transient) => {
      target.adjustColor(hex, alpha, transient);
      lastHex.current = hex;
    },
  };
```

Add the flush to `closePopup`, before the focus restore:

```ts
  const closePopup = () => {
    setOpen(false);
    flushSession();
    // Return focus to the box that opened the popup, mirroring how a native
    // dialog hands focus back to its trigger on dismissal.
    wrapRef.current
      ?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')
      ?.focus();
  };
```

The active box also closes the popup by toggling `open`, which does **not** go through `closePopup` — and that is the most common way users close it. Route it through `closePopup` instead of a blind toggle, in `chooserTarget.setPart`:

```ts
      if (part === target.part) {
        // Was `setOpen((o) => !o)`. The close half has to settle the session's
        // color, and `closePopup` is where that lives — a bare toggle would
        // silently drop it on the popup's most-used exit. Reading `open`
        // directly is correct in an event handler: it is this render's value,
        // and the only writer is this same handler.
        if (!isArrowNav) {
          if (open) closePopup();
          else setOpen(true);
        }
        return;
      }
```

`closePopup` is declared above `chooserTarget` already, so no reordering is needed. This also gives the toggle path the focus restore it never had.

Finally, hand the popup the wrapped target:

```tsx
      {open && <ColorPopup target={popupTarget} anchor={anchor()} onClose={closePopup} />}
```

> **Why `flushSession` nulls the ref before recording:** it makes the flush idempotent, so the close-then-unmount sequence records once rather than twice. Keep that ordering.

- [ ] **Step 4: Point the strip at the Recent palette in `ColorPopup.tsx`**

Replace the `RECENT_LIMIT` import with a local constant and the palette hook:

```ts
import { useRecentPaletteColors } from "../../lib/palette-store";

/**
 * Fixed-size strip: always this many slots so it never reflows as it fills,
 * regardless of how many colors the Recent palette has accumulated (up to
 * `RECENT_PALETTE_LIMIT`, which is much larger). Exported so tests and any
 * future caller share one number.
 */
export const RECENT_STRIP_SLOTS = 6;
```

Replace `const { recents } = useColorUiState();` with:

```ts
  // The Recent palette specifically — not whichever palette the docked panel's
  // dropdown has selected.
  const recents = useRecentPaletteColors();
```

Drop the now-unused `useColorUiState` import if nothing else in the file uses it, and update the slot construction:

```ts
  const slots = Array.from({ length: RECENT_STRIP_SLOTS }, (_, i) => recents[i] ?? null);
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/toolbar/`
Expected: PASS, including the pre-existing `"renders six recent slots"` and eyedropper-cancellation tests.

- [ ] **Step 6: Full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green. `src/lib/color-store.test.ts` still tests `recordRecent`, which still exists — it is retired in Task 4, not here.

- [ ] **Step 7: Commit**

```bash
git add src/ui/toolbar/RailColorControl.tsx src/ui/toolbar/ColorPopup.tsx src/ui/toolbar/RailColorControl.test.tsx
git commit -m "feat(color): record the rail popup's color when the session ends"
```

---

### Task 4: Retire the old recents plumbing

Pure deletion plus one refactor. No behavior change — the old path has had no readers since Task 3.

**Files:**
- Delete: `src/lib/recent-colors.ts`, `src/lib/recent-colors.test.ts`
- Modify: `src/app/preferences.ts:15,261-271`
- Modify: `src/lib/color-store.ts`
- Modify: `src/ui/color/useColorTarget.ts:5,37-66,167-173,208-215`
- Modify: `src/ui/panels/ColorPanel.tsx:29-33,57-62,71,76`
- Modify: `src/ui/toolbar/ColorPopup.tsx:35-39,122-127`
- Modify: `src/ui/toolbar/RailColorControl.tsx` (the wrapper loses one method)
- Test: `src/lib/color-store.test.ts`, `src/ui/color/useColorTarget.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ColorTarget` loses `adjustColor`; `setColor(hex: string, alpha: number, transient: boolean): void` is the single write method. `ColorUiState` becomes `{ activePart: ColorPart; numericMode: NumericMode }`.

- [ ] **Step 1: Delete the dead module and its test**

```bash
git rm src/lib/recent-colors.ts src/lib/recent-colors.test.ts
```

- [ ] **Step 2: Absorb `normalizeRecents` into `preferences.ts`**

Remove `import { normalizeRecents } from "../lib/recent-colors";` and delete `setRecentColors`. Replace the recent-colors block with:

```ts
const RECENT_COLORS_KEY = "flow.recentColors";

/** How many legacy entries are worth carrying forward. */
const LEGACY_RECENT_LIMIT = 20;

/**
 * Coerce the legacy recents blob into clean hexes.
 *
 * Lives here rather than in a module of its own because this key has exactly
 * one reader left: `palette-store`'s one-time migration into the Recent
 * palette. Nothing writes it anymore.
 */
function normalizeRecentColors(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const hex = scrubHex(item);
    if (hex && !out.includes(hex)) out.push(hex);
    if (out.length === LEGACY_RECENT_LIMIT) break;
  }
  return out;
}

/**
 * The legacy recent-colors MRU, normalized. **Read once**, by
 * `palette-store.ensureRecentPalette`, to seed the Recent palette on the run
 * that creates it. Nothing writes this key; it is left in place rather than
 * cleared, which costs nothing and removes a failure mode from the migration.
 */
export function getRecentColors(): string[] {
  return normalizeRecentColors(readJson(RECENT_COLORS_KEY));
}
```

Extend the existing `../lib/color-palettes` import with `scrubHex`.

- [ ] **Step 3: Strip `recents` out of `color-store.ts`**

Delete the `pushRecent` import, the `getRecentColors`/`setRecentColors` imports, the `recents` field from `ColorUiState`, the `recents` line in `load()`, and the whole `recordRecent` function. The interface comment stays accurate — update it only if it names `recents`.

- [ ] **Step 4: Collapse `setColor` and `adjustColor`**

In `src/ui/color/useColorTarget.ts`: delete the `recordRecent` import, delete `adjustColor` from the `ColorTarget` interface and the return object, and delete the `setColor` wrapper. Rename the internal `applyColor` to `setColor` and expose it directly. Replace the two long doc comments with one:

```ts
  /**
   * Write a color to the active part.
   *
   * `transient` is the only distinction that matters here: mid-drag writes
   * pass `true` and are not committed to history as separate steps.
   *
   * This used to be two methods — `setColor` recorded into the recents cache
   * and `adjustColor` did not. Recording now belongs to `RailColorControl`,
   * which is the only place that knows when a picker session ended, so the two
   * had nothing left to distinguish them. One method, one choice.
   */
  setColor: (hex: string, alpha: number, transient: boolean) => void;
```

Update the `quickSet` comment, which currently explains why it calls `applyColor` rather than `setColor` — that reasoning is now obsolete. Replace it with:

```ts
    if (kind !== "none") {
      // White/grey/black never join the Recent palette. They have permanent
      // dedicated chips one click away, and these chips live on the rail
      // outside the popup, so no session captures them either way.
      setColor(QUICK_HEX[kind], 100, false);
      return;
    }
```

Update every call site — each is a mechanical `adjustColor` → `setColor`:
- `src/ui/panels/ColorPanel.tsx:32` (`useColorDraft`'s `onCommit`)
- `src/ui/toolbar/ColorPopup.tsx:38` (`useColorDraft`'s `onCommit`)
- `src/ui/toolbar/RailColorControl.tsx` — `popupTarget` drops its `adjustColor` override, keeping only the `setColor` one.

Then simplify the two `useColorDraft` comments in `ColorPanel.tsx` and `ColorPopup.tsx`, which both currently explain the split ("Channel-level edits only … the recents strip calls `target.setColor` directly instead"). Replace each with:

```ts
  // Every write from the picker's channels — saturation, hue, alpha — lands
  // through the draft so HSV survives a round trip through an achromatic hex.
```

- [ ] **Step 5: Update the affected tests**

In `src/lib/color-store.test.ts`, delete the `recordRecent` describe block and any `recents` assertions; the remaining tests cover `activePart` and `numericMode`.

In `src/ui/color/useColorTarget.test.tsx`, delete any test asserting that `setColor` records or that `adjustColor` does not, and rename `adjustColor` call sites to `setColor`. Add one test pinning the new contract:

```ts
  it("does not record into the Recent palette", () => {
    // Recording is RailColorControl's job now — the hook is shared by both
    // surfaces, and the docked panel must not feed the list.
    const sel = fakeSel();
    const { result } = renderHook(() => useColorTarget(sel));
    act(() => result.current.setColor("#123456", 100, false));
    expect(getRecentPaletteColors()).toEqual([]);
  });
```

Import `getRecentPaletteColors` and `reloadPaletteStore` from `../../lib/palette-store`, and add `reloadPaletteStore()` to that file's `beforeEach`. Match the file's existing render/hook helper — if it renders a component rather than using `renderHook`, follow that instead of introducing a second style.

- [ ] **Step 6: Confirm nothing references the deleted symbols**

Run:

```bash
grep -rn "recordRecent\|pushRecent\|normalizeRecents\|RECENT_LIMIT\|setRecentColors\|adjustColor" src/ e2e/
```

Expected: no output. Any hit is a missed call site.

- [ ] **Step 7: Full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green, with a lower total test count than Task 3 (the deleted `recent-colors.test.ts` and `recordRecent` tests). Note the new number.

- [ ] **Step 8: Commit**

```bash
git add -A src/ && git commit -m "refactor(color): retire the recents cache, collapse setColor/adjustColor"
```

---

### Task 5: The Recent palette resists deletion

One carve-out from "behaves like any other palette", in the UI and in the store.

**Files:**
- Modify: `src/ui/color/PaletteSection.tsx:66-73,240-252`
- Modify: `src/lib/palette-store.ts` (`removePalette`)
- Test: `src/ui/color/PaletteSection.test.tsx`, `src/lib/palette-store.test.ts`

**Interfaces:**
- Consumes: `RECENT_PALETTE_ID` (Task 1).
- Produces: nothing new.

- [ ] **Step 1: Write the failing tests**

In `src/lib/palette-store.test.ts`:

```ts
  it("refuses to delete the Recent palette", () => {
    // Belt and braces behind the disabled button: the app recreates the
    // palette on next load, so a successful delete would silently discard the
    // user's history and hand them an empty one back.
    store.recordUsedColor("#123456");
    store.removePalette(RECENT_PALETTE_ID);
    const recent = store.getSnapshot().palettes.find((p) => p.id === RECENT_PALETTE_ID);
    expect(recent).toBeDefined();
    expect(recent!.colors).toEqual(["#123456"]);
  });
```

In `src/ui/color/PaletteSection.test.tsx` — add imports for `recordUsedColor` and `reloadPaletteStore` from `../../lib/palette-store`, add `reloadPaletteStore()` to the file's `beforeEach`, and define `selectPalette(name)` as a one-line wrapper over however the file's existing tests drive the `aria-label="Palette"` `<select>` (`fireEvent.change(screen.getByLabelText("Palette"), { target: { value: id } })` in the current file — resolve the name to an id through `getSnapshot().palettes`). Reuse the file's existing render helper rather than introducing a second one:

```ts
describe("the Recent palette", () => {
  it("cannot be deleted", () => {
    selectPalette("Recent");
    const trash = screen.getByRole("button", { name: "Delete palette" });
    expect(trash).toHaveAttribute("aria-disabled", "true");
    // NOT the native attribute: Chrome delivers no mouse events to a disabled
    // control, and this grid's tiles are drop targets that run on them.
    expect(trash).not.toBeDisabled();
    fireEvent.click(trash);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("still deletes selected swatches from the same button", () => {
    // The footer trash does double duty. Only the delete-palette branch is
    // inert — evicting a color you are sick of must keep working.
    recordUsedColor("#123456");
    selectPalette("Recent");
    fireEvent.click(screen.getByRole("button", { name: "Swatch #123456" }), { ctrlKey: true });
    const trash = screen.getByRole("button", { name: "Remove selected swatches" });
    expect(trash).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(trash);
    expect(screen.queryByRole("button", { name: "Swatch #123456" })).not.toBeInTheDocument();
  });

  it("still accepts a hand-added swatch", () => {
    selectPalette("Recent");
    fireEvent.click(screen.getByRole("button", { name: "Add current color to palette" }));
    expect(screen.getAllByRole("button", { name: /^Swatch #/ })).toHaveLength(1);
  });

  it("leaves delete-palette live for every other palette", () => {
    selectPalette("Pastel");
    expect(screen.getByRole("button", { name: "Delete palette" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx src/lib/palette-store.test.ts`
Expected: FAIL — the trash has no `aria-disabled` and the confirm dialog opens.

- [ ] **Step 3: Guard the store**

In `removePalette`, as the first line:

```ts
export function removePalette(id: string): void {
  // The Recent palette is app-maintained and recreated on next load, so
  // "deleting" it would just discard the user's history and hand back an empty
  // one. The UI disables the button; this makes the store honest too.
  if (id === RECENT_PALETTE_ID) return;
```

- [ ] **Step 4: Make the button inert in `PaletteSection.tsx`**

Import `RECENT_PALETTE_ID` from `../../lib/color-palettes` and derive, next to `current`:

```ts
  const isRecent = current.id === RECENT_PALETTE_ID;
```

Guard `onTrash`:

```ts
  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
      return;
    }
    if (isRecent) return;
    setConfirming(true);
  };
```

And the footer button — note `aria-disabled` is set only on the delete-palette branch, so removing selected swatches from the Recent palette still works:

```tsx
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          // NOT `disabled`: Chrome delivers no mouse events to a disabled form
          // control and this grid's tiles are HTML5 drop targets that run on
          // them — the same trap documented on the trash tile above.
          aria-disabled={selected.length === 0 && isRecent}
          title={
            selected.length > 0
              ? "Remove the selected swatches"
              : isRecent
                ? `“${current.name}” updates itself as you pick colors, so it can’t be deleted`
                : `Delete the “${current.name}” palette`
          }
          onClick={onTrash}
        >
          🗑
        </button>
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx src/lib/palette-store.test.ts`
Expected: PASS.

- [ ] **Step 6: Full suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add src/ui/color/PaletteSection.tsx src/ui/color/PaletteSection.test.tsx src/lib/palette-store.ts src/lib/palette-store.test.ts
git commit -m "feat(color): the Recent palette resists deletion"
```

---

### Task 6: End-to-end proof and full verification

jsdom cannot prove the loop works in a real browser, and three of this feature's risks are only visible there.

**Files:**
- Modify: `e2e/color-panel.spec.ts` (append; reuse its `drawRect`, `panel`, `popup`, `seedSaturation` helpers)
- Verify: `e2e/laser-color.spec.ts`, `e2e/bottombar.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Check the pinned-palette fixtures still hold**

`e2e/laser-color.spec.ts` (`pinPresets`, line 10) and `e2e/bottombar.spec.ts:57` both `addInitScript` a `flow.colorPalettes` value containing a single palette. Ensure-exists now appends a second one to those fixtures.

Read both files and confirm neither asserts on palette count, on the dropdown's option list, or on "the only palette". If one does, update the assertion to expect the extra entry — do not weaken it to a substring or a `toBeGreaterThan`.

Run: `pkill -f vite; npx playwright test e2e/laser-color.spec.ts e2e/bottombar.spec.ts`
Expected: PASS.

- [ ] **Step 2: Write the failing e2e tests**

Append to `e2e/color-panel.spec.ts`:

```ts
/** The swatches of whichever palette the docked panel currently shows. */
async function selectPalette(page: Page, name: string) {
  await page.locator(panel).getByLabel("Palette").selectOption({ label: name });
}

test("a color picked in the rail popup joins the Recent palette on close", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  // A fresh profile starts with an empty Recent palette — nothing to confuse
  // the assertions with, and no hardcoded hex anywhere in this test.
  await selectPalette(page, "Recent");
  await expect(page.locator(panel).locator(".flow-clr-palette__tile")).toHaveCount(0);

  // Open the rail's popup on the active box and give the fill a real color.
  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const dialog = page.locator(popup);
  await expect(dialog).toBeVisible();
  const box = (await dialog.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);

  const applied = await page.evaluate(() => (window as any).h.elements.at(-1).backgroundColor);
  expect(applied).not.toBe("transparent");

  // Still nothing: the color settles when the session ends, not before.
  await expect(page.locator(panel).locator(".flow-clr-palette__tile")).toHaveCount(0);

  await dialog.getByRole("button", { name: /close color picker/i }).click();

  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
  await expect(page.locator(panel).locator(".flow-clr-palette__tile")).toHaveCount(1);
});

test("the popup's strip shows what the Recent palette holds", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const dialog = page.locator(popup);
  const box = (await dialog.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  const applied = await page.evaluate(() => (window as any).h.elements.at(-1).backgroundColor);
  await dialog.getByRole("button", { name: /close color picker/i }).click();

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  await expect(page.locator(popup).getByRole("button", { name: `Recent color ${applied}` }))
    .toBeVisible();
});

test("a color set from the docked panel does NOT join the Recent palette", async ({ page }) => {
  // The core of the brief: the popup is the only automatic route in. This is
  // the assertion that fails if recording ever drifts back into the shared
  // useColorTarget write path.
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await seedSaturation(page);
  const applied = await page.evaluate(() => (window as any).h.elements.at(-1).backgroundColor);
  expect(applied).not.toBe("transparent");

  await selectPalette(page, "Recent");
  await expect(page.locator(panel).locator(".flow-clr-palette__tile")).toHaveCount(0);
});

test("the Recent palette cannot be deleted", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await selectPalette(page, "Recent");

  const trash = page.locator(panel).getByRole("button", { name: "Delete palette" });
  await expect(trash).toHaveAttribute("aria-disabled", "true");
  await trash.click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.locator(panel).getByLabel("Palette")).toHaveValue(/.+/);
});

test("the Recent palette survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");
  await drawRect(page, 560, 300, 680, 380);

  await page.locator(".flow-toolbar__color").getByRole("radio", { name: /Fill/ }).click();
  const dialog = page.locator(popup);
  const box = (await dialog.getByRole("application").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.3);
  const applied = await page.evaluate(() => (window as any).h.elements.at(-1).backgroundColor);
  await dialog.getByRole("button", { name: /close color picker/i }).click();

  await page.reload();
  await page.waitForSelector(".flow-pnl");
  await selectPalette(page, "Recent");
  await expect(page.locator(panel).getByRole("button", { name: `Swatch ${applied}` }))
    .toBeVisible();
});
```

> If `applied` comes back with an eight-digit alpha byte (`#rrggbbaa`), the palette stores the six-digit form — `scrubHex` strips alpha. Slice it before building the selector: `const hex = applied.slice(0, 7)`. Check the first run's failure output before assuming which form you get.

- [ ] **Step 3: Run the new tests**

Run: `pkill -f vite; npx playwright test e2e/color-panel.spec.ts`
Expected: PASS. If `selectPalette` cannot find the "Recent" option, confirm the Color panel accordion section is expanded in the default dock layout — the existing tests in this file rely on the same thing.

- [ ] **Step 4: Full verification**

```bash
npx vitest run 2>&1 | tail -5
npm run typecheck
pkill -f vite
npx playwright test 2>&1 | tail -20
```

Expected: unit all green, typecheck exit 0, e2e at **135 passed / 2 failed** (130 + 5 new; the two permanent `text-panel.spec.ts` container-padding failures remain). A third failure name is the documented parallel-load flake — re-run that spec alone before investigating.

- [ ] **Step 5: Manual smoke**

`npm run dev`, then confirm by hand:
1. Draw a rectangle. Open the rail popup, drag the hue, close it. The color appears in the strip and in the Recent palette.
2. Reopen the popup, click that same recent slot, close. The list does not reorder and gains nothing.
3. Open the popup, change a color, then `View ▸ Show Toolbar` to hide the rail. Show it again — the color was recorded.
4. Set a color from the docked panel. The Recent palette does not change.
5. Rename the Recent palette. Pick a new color from the popup. It still lands in the renamed palette.

- [ ] **Step 6: Commit**

```bash
git add e2e/
git commit -m "test(e2e): the rotating-color loop, popup to Recent palette"
```

- [ ] **Step 7: Write the memory file**

Create `.claude/memory/recent-palette.md` and add a one-line pointer to `.claude/memory/MEMORY.md`. Record what a future session cannot re-derive from the code:

- The list and the palette are one array; there is no sync layer, deliberately.
- `RECENT_PALETTE_ID` is fixed rather than generated **because the user can rename the palette**, and it is kept out of `BUILTIN_PALETTE_NAMES` **because `migrateBuiltins` would erase its history**. Both are silent failures if undone.
- A hex already present is a no-op, not a move-to-front — a product decision about a grid the user curates, not an oversight.
- Capture lives in `RailColorControl`, not `useColorTarget`, because only the former knows when a session ended. The unmount flush exists for `View ▸ Show Toolbar`.
- `setColor`/`adjustColor` merged; the distinction was recording and nothing else.
- Update the [[color-system]] memory's "Layout of the code" section, which still lists `lib/recent-colors.ts` and `color-store.ts`'s "6 recents".

Then commit:

```bash
git add .claude/memory/ && git commit -m "docs(memory): record the Recent palette design"
```

---

## Self-review notes

**Spec coverage.** Data model → Task 1. `recordUsedColor` semantics → Task 2. Capture rule, unmount survival, strip source → Task 3. Retirement and the `setColor`/`adjustColor` collapse → Task 4. Editability carve-out → Task 5. Test plan and fixture check → Task 6. Every spec section maps to a task.

**Two things the spec left implicit, decided here:**
- `removePalette` gets a store-level guard, not just a disabled button (Task 5). The UI alone would leave the store able to produce a state the app immediately undoes on reload.
- The active box's popup toggle bypasses `closePopup`, so it needs its own flush (Task 3, Step 3). Missing this would silently drop the session's color for the most common way of closing the popup.
