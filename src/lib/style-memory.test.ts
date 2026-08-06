import { describe, it, expect } from "vitest";
import {
  CONTENDED_KEYS,
  CATEGORY_KEYS,
  RESET_WHEN_UNRECORDED,
  contendedOnly,
  categoryOfElement,
  categoryOfTool,
  snapshotElement,
  snapshotContainerPadding,
  applicableKeys,
} from "./style-memory";

describe("categoryOfElement", () => {
  it("maps the drawable element types to their category", () => {
    expect(categoryOfElement("rectangle")).toBe("shape");
    expect(categoryOfElement("diamond")).toBe("shape");
    expect(categoryOfElement("ellipse")).toBe("shape");
    expect(categoryOfElement("arrow")).toBe("linear");
    expect(categoryOfElement("line")).toBe("linear");
    expect(categoryOfElement("text")).toBe("text");
    expect(categoryOfElement("freedraw")).toBe("freedraw");
  });

  it("returns null for types with no style memory", () => {
    expect(categoryOfElement("image")).toBeNull();
    expect(categoryOfElement("frame")).toBeNull();
    expect(categoryOfElement("iframe")).toBeNull();
    expect(categoryOfElement("embeddable")).toBeNull();
  });
});

describe("categoryOfTool", () => {
  it("maps drawing tools to their category", () => {
    expect(categoryOfTool("rectangle")).toBe("shape");
    expect(categoryOfTool("arrow")).toBe("linear");
    expect(categoryOfTool("line")).toBe("linear");
    expect(categoryOfTool("text")).toBe("text");
    expect(categoryOfTool("freedraw")).toBe("freedraw");
  });

  it("returns null for non-drawing tools", () => {
    expect(categoryOfTool("selection")).toBeNull();
    expect(categoryOfTool("hand")).toBeNull();
    expect(categoryOfTool("eraser")).toBeNull();
    expect(categoryOfTool("laser")).toBeNull();
    expect(categoryOfTool("image")).toBeNull();
    expect(categoryOfTool("frame")).toBeNull();
  });
});

describe("CATEGORY_KEYS", () => {
  it("buckets only contended keys", () => {
    for (const keys of Object.values(CATEGORY_KEYS)) {
      for (const key of keys) expect(CONTENDED_KEYS).toContain(key);
    }
  });

  it("never buckets a resident key", () => {
    const resident = [
      "currentItemTextColor",
      "currentItemFontFamily",
      "currentItemFontSize",
      "currentItemTextAlign",
      "currentItemPadding",
      "currentItemArrowType",
      "currentItemStartArrowhead",
      "currentItemEndArrowhead",
      "currentItemStartArrowheadSize",
      "currentItemEndArrowheadSize",
    ];
    for (const key of resident) expect(CONTENDED_KEYS).not.toContain(key);
  });

  it("never buckets roughness — sloppiness is an app-wide preference", () => {
    expect(CONTENDED_KEYS).not.toContain("currentItemRoughness");
  });

  it("contendedOnly keeps contended keys and drops resident ones", () => {
    expect(
      contendedOnly({
        currentItemStrokeColor: "#ff0000",
        currentItemFontSize: 40,
        currentItemEndArrowhead: "dot",
      }),
    ).toEqual({ currentItemStrokeColor: "#ff0000" });
  });

  it("contendedOnly keeps an explicit undefined but drops an absent key", () => {
    const out = contendedOnly({ currentItemCornerRadius: undefined });
    expect("currentItemCornerRadius" in out).toBe(true);
    expect("currentItemStrokeColor" in out).toBe(false);
  });

  it("gives text only opacity, and freedraw only the stroke set", () => {
    expect([...CATEGORY_KEYS.text]).toEqual(["currentItemOpacity"]);
    expect([...CATEGORY_KEYS.freedraw].sort()).toEqual([
      "currentItemOpacity",
      "currentItemStrokeColor",
      "currentItemStrokeStyle",
      "currentItemStrokeWidth",
    ]);
  });
});

describe("RESET_WHEN_UNRECORDED", () => {
  it("contains only currentItemCornerRadius — the one key whose absence is meaningful", () => {
    expect(RESET_WHEN_UNRECORDED.has("currentItemCornerRadius")).toBe(true);
    expect(RESET_WHEN_UNRECORDED.size).toBe(1);
  });

  it("does not mark a plain default like stroke color for a reset", () => {
    // Every other contended key has no "unset" state — an unrecorded value
    // safely falls through to whatever is already active in appState, so it
    // must not be forced to an explicit undefined on load.
    expect(RESET_WHEN_UNRECORDED.has("currentItemStrokeColor")).toBe(false);
    expect(RESET_WHEN_UNRECORDED.has("currentItemStrokeWidth")).toBe(false);
  });

  it("is a subset of the contended keys", () => {
    for (const key of RESET_WHEN_UNRECORDED) expect(CONTENDED_KEYS).toContain(key);
  });
});

describe("snapshotElement", () => {
  it("records a rectangle's stroke, fill and roundness", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 100,
      height: 80,
      strokeColor: "#ff0000",
      backgroundColor: "#00ff00",
      fillStyle: "solid",
      strokeWidth: 4,
      strokeStyle: "dashed",
      opacity: 60,
      roundness: null,
    });
    expect(snap).toMatchObject({
      currentItemStrokeColor: "#ff0000",
      currentItemBackgroundColor: "#00ff00",
      currentItemFillStyle: "solid",
      currentItemStrokeWidth: 4,
      currentItemStrokeStyle: "dashed",
      currentItemOpacity: 60,
      currentItemRoundness: "sharp",
    });
  });

  it("maps a set roundness to \"round\"", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 100,
      height: 80,
      roundness: { type: 3 },
    });
    expect(snap.currentItemRoundness).toBe("round");
  });

  it("records a text element's colour under currentItemTextColor, not stroke", () => {
    const snap = snapshotElement({
      id: "t",
      type: "text",
      strokeColor: "#123456",
      fontFamily: 7,
      fontSize: 40,
      textAlign: "center",
      opacity: 100,
    });
    expect(snap.currentItemTextColor).toBe("#123456");
    expect(snap.currentItemStrokeColor).toBeUndefined();
    expect(snap.currentItemFontFamily).toBe(7);
    expect(snap.currentItemFontSize).toBe(40);
    expect(snap.currentItemTextAlign).toBe("center");
  });

  it("derives arrowType elbow / round / sharp", () => {
    const base = { id: "a", type: "arrow", width: 100, height: 10 };
    expect(snapshotElement({ ...base, elbowed: true }).currentItemArrowType).toBe("elbow");
    expect(
      snapshotElement({ ...base, elbowed: false, roundness: { type: 2 } }).currentItemArrowType,
    ).toBe("round");
    expect(
      snapshotElement({ ...base, elbowed: false, roundness: null }).currentItemArrowType,
    ).toBe("sharp");
  });

  it("records an arrow's arrowheads and their sizes", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
      roundness: null,
      startArrowhead: null,
      endArrowhead: "dot",
      startArrowheadSize: 6,
      endArrowheadSize: 12,
    });
    expect(snap.currentItemStartArrowhead).toBeNull();
    expect(snap.currentItemEndArrowhead).toBe("dot");
    expect(snap.currentItemStartArrowheadSize).toBe(6);
    expect(snap.currentItemEndArrowheadSize).toBe(12);
  });

  it("does not give an arrow a roundness default — arrows derive it from arrowType", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
      roundness: { type: 2 },
    });
    expect(snap.currentItemRoundness).toBeUndefined();
  });

  it("records an explicit cornerRadius on a rectangle", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 200,
      height: 100,
      cornerRadius: 24,
    });
    expect(snap.currentItemCornerRadius).toBe(24);
  });

  it("records the derived cornerRadius when the field is unset", () => {
    // effectiveCornerRadius: 200x100 with ADAPTIVE_RADIUS (type: 3):
    // x = min(200, 100) = 100; fixed = 32; 100 <= 128, so 100 * 0.25 = 25.
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 200,
      height: 100,
      roundness: { type: 3 },
    });
    expect(snap.currentItemCornerRadius).toBe(25);
  });

  it("omits cornerRadius where it has no meaning", () => {
    const ellipse = snapshotElement({ id: "e", type: "ellipse", width: 100, height: 100 });
    expect(ellipse.currentItemCornerRadius).toBeUndefined();

    const plainArrow = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: false,
    });
    expect(plainArrow.currentItemCornerRadius).toBeUndefined();
  });

  it("records cornerRadius for an elbow arrow", () => {
    const snap = snapshotElement({
      id: "a",
      type: "arrow",
      width: 100,
      height: 10,
      elbowed: true,
      cornerRadius: 8,
    });
    expect(snap.currentItemCornerRadius).toBe(8);
  });

  it("never records roughness", () => {
    const snap = snapshotElement({
      id: "r",
      type: "rectangle",
      width: 10,
      height: 10,
      roughness: 2,
    });
    expect(snap.currentItemRoughness).toBeUndefined();
  });

  it("returns nothing for an element with no category", () => {
    expect(snapshotElement({ id: "i", type: "image", strokeColor: "#f00" })).toEqual({});
  });
});

describe("snapshotContainerPadding", () => {
  it("records a container's effective padding", () => {
    expect(snapshotContainerPadding({ id: "r", type: "rectangle", padding: 20 })).toEqual({
      currentItemPadding: 20,
    });
  });

  it("falls back to the vendor default when unset", () => {
    expect(snapshotContainerPadding({ id: "r", type: "ellipse" })).toEqual({
      currentItemPadding: 5,
    });
  });

  it("returns nothing for a non-container", () => {
    expect(snapshotContainerPadding({ id: "a", type: "arrow" })).toEqual({});
  });
});

describe("applicableKeys", () => {
  const keysFor = (toolType: string, category: "shape" | "linear" | "text" | "freedraw", arrowType = "sharp") =>
    applicableKeys({ category, toolType, arrowType });

  it("gives a rectangle every shape key", () => {
    expect([...keysFor("rectangle", "shape")].sort()).toEqual([...CATEGORY_KEYS.shape].sort());
  });

  it("drops cornerRadius for an ellipse", () => {
    expect(keysFor("ellipse", "shape")).not.toContain("currentItemCornerRadius");
    expect(keysFor("ellipse", "shape")).toContain("currentItemRoundness");
  });

  it("drops cornerRadius and roundness for a sharp arrow", () => {
    const keys = keysFor("arrow", "linear", "sharp");
    expect(keys).not.toContain("currentItemCornerRadius");
    expect(keys).not.toContain("currentItemRoundness");
    expect(keys).toContain("currentItemStrokeColor");
  });

  it("keeps cornerRadius for an elbow arrow", () => {
    expect(keysFor("arrow", "linear", "elbow")).toContain("currentItemCornerRadius");
  });

  it("keeps roundness but drops cornerRadius for a line", () => {
    const keys = keysFor("line", "linear");
    expect(keys).toContain("currentItemRoundness");
    expect(keys).not.toContain("currentItemCornerRadius");
  });

  it("drops roundness for freedraw", () => {
    expect(keysFor("freedraw", "freedraw")).not.toContain("currentItemRoundness");
  });

  it("never yields a resident key", () => {
    for (const tool of ["rectangle", "ellipse", "arrow", "line", "freedraw", "text"] as const) {
      const category = categoryOfTool(tool)!;
      for (const key of applicableKeys({ category, toolType: tool, arrowType: "elbow" })) {
        expect(CONTENDED_KEYS).toContain(key);
      }
    }
  });
});
