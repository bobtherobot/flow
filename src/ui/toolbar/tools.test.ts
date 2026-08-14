import { describe, it, expect } from "vitest";
import { TOOLS, SHAPES, ALL_TOOLS } from "./tools";
import { TOOL_ICONS } from "./icons";
import { SHAPES_REGISTRY } from "../shapes/registry";

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

describe("the toolbar / shapebar split", () => {
  it("puts the shape tools in SHAPES, arrows first, flow shapes last", () => {
    expect(SHAPES.map((t) => t.id)).toEqual([
      "arrow",
      "arrow-curved",
      "arrow-elbow",
      "rectangle",
      "diamond",
      "ellipse",
      "triangle",
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

  it("gives shape tools a shortcut unless they are arrow variants or flow shapes", () => {
    for (const t of SHAPES) {
      if (t.arrowType && t.id !== "arrow") continue; // curved/elbow cycle via A
      if (t.flowShape) continue; // flow's parametric shapes carry no shortcut
      expect(t.shortcut.length, `${t.id} should have a shortcut`).toBeGreaterThan(0);
    }
  });

  it("gives every flow-shape tool the rectangle carrier and a registry entry", () => {
    for (const t of SHAPES.filter((s) => s.flowShape)) {
      expect(t.toolType).toBe("rectangle");
      expect(t.shortcut).toBe("");
      expect(SHAPES_REGISTRY[t.flowShape!]).toBeTruthy();
    }
  });
});
