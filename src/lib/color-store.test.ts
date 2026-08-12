import { describe, it, expect, beforeEach, vi } from "vitest";
import { subscribe, getSnapshot, setActivePart, setNumericMode, reloadColorStore } from "./color-store";

// Mock localStorage for test environment (same pattern as palette-store.test.ts)
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
  reloadColorStore();
});

describe("color-store", () => {
  it("starts on fill, hsla", () => {
    expect(getSnapshot()).toEqual({ activePart: "fill", numericMode: "hsla" });
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

  it("persists the numeric mode", () => {
    setNumericMode("hex");
    expect(getSnapshot().numericMode).toBe("hex");
    expect(localStorage.getItem("flow.colorNumericMode")).toBe("hex");
  });

  it("rehydrates from storage on reload", () => {
    localStorage.setItem("flow.colorNumericMode", "rgba");
    reloadColorStore();
    expect(getSnapshot().numericMode).toBe("rgba");
  });

  it("does not persist the active part", () => {
    setActivePart("text");
    reloadColorStore();
    expect(getSnapshot().activePart).toBe("fill");
  });
});
