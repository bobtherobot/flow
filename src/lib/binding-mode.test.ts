import { describe, it, expect } from "vitest";
import {
  DEFAULT_BINDING_MODE,
  isBindingMode,
  isBindingActive,
  toggledBindingMode,
} from "./binding-mode";

describe("binding-mode", () => {
  it("defaults to on (matches Excalidraw's checked Arrow binding toggle)", () => {
    expect(DEFAULT_BINDING_MODE).toBe("on");
  });

  it("guards known modes", () => {
    expect(isBindingMode("on")).toBe(true);
    expect(isBindingMode("off")).toBe(true);
    expect(isBindingMode("auto")).toBe(true);
    expect(isBindingMode("nope")).toBe(false);
    expect(isBindingMode(null)).toBe(false);
    expect(isBindingMode(1)).toBe(false);
  });

  it("treats on and auto as active, off as inactive", () => {
    expect(isBindingActive("on")).toBe(true);
    expect(isBindingActive("auto")).toBe(true);
    expect(isBindingActive("off")).toBe(false);
  });

  it("flips active↔off (an auto default toggles to off)", () => {
    expect(toggledBindingMode("on")).toBe("off");
    expect(toggledBindingMode("auto")).toBe("off");
    expect(toggledBindingMode("off")).toBe("on");
  });
});
