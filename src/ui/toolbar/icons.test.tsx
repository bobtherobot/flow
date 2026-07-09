import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { TOOL_ICONS } from "./icons";
import { TOOLS, LOCK_ID } from "./tools";

describe("TOOL_ICONS", () => {
  it("has a React element icon for every tool and the lock", () => {
    for (const t of TOOLS) {
      expect(isValidElement(TOOL_ICONS[t.id])).toBe(true);
    }
    expect(isValidElement(TOOL_ICONS[LOCK_ID])).toBe(true);
  });
});
