// src/lib/palette-store.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import * as store from "./palette-store";

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
