import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSloppiness, setSloppiness } from "./preferences";

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
    localStorage.setItem("wimp.sloppiness", "banana");
    expect(getSloppiness()).toBe(0);
  });

  it("falls back to the default on an out-of-range stored value", () => {
    localStorage.setItem("wimp.sloppiness", "7");
    expect(getSloppiness()).toBe(0);
  });
});
