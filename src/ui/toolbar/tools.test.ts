import { describe, it, expect } from "vitest";
import { TOOLS } from "./tools";

describe("TOOLS", () => {
  it("lists the nine non-shape tools in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection", "hand", "text", "freedraw", "line", "frame", "image", "eraser", "laser",
    ]);
  });

  it("gives every tool a non-empty label", () => {
    for (const t of TOOLS) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every tool a shortcut", () => {
    for (const t of TOOLS) {
      expect(t.shortcut.length).toBeGreaterThan(0);
    }
  });
});

import { SHAPES, ALL_TOOLS } from "./tools";
import { TOOL_ICONS } from "./icons";

describe("the toolbar / shapebar split", () => {
  it("puts the nine non-shape tools in TOOLS, in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection",
      "hand",
      "text",
      "freedraw",
      "line",
      "frame",
      "image",
      "eraser",
      "laser",
    ]);
  });

  it("puts the six shape tools in SHAPES, arrows first", () => {
    expect(SHAPES.map((t) => t.id)).toEqual([
      "arrow",
      "arrow-curved",
      "arrow-elbow",
      "rectangle",
      "diamond",
      "ellipse",
    ]);
  });

  it("shares no id between the two lists", () => {
    const shapeIds = new Set(SHAPES.map((t) => t.id));
    expect(TOOLS.filter((t) => shapeIds.has(t.id))).toEqual([]);
  });

  it("ALL_TOOLS is both lists and nothing else", () => {
    expect(ALL_TOOLS).toHaveLength(TOOLS.length + SHAPES.length);
    expect(new Set(ALL_TOOLS.map((t) => t.id)).size).toBe(ALL_TOOLS.length);
  });

  it("has an icon for every tool in both lists", () => {
    for (const t of ALL_TOOLS) {
      expect(TOOL_ICONS[t.id], `missing icon for ${t.id}`).toBeTruthy();
    }
  });

  it("keeps the arrow variants mapped to the arrow tool", () => {
    const arrow = SHAPES.find((t) => t.id === "arrow");
    const curved = SHAPES.find((t) => t.id === "arrow-curved");
    const elbow = SHAPES.find((t) => t.id === "arrow-elbow");

    expect(arrow).toMatchObject({ id: "arrow", arrowType: "sharp", shortcut: "A" });
    expect(curved).toMatchObject({ toolType: "arrow", arrowType: "round", shortcut: "" });
    expect(elbow).toMatchObject({ toolType: "arrow", arrowType: "elbow", shortcut: "" });
  });

  it("gives every shape tool a non-empty label", () => {
    for (const t of SHAPES) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it("gives shape tools appropriate shortcuts (empty for arrow variants except sharp)", () => {
    for (const t of SHAPES) {
      if (t.id === "arrow-curved" || t.id === "arrow-elbow") {
        expect(t.shortcut).toBe(""); // cycled via A, no dedicated key
      } else {
        expect(t.shortcut.length).toBeGreaterThan(0);
      }
    }
  });
});
