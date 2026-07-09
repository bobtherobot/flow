import { describe, it, expect } from "vitest";
import { quickIcon } from "./icons";
import { QUICK_ITEMS } from "./actions";

describe("quickIcon", () => {
  it("returns a non-null icon for every quick item (actions, toggles, tools)", () => {
    for (const item of QUICK_ITEMS) {
      expect(quickIcon(item.id), `missing icon for "${item.id}"`).not.toBeNull();
    }
  });

  it("returns null for an unknown id", () => {
    expect(quickIcon("nope")).toBeNull();
  });
});
