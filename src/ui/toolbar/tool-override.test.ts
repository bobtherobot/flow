import { describe, it, expect } from "vitest";
import { overrideKeyFor, canEngage, type OverrideState } from "./tool-override";

/** A state where the override is allowed to engage; each test spoils one field. */
const READY: OverrideState = {
  activeTool: { type: "rectangle" },
  cursorButton: "up",
  newElement: null,
  multiElement: null,
  editingTextElement: null,
};

describe("overrideKeyFor", () => {
  it("uses Meta on Apple platforms", () => {
    expect(overrideKeyFor("MacIntel")).toBe("Meta");
    expect(overrideKeyFor("iPhone")).toBe("Meta");
  });

  it("uses Control everywhere else", () => {
    expect(overrideKeyFor("Win32")).toBe("Control");
    expect(overrideKeyFor("Linux x86_64")).toBe("Control");
    expect(overrideKeyFor("")).toBe("Control");
  });
});

describe("canEngage", () => {
  it("engages for a drawing tool with an idle canvas", () => {
    expect(canEngage(READY, null)).toBe(true);
  });

  it("does not engage when there is no state yet", () => {
    expect(canEngage(undefined, null)).toBe(false);
  });

  it("does not engage when the selection tool is already active", () => {
    expect(canEngage({ ...READY, activeTool: { type: "selection" } }, null)).toBe(false);
  });

  it("does not engage from the image tool, whose restore would reopen the file picker", () => {
    expect(canEngage({ ...READY, activeTool: { type: "image" } }, null)).toBe(false);
  });

  it("does not engage while a pointer is down", () => {
    expect(canEngage({ ...READY, cursorButton: "down" }, null)).toBe(false);
  });

  it("does not engage while an element is being drawn", () => {
    expect(canEngage({ ...READY, newElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage during a multi-point line", () => {
    expect(canEngage({ ...READY, multiElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage while a text element is being edited", () => {
    expect(canEngage({ ...READY, editingTextElement: { id: "a" } }, null)).toBe(false);
  });

  it("does not engage when the key landed in a text field", () => {
    const input = document.createElement("input");
    input.type = "text";
    expect(canEngage(READY, input)).toBe(false);
  });

  it("still engages when the key landed on a non-text element", () => {
    expect(canEngage(READY, document.createElement("div"))).toBe(true);
  });
});
