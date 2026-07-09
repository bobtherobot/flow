import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getSloppiness, setSloppiness, getUnits, setUnits,
  getToolbarState, setToolbarState,
  getQuickbarState, setQuickbarState,
  getBindingMode, setBindingMode,
} from "./preferences";
import { DEFAULT_TOOLBAR_STATE } from "../ui/toolbar/toolbar-state";
import { DEFAULT_QUICKBAR_STATE } from "../ui/quickbar/quickbar-state";

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
