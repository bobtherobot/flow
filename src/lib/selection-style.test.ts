import { describe, it, expect } from "vitest";
import {
  MIXED,
  getSelectedElements,
  getCommonValue,
  readFormValue,
  applyToSelection,
} from "./selection-style";

type El = { id: string; type: string; strokeColor: string; opacity?: number };

const el = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  strokeColor: "#000000",
  ...over,
});

describe("getSelectedElements", () => {
  it("returns only elements whose id is marked true, preserving order", () => {
    const els = [el("a"), el("b"), el("c")];
    const result = getSelectedElements(els, { c: true, a: true });
    expect(result.map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("ignores stale false entries and missing ids", () => {
    const els = [el("a"), el("b")];
    expect(getSelectedElements(els, { a: false, b: undefined })).toEqual([]);
  });

  it("returns empty array when nothing is selected", () => {
    expect(getSelectedElements([el("a")], {})).toEqual([]);
  });
});

describe("getCommonValue", () => {
  it("returns the shared value when all items agree", () => {
    const els = [el("a", { strokeColor: "#f00" }), el("b", { strokeColor: "#f00" })];
    expect(getCommonValue(els, (e) => e.strokeColor)).toBe("#f00");
  });

  it("returns MIXED when items disagree", () => {
    const els = [el("a", { strokeColor: "#f00" }), el("b", { strokeColor: "#0f0" })];
    expect(getCommonValue(els, (e) => e.strokeColor)).toBe(MIXED);
  });

  it("returns undefined for an empty list", () => {
    expect(getCommonValue([] as El[], (e) => e.strokeColor)).toBeUndefined();
  });

  it("returns the value for a single item", () => {
    expect(getCommonValue([el("a", { strokeColor: "#abc" })], (e) => e.strokeColor)).toBe("#abc");
  });

  it("treats NaN readings as equal via Object.is", () => {
    const items = [{ v: NaN }, { v: NaN }];
    expect(getCommonValue(items, (i) => i.v)).toBeNaN();
  });
});

describe("readFormValue", () => {
  const els = [el("a", { strokeColor: "#111" }), el("b", { strokeColor: "#222" })];

  it("falls back to the currentItem default when nothing is selected", () => {
    expect(readFormValue(els, {}, (e) => e.strokeColor, "#default")).toBe("#default");
  });

  it("returns the common value across the selection", () => {
    const same = [el("a", { strokeColor: "#333" }), el("b", { strokeColor: "#333" })];
    expect(readFormValue(same, { a: true, b: true }, (e) => e.strokeColor, "#default")).toBe("#333");
  });

  it("returns MIXED when the selection disagrees", () => {
    expect(readFormValue(els, { a: true, b: true }, (e) => e.strokeColor, "#default")).toBe(MIXED);
  });

  it("returns the single selected element's value, not the fallback", () => {
    expect(readFormValue(els, { a: true }, (e) => e.strokeColor, "#default")).toBe("#111");
  });
});

describe("applyToSelection", () => {
  it("updates only selected elements immutably", () => {
    const els = [el("a"), el("b")];
    const next = applyToSelection(els, { a: true }, "strokeColor", "#f00");
    expect(next[0]).toEqual({ ...els[0], strokeColor: "#f00" });
    expect(next[0]).not.toBe(els[0]); // new object
    expect(next[1]).toBe(els[1]); // untouched, same identity
  });

  it("passes through selected elements already at the value by identity", () => {
    const els = [el("a", { strokeColor: "#f00" })];
    const next = applyToSelection(els, { a: true }, "strokeColor", "#f00");
    expect(next[0]).toBe(els[0]);
  });

  it("does not mutate the input array or elements", () => {
    const els = [el("a")];
    applyToSelection(els, { a: true }, "strokeColor", "#f00");
    expect(els[0].strokeColor).toBe("#000000");
  });

  it("restricts writes with a predicate (e.g. text-only)", () => {
    const els = [el("a", { type: "text" }), el("b", { type: "rectangle" })];
    const next = applyToSelection(
      els,
      { a: true, b: true },
      "strokeColor",
      "#f00",
      (e) => e.type === "text",
    );
    expect(next[0].strokeColor).toBe("#f00");
    expect(next[1]).toBe(els[1]); // rectangle skipped by predicate
  });

  it("leaves everything untouched when the selection is empty", () => {
    const els = [el("a"), el("b")];
    const next = applyToSelection(els, {}, "strokeColor", "#f00");
    expect(next[0]).toBe(els[0]);
    expect(next[1]).toBe(els[1]);
  });
});
