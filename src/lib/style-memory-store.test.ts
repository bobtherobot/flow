import { describe, it, expect, beforeEach } from "vitest";
import {
  adopt,
  record,
  resolveLoad,
  getActiveCategory,
  setActiveCategory,
  resetStyleMemory,
} from "./style-memory-store";

describe("style-memory-store", () => {
  // Module-level singleton: without this, one test's buckets leak into the next.
  beforeEach(() => {
    resetStyleMemory();
  });

  it("starts empty, so a load yields no patch", () => {
    expect(resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" })).toEqual({});
  });

  it("defaults the active category to shape", () => {
    expect(getActiveCategory()).toBe("shape");
  });

  it("adopts a snapshot and replays its contended keys", () => {
    adopt("shape", {
      currentItemStrokeColor: "#ff0000",
      currentItemStrokeWidth: 4,
      currentItemFontSize: 40, // resident — must not be stored
    });

    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect(patch.currentItemStrokeColor).toBe("#ff0000");
    expect(patch.currentItemStrokeWidth).toBe(4);
    expect(patch.currentItemFontSize).toBeUndefined();
  });

  it("makes the adopted category active", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });
    expect(getActiveCategory()).toBe("linear");
  });

  it("keeps the buckets isolated", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toEqual({});
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#00ff00" });
  });

  it("records one patch into several categories at once", () => {
    record(["shape", "linear"], { currentItemStrokeColor: "#0000ff" });

    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#0000ff" });
  });

  it("merges a later record over an earlier one, key by key", () => {
    adopt("shape", { currentItemStrokeColor: "#ff0000", currentItemStrokeWidth: 4 });
    record(["shape"], { currentItemStrokeColor: "#00ff00" });

    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect(patch.currentItemStrokeColor).toBe("#00ff00");
    expect(patch.currentItemStrokeWidth).toBe(4);
  });

  it("drops resident keys from a record", () => {
    record(["text"], { currentItemFontSize: 40, currentItemOpacity: 50 });

    const patch = resolveLoad({ category: "text", toolType: "text", arrowType: "sharp" });
    expect(patch.currentItemFontSize).toBeUndefined();
    expect(patch.currentItemOpacity).toBe(50);
  });

  it("filters the load by target — an ellipse gets no corner radius", () => {
    adopt("shape", { currentItemCornerRadius: 24, currentItemStrokeColor: "#ff0000" });

    const rect = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    const ellipse = resolveLoad({ category: "shape", toolType: "ellipse", arrowType: "sharp" });
    expect(rect.currentItemCornerRadius).toBe(24);
    expect(ellipse.currentItemCornerRadius).toBeUndefined();
    expect(ellipse.currentItemStrokeColor).toBe("#ff0000");
  });

  it("gives an elbow arrow the remembered radius but a sharp arrow none", () => {
    adopt("linear", { currentItemCornerRadius: 8 });

    expect(
      resolveLoad({ category: "linear", toolType: "arrow", arrowType: "elbow" }),
    ).toMatchObject({ currentItemCornerRadius: 8 });
    expect(
      resolveLoad({ category: "linear", toolType: "arrow", arrowType: "sharp" }),
    ).toEqual({});
  });

  it("lets the active category be set without adopting", () => {
    setActiveCategory("freedraw");
    expect(getActiveCategory()).toBe("freedraw");
  });

  it("resets every bucket and the active category", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });
    resetStyleMemory();

    expect(getActiveCategory()).toBe("shape");
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toEqual({});
  });
});
