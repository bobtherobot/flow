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

  it("starts empty, so a load carries no values except the corner-radius reset", () => {
    // currentItemCornerRadius is the one contended key RESET_WHEN_UNRECORDED
    // covers (see style-memory.ts): its absence from an untouched bucket must
    // be applied as an explicit `undefined`, not silently omitted. toEqual
    // would pass even if this key were missing entirely — it ignores
    // undefined-valued properties — so this asserts the key's presence
    // directly, then locks the whole shape with toStrictEqual.
    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect("currentItemCornerRadius" in patch).toBe(true);
    expect(patch).toStrictEqual({ currentItemCornerRadius: undefined });
  });

  it("defaults the active category to shape", () => {
    expect(getActiveCategory()).toBe("shape");
  });

  it("adopts a snapshot and replays the contended keys it stored, never surfacing resident keys", () => {
    adopt("shape", {
      currentItemStrokeColor: "#ff0000",
      currentItemStrokeWidth: 4,
      currentItemFontSize: 40, // resident — must not be stored
    });

    const patch = resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" });
    expect(patch.currentItemStrokeColor).toBe("#ff0000");
    expect(patch.currentItemStrokeWidth).toBe(4);
    // Resident keys are structurally impossible to surface: resolveLoad reads only
    // applicableKeys(target), which is a subset of CATEGORY_KEYS (contended-only by
    // construction). The actual filtering by contendedOnly is unit-tested in
    // style-memory.test.ts.
    expect(patch.currentItemFontSize).toBeUndefined();
  });

  it("makes the adopted category active", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });
    expect(getActiveCategory()).toBe("linear");
  });

  it("keeps the buckets isolated", () => {
    adopt("linear", { currentItemStrokeColor: "#00ff00" });

    // Untouched "shape" still carries the corner-radius reset (toStrictEqual,
    // not toEqual, so an accidental leak of another key would fail loudly).
    expect(
      resolveLoad({ category: "shape", toolType: "rectangle", arrowType: "sharp" }),
    ).toStrictEqual({ currentItemCornerRadius: undefined });
    expect(
      resolveLoad({ category: "linear", toolType: "line", arrowType: "sharp" }),
    ).toMatchObject({ currentItemStrokeColor: "#00ff00" });
  });

  it("clears a stale corner radius left by another category instead of leaking it across", () => {
    // This is the exact regression that motivated RESET_WHEN_UNRECORDED: a
    // rectangle's radius (here 0, a square corner) was recorded into "shape".
    // An elbow arrow, drawn next, belongs to "linear" — a category that has
    // never recorded a radius of its own. Before the fix, resolveLoad simply
    // omitted the key and the caller's stale appState value (0) survived
    // untouched, so the arrow was wrongly stamped sharp instead of getting
    // its own 16px elbow default. See e2e/stroke-panel.spec.ts's
    // "corner radius applies across a multi-selection" test, which caught
    // this live.
    record(["shape"], { currentItemCornerRadius: 0 });

    const patch = resolveLoad({ category: "linear", toolType: "arrow", arrowType: "elbow" });
    expect("currentItemCornerRadius" in patch).toBe(true);
    expect(patch.currentItemCornerRadius).toBeUndefined();
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

  it("records only contended keys and a load never surfaces resident keys", () => {
    record(["text"], { currentItemFontSize: 40, currentItemOpacity: 50 });

    const patch = resolveLoad({ category: "text", toolType: "text", arrowType: "sharp" });
    // Resident keys are structurally impossible to surface: CATEGORY_KEYS["text"] is
    // contended-only by construction, and resolveLoad reads only applicableKeys(target),
    // which is a subset of it. See style-memory.test.ts for unit tests of the filter.
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
