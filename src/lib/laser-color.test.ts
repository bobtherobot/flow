import { describe, it, expect } from "vitest";
import { DEFAULT_LASER_HEX, isLaserColor } from "./laser-color";

describe("laser-color", () => {
  it("defaults to opaque red hex", () => {
    expect(DEFAULT_LASER_HEX).toBe("#ff0000");
  });

  it("accepts 3-, 6-, and 8-digit hex", () => {
    expect(isLaserColor("#f00")).toBe(true);
    expect(isLaserColor("#ff0000")).toBe(true);
    expect(isLaserColor("#ff000080")).toBe(true);
  });

  it("rejects non-hex or malformed values", () => {
    expect(isLaserColor("red")).toBe(false);
    expect(isLaserColor("#ff00")).toBe(false);
    expect(isLaserColor("")).toBe(false);
    expect(isLaserColor(123)).toBe(false);
    expect(isLaserColor(null)).toBe(false);
  });
});
