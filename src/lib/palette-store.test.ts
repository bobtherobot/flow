// src/lib/palette-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as store from "./palette-store";
import {
  SEED_VERSION,
  RECENT_PALETTE_ID,
  RECENT_PALETTE_NAME,
  RECENT_PALETTE_LIMIT,
} from "./color-palettes";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/app/preferences.test.ts,
// which uses this same in-memory mock for the identical reason). Without
// this stub, `localStorage.clear()` throws "not a function" — an
// environment gap, not a behavior change to Task 1/2 code.
const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  },
  key: (index: number) => {
    const keys = Object.keys(mockStorage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

beforeEach(() => {
  localStorage.clear();
  store.reloadPaletteStore(); // fresh seed each test
});

describe("seeding + snapshot", () => {
  it("seeds 8 builtins and defaults to Pastel on first load", () => {
    const s = store.getSnapshot();
    // 8 builtins + the auto-created Recent palette (Task 1).
    expect(s.palettes).toHaveLength(9);
    const def = s.palettes.find((p) => p.id === s.defaultPaletteId);
    expect(def?.name).toBe("Pastel");
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

describe("seed-version migration", () => {
  /** A pre-migration install: stale builtins plus a palette the user made. */
  function seedLegacyStorage() {
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "d1", name: "Default", colors: ["#000000"] },
        { id: "p1", name: "Pastel", colors: ["#ffd6e0", "#ffe5b4"] },
        { id: "u1", name: "Mine", colors: ["#123456"] },
      ]),
    );
    localStorage.setItem("flow.defaultPaletteId", "d1");
    // No flow.paletteSeedVersion key at all — that is what "legacy" means.
    // (beforeEach's fresh seed stamps one, so it has to be cleared here.)
    localStorage.removeItem("flow.paletteSeedVersion");
    store.reloadPaletteStore();
  }

  it("stamps the seed version on a first-run seed", () => {
    expect(localStorage.getItem("flow.paletteSeedVersion")).toBe("2");
  });

  it("refreshes stale builtin palettes to the current seed colors", () => {
    seedLegacyStorage();
    const byName = (n: string) => store.getSnapshot().palettes.find((p) => p.name === n);

    expect(byName("Pastel")?.colors).toHaveLength(20);
    expect(byName("Default")?.colors).toHaveLength(20);
    expect(byName("Pastel & Vibrant")?.colors).toHaveLength(20);
  });

  it("keeps a refreshed builtin's id so references to it survive", () => {
    seedLegacyStorage();
    expect(store.getSnapshot().palettes.find((p) => p.name === "Pastel")?.id).toBe("p1");
  });

  it("preserves user-created palettes untouched", () => {
    seedLegacyStorage();
    expect(store.getSnapshot().palettes.find((p) => p.name === "Mine")).toEqual({
      id: "u1",
      name: "Mine",
      colors: ["#123456"],
    });
  });

  it("moves the default onto Pastel", () => {
    seedLegacyStorage();
    const s = store.getSnapshot();
    expect(s.palettes.find((p) => p.id === s.defaultPaletteId)?.name).toBe("Pastel");
  });

  it("does not re-run once the stored version is current", () => {
    seedLegacyStorage();
    const pastel = store.getSnapshot().palettes.find((p) => p.name === "Pastel")!;
    store.removeSwatches(pastel.id, [0]);

    store.reloadPaletteStore();

    expect(
      store.getSnapshot().palettes.find((p) => p.name === "Pastel")?.colors,
    ).toHaveLength(19);
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
    // p has no colors, so getDefaultPaletteColors falls back to the builtin
    // fallback palette (see "falls back when the default palette is empty"
    // below) — it never returns an empty array so pickers always render
    // something.
    expect(store.getDefaultPaletteColors()).toEqual(
      expect.arrayContaining(["#1e1e1e"]),
    );
  });

  it("getDefaultPaletteColors falls back when the default palette is empty", () => {
    const p = store.addPalette(); // empty
    store.setDefaultPalette(p.id);
    // empty default → fallback so pickers never render nothing
    expect(store.getDefaultPaletteColors()).toEqual(
      expect.arrayContaining(["#1e1e1e"]),
    );
  });

  it("addSwatch / removeSwatches operate by index", () => {
    const p = store.addPalette();
    store.addSwatch(p.id, "abc");            // scrubbed → #aabbcc
    store.addSwatch(p.id, "#ff0000");
    let colors = store.getSnapshot().palettes.find((x) => x.id === p.id)!.colors;
    expect(colors).toEqual(["#aabbcc", "#ff0000"]);

    store.removeSwatches(p.id, [1]);
    colors = store.getSnapshot().palettes.find((x) => x.id === p.id)!.colors;
    expect(colors).toEqual(["#aabbcc"]);
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
    // beforeEach's own reload already created (and persisted) an empty Recent
    // palette, so without clearing first this reload would hit the "already
    // exists" branch and never touch the legacy key — clearing puts us back
    // at a true first-run state so creation-time seeding actually runs.
    localStorage.clear();
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
    // Same reason as above: clear first so this reload actually creates
    // Recent from the legacy key instead of finding the beforeEach-seeded
    // one already in place (which would make this assertion pass vacuously).
    localStorage.clear();
    const many = Array.from({ length: 30 }, (_, i) =>
      `#${i.toString(16).padStart(2, "0")}0000`,
    );
    localStorage.setItem("flow.recentColors", JSON.stringify(many));
    store.reloadPaletteStore();
    expect(recent()!.colors.length).toBeLessThanOrEqual(RECENT_PALETTE_LIMIT);
  });
});
