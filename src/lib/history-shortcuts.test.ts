import { describe, it, expect } from "vitest";
import { historyShortcutFor, isTextEntry } from "./history-shortcuts";

const key = (over: Partial<Parameters<typeof historyShortcutFor>[0]>) => ({
  key: "z", ctrlKey: false, metaKey: false, shiftKey: false, ...over,
});

describe("historyShortcutFor", () => {
  it("maps Ctrl+Z and Cmd+Z to undo", () => {
    expect(historyShortcutFor(key({ ctrlKey: true }))).toBe("undo");
    expect(historyShortcutFor(key({ metaKey: true }))).toBe("undo");
  });

  it("maps Ctrl+Shift+Z and Ctrl+Y to redo", () => {
    expect(historyShortcutFor(key({ ctrlKey: true, shiftKey: true }))).toBe("redo");
    expect(historyShortcutFor(key({ key: "y", ctrlKey: true }))).toBe("redo");
  });

  it("is case-insensitive", () => {
    expect(historyShortcutFor(key({ key: "Z", ctrlKey: true }))).toBe("undo");
  });

  it("ignores the keys without a modifier, and unrelated shortcuts", () => {
    expect(historyShortcutFor(key({}))).toBeNull();
    expect(historyShortcutFor(key({ key: "d", ctrlKey: true }))).toBeNull();
    expect(historyShortcutFor(key({ key: "y", ctrlKey: true, shiftKey: true }))).toBeNull();
  });
});

describe("isTextEntry", () => {
  const input = (type: string) => Object.assign(document.createElement("input"), { type });

  it("treats text, number and password inputs as text entry", () => {
    for (const type of ["text", "number", "password"]) {
      expect(isTextEntry(input(type))).toBe(true);
    }
  });

  it("treats search, email, url and tel inputs as text entry", () => {
    // flow's own search boxes (SearchControl.tsx, SearchPanel.tsx) are
    // type="search" — the vendor's own writable-element list doesn't cover
    // it, since Excalidraw has no search input of its own. See blocker A:
    // a "q" typed here was silently eaten by the Q swallow before this list
    // included "search".
    for (const type of ["search", "email", "url", "tel"]) {
      expect(isTextEntry(input(type))).toBe(true);
    }
  });

  it("does not treat a range slider as text entry", () => {
    expect(isTextEntry(input("range"))).toBe(false);
  });

  it("treats a textarea as text entry and a button as not", () => {
    expect(isTextEntry(document.createElement("textarea"))).toBe(true);
    expect(isTextEntry(document.createElement("button"))).toBe(false);
  });
});
