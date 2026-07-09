import { describe, it, expect } from "vitest";
import { TOOLS, LOCK_ID } from "./tools";

describe("TOOLS", () => {
  it("lists the native tools with three arrow variants plus laser, in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "arrow-curved", "arrow-elbow",
      "line", "freedraw", "text", "image", "eraser", "frame",
      "laser",
    ]);
  });

  it("gives every tool a non-empty label", () => {
    for (const t of TOOLS) {
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it("gives every tool a shortcut except the curved/elbow arrow variants", () => {
    for (const t of TOOLS) {
      if (t.id === "arrow-curved" || t.id === "arrow-elbow") {
        expect(t.shortcut).toBe(""); // cycled via A, no dedicated key
      } else {
        expect(t.shortcut.length).toBeGreaterThan(0);
      }
    }
  });

  it("maps the three arrow variants to the shared arrow tool with distinct shapes", () => {
    const arrows = TOOLS.filter((t) => (t.toolType ?? t.id) === "arrow");
    expect(arrows.map((t) => t.id)).toEqual(["arrow", "arrow-curved", "arrow-elbow"]);
    expect(arrows.map((t) => t.arrowType)).toEqual(["sharp", "round", "elbow"]);
  });

  it("exposes the lock id constant", () => {
    expect(LOCK_ID).toBe("lock");
  });
});
