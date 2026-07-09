import { describe, it, expect } from "vitest";
import { TOOLS, LOCK_ID } from "./tools";

describe("TOOLS", () => {
  it("lists the 12 native tools plus laser, in order", () => {
    expect(TOOLS.map((t) => t.id)).toEqual([
      "selection", "hand", "rectangle", "diamond", "ellipse",
      "arrow", "line", "freedraw", "text", "image", "eraser", "frame",
      "laser",
    ]);
  });

  it("gives every tool a non-empty label and shortcut", () => {
    for (const t of TOOLS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.shortcut.length).toBeGreaterThan(0);
    }
  });

  it("exposes the lock id constant", () => {
    expect(LOCK_ID).toBe("lock");
  });
});
