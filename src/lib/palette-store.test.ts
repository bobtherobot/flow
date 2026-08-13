// src/lib/palette-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as store from "./palette-store";
import {
  SEED_VERSION,
  RECENT_PALETTE_ID,
  RECENT_PALETTE_NAME,
  RECENT_PALETTE_LIMIT,
  builtinColors,
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

  it("leaves the Recent palette as the last one standing, rather than reseeding a fresh Default", () => {
    // Before the Recent-palette guard (Task 5), deleting every palette in turn
    // hit zero palettes and removePalette's own reseed-a-fresh-Default branch
    // fired. Recent's deletion is now a no-op, so it is always the floor: this
    // loop settles on Recent alone, and that reseed branch — like
    // getRecentPaletteColors's NO_COLORS fallback — becomes unreachable
    // through the public API. It stays in removePalette as cheap defensive
    // code; there is nothing left to exercise it with.
    let ids = store.getSnapshot().palettes.map((p) => p.id);
    for (const id of ids) store.removePalette(id);
    const after = store.getSnapshot();
    expect(after.palettes).toEqual([{ id: RECENT_PALETTE_ID, name: RECENT_PALETTE_NAME, colors: [] }]);
    expect(after.defaultPaletteId).toBe(RECENT_PALETTE_ID);
  });

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

  it("does NOT resurrect a color the user deleted, even with the legacy key still set", () => {
    // The legacy key is never cleared, so the only thing standing between a
    // stale entry and a deleted color coming back is the one-shot read. Start
    // from truly empty storage so the palette is CREATED seeded — otherwise
    // beforeEach's empty palette makes the delete below a no-op and the test
    // proves nothing.
    localStorage.clear();
    localStorage.setItem("flow.recentColors", JSON.stringify(["#ff0000"]));
    store.reloadPaletteStore();
    expect(recent()!.colors).toEqual(["#ff0000"]);

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

  it("survives being renamed to a builtin's name across a migration", () => {
    // Named "Pastel", not "Recent" — deliberately. The sibling test above
    // ("survives a builtin migration with its colors intact") keeps the name
    // "Recent", so byName's Recent-vs-builtin collision never happens there
    // and it can't catch migrateBuiltins matching by name. This test exercises
    // the case that actually breaks it: the user renamed Recent to one of the
    // nine BUILTIN_PALETTE_NAMES. Recent is stored LAST, so without the
    // id-based exemption it would win the byName collision — the rebuilt
    // Pastel builtin would steal id `flow-recent` and Pastel's seed colors,
    // and the real Pastel builtin would never be recreated (dropped from
    // `userMade` because its name now matches a builtin name too). If a
    // future edit "simplifies" this test back to the name "Recent", it stops
    // testing the fix — don't rename it back.
    localStorage.setItem(
      "flow.colorPalettes",
      JSON.stringify([
        { id: "p1", name: "Mine", colors: ["#112233"] },
        { id: RECENT_PALETTE_ID, name: "Pastel", colors: ["#abcdef"] },
      ]),
    );
    localStorage.setItem("flow.paletteSeedVersion", "0");
    store.reloadPaletteStore();

    const snapshot = store.getSnapshot();
    const recentById = snapshot.palettes.find((p) => p.id === RECENT_PALETTE_ID);
    expect(recentById?.colors).toEqual(["#abcdef"]);

    const realPastel = snapshot.palettes.find(
      (p) => p.name === "Pastel" && p.id !== RECENT_PALETTE_ID,
    );
    expect(realPastel).toBeDefined();
    expect(realPastel!.colors).toEqual(builtinColors("Pastel"));
  });

  it("persists itself so the next load does not re-create it", () => {
    const stored = JSON.parse(localStorage.getItem("flow.colorPalettes")!);
    expect(stored.some((p: { id: string }) => p.id === RECENT_PALETTE_ID)).toBe(true);
  });
});

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

describe("copySwatchesTo", () => {
  const colorsOf = (id: string) =>
    store.getSnapshot().palettes.find((p) => p.id === id)!.colors;

  it("appends colors the target does not have", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111", "#222222"]);
    expect(colorsOf(target.id)).toEqual(["#111111", "#222222"]);
  });

  it("skips colors the target already has", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111"]);
    store.copySwatchesTo(target.id, ["#111111", "#222222"]);
    expect(colorsOf(target.id)).toEqual(["#111111", "#222222"]);
  });

  it("drops duplicates within a single copy", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111", "#111111"]);
    expect(colorsOf(target.id)).toEqual(["#111111"]);
  });

  it("commits ONCE for a multi-swatch copy", () => {
    // The regression this guards: implementing copy as a loop over addSwatch.
    // That fires one notify and one localStorage write per swatch for a single
    // user action, and is invisible in every other assertion here.
    const target = store.addPalette("Target");
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.copySwatchesTo(target.id, ["#111111", "#222222", "#333333"]);
    expect(listener).toHaveBeenCalledTimes(1);
    unsub();
  });

  it("does not notify when every color is already present", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#111111"]);
    const listener = vi.fn();
    const unsub = store.subscribe(listener);
    store.copySwatchesTo(target.id, ["#111111"]);
    expect(listener).not.toHaveBeenCalled();
    unsub();
  });

  it("scrubs forgiving input the way swatches do", () => {
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["ABC", "transparent", "#DDEEFF"]);
    expect(colorsOf(target.id)).toEqual(["#aabbcc", "#ddeeff"]);
  });

  it("survives a stale index that resolved to undefined", () => {
    // The caller builds this array by indexing a live palette with a held
    // selection. Recent truncates itself to RECENT_PALETTE_LIMIT, so it can
    // shrink under that selection and `current.colors[i]` comes back
    // undefined — which `scrubHex` would throw on. Skip it, copy the rest.
    const target = store.addPalette("Target");
    const withHole = ["#111111", undefined, "#222222"] as unknown as string[];
    expect(() => store.copySwatchesTo(target.id, withHole)).not.toThrow();
    expect(colorsOf(target.id)).toEqual(["#111111", "#222222"]);
  });

  it("no-ops on an unknown target id", () => {
    const before = store.getSnapshot();
    store.copySwatchesTo("nope", ["#111111"]);
    expect(store.getSnapshot()).toBe(before);
  });

  it("leaves the source palette untouched", () => {
    // Copy, not move. Uses Recent as the source since that is the intended use.
    store.recordUsedColor("#abcdef");
    const target = store.addPalette("Target");
    store.copySwatchesTo(target.id, ["#abcdef"]);
    expect(colorsOf(RECENT_PALETTE_ID)).toEqual(["#abcdef"]);
    expect(colorsOf(target.id)).toEqual(["#abcdef"]);
  });
});
