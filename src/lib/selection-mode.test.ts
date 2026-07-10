import { describe, it, expect } from "vitest";
import {
  DEFAULT_SELECTION_MODE,
  SELECTION_MODE_ORDER,
  SELECTION_MODE_LABELS,
  isSelectionMode,
} from "./selection-mode";

describe("selection-mode", () => {
  it("defaults to enclose (Excalidraw's stock marquee behavior)", () => {
    expect(DEFAULT_SELECTION_MODE).toBe("enclose");
  });

  it("guards known modes", () => {
    expect(isSelectionMode("touch")).toBe(true);
    expect(isSelectionMode("enclose")).toBe(true);
    expect(isSelectionMode("nope")).toBe(false);
    expect(isSelectionMode(null)).toBe(false);
    expect(isSelectionMode(1)).toBe(false);
  });

  it("presents touch before enclose with the spec's labels", () => {
    expect(SELECTION_MODE_ORDER).toEqual(["touch", "enclose"]);
    expect(SELECTION_MODE_LABELS.touch).toBe("marquee touch");
    expect(SELECTION_MODE_LABELS.enclose).toBe("marquee enclose");
  });
});
