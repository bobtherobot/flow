import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSloppiness, setSloppiness, getUnits, setUnits,
  getToolbarState, setToolbarState,
  getQuickbarState, setQuickbarState,
  getBindingMode, setBindingMode,
  getLaserColor, setLaserColor,
  getSelectionMode, setSelectionMode,
  getPastePosition, setPastePosition,
  getGridSize, setGridSize,
  getGridColor, setGridColor,
  getColorPalettes,
  setColorPalettes,
  getDefaultPaletteId,
  setDefaultPaletteId,
  getRecentColors,
  getColorNumericMode,
  setColorNumericMode,
  getShapebarState,
  setShapebarState,
} from "./preferences";
import { DEFAULT_TOOLBAR_STATE, DEFAULT_SHAPEBAR_STATE } from "../ui/toolbar/toolbar-state";
import { DEFAULT_QUICKBAR_STATE } from "../ui/quickbar/quickbar-state";
import { DEFAULT_LASER_HEX } from "../lib/laser-color";
import { DEFAULT_GRID_COLOR } from "../lib/grid";

// Mock localStorage with a simple in-memory implementation
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

describe("sloppiness preference", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

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

describe("units preference", () => {
  beforeEach(() => {
    Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
  });

  it("defaults to px when unset", () => {
    expect(getUnits()).toBe("px");
  });

  it("round-trips a set unit", () => {
    setUnits("mm");
    expect(getUnits()).toBe("mm");
  });

  it("falls back to px on an unknown stored value", () => {
    localStorage.setItem("flow.units", "furlong");
    expect(getUnits()).toBe("px");
  });
});

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

describe("quickbar state persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default when nothing is stored", () => {
    expect(getQuickbarState()).toEqual(DEFAULT_QUICKBAR_STATE);
  });

  it("round-trips a stored state", () => {
    const state = { visible: false, floating: true, x: 200, y: 6, hiddenItems: ["zenMode"] };
    setQuickbarState(state);
    expect(getQuickbarState()).toEqual(state);
  });

  it("falls back to the default on malformed JSON", () => {
    localStorage.setItem("flow.quickbar", "{not json");
    expect(getQuickbarState()).toEqual(DEFAULT_QUICKBAR_STATE);
  });
});

describe("binding mode persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to on when unset", () => {
    expect(getBindingMode()).toBe("on");
  });

  it("round-trips a set mode", () => {
    setBindingMode("off");
    expect(getBindingMode()).toBe("off");
  });

  it("falls back to on for a corrupt stored value", () => {
    localStorage.setItem("flow.bindingMode", "banana");
    expect(getBindingMode()).toBe("on");
  });
});

describe("selection mode persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to enclose when unset", () => {
    expect(getSelectionMode()).toBe("enclose");
  });

  it("round-trips a set mode", () => {
    setSelectionMode("touch");
    expect(getSelectionMode()).toBe("touch");
  });

  it("falls back to enclose for a corrupt stored value", () => {
    localStorage.setItem("flow.selectionMode", "banana");
    expect(getSelectionMode()).toBe("enclose");
  });
});

describe("paste position persistence", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to pasting in place when unset", () => {
    expect(getPastePosition()).toBe("original");
  });

  it("round-trips every mode", () => {
    for (const mode of ["pointer", "viewport", "offset", "original"] as const) {
      setPastePosition(mode);
      expect(getPastePosition()).toBe(mode);
    }
  });

  it("falls back to the default for a corrupt stored value", () => {
    localStorage.setItem("flow.pastePosition", "middle-of-nowhere");
    expect(getPastePosition()).toBe("original");
  });
});

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

describe("grid size preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 20 when unset", () => {
    expect(getGridSize()).toBe(20);
  });

  it("round-trips a valid value", () => {
    setGridSize(40);
    expect(getGridSize()).toBe(40);
  });

  it("clamps an out-of-range value on write", () => {
    setGridSize(500);
    expect(getGridSize()).toBe(100);
  });

  it("falls back to the default on a corrupt stored value", () => {
    localStorage.setItem("flow.gridSize", "banana");
    expect(getGridSize()).toBe(20);
  });
});

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
      JSON.stringify([{ id: "a", name: "A", colors: ["#FFF", "nothex"] }]),
    );
    expect(getColorPalettes()).toEqual([{ id: "a", name: "A", colors: ["#ffffff"] }]);
  });

  it("round-trips the default palette id, null when unset", () => {
    expect(getDefaultPaletteId()).toBeNull();
    setDefaultPaletteId("xyz");
    expect(getDefaultPaletteId()).toBe("xyz");
  });
});

describe("recent colors", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to an empty list", () => {
    expect(getRecentColors()).toEqual([]);
  });

  it("reads a stored list", () => {
    localStorage.setItem("flow.recentColors", JSON.stringify(["#111111", "#222222"]));
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
  beforeEach(() => localStorage.clear());

  it("defaults to hsla", () => {
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

describe("grid color persistence", () => {
  beforeEach(() => localStorage.clear());

  it("returns the default when unset", () => {
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });

  it("round-trips a valid value", () => {
    setGridColor("#3366aa");
    expect(getGridColor()).toBe("#3366aa");
  });

  it("falls back to the default on a corrupt stored value", () => {
    localStorage.setItem("flow.gridColor", "banana");
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });

  it("normalizes a valid non-canonical value on write", () => {
    setGridColor("#ABC");
    expect(getGridColor()).toBe("#aabbcc");
  });

  it("ignores an invalid value on write rather than storing it", () => {
    setGridColor("nope");
    expect(getGridColor()).toBe(DEFAULT_GRID_COLOR);
  });
});

describe("shapebar state", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to shown and docked so the shape tools never vanish on upgrade", () => {
    expect(DEFAULT_SHAPEBAR_STATE).toMatchObject({ visible: true, floating: false });
    expect(DEFAULT_SHAPEBAR_STATE.hiddenTools).toEqual([]);
  });

  it("round-trips through its own key", () => {
    setShapebarState({ ...DEFAULT_SHAPEBAR_STATE, floating: true, x: 300, y: 120 });
    expect(getShapebarState()).toMatchObject({ floating: true, x: 300, y: 120 });
  });

  it("does not share storage with the toolbar", () => {
    setShapebarState({ ...DEFAULT_SHAPEBAR_STATE, hiddenTools: ["diamond"] });
    expect(localStorage.getItem("flow.shapebar")).toContain("diamond");
    expect(localStorage.getItem("flow.toolbar") ?? "").not.toContain("diamond");
  });

  it("falls back to the default on a junk payload", () => {
    localStorage.setItem("flow.shapebar", "{not json");
    expect(getShapebarState()).toEqual(DEFAULT_SHAPEBAR_STATE);
  });
});
