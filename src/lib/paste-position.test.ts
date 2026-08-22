import { describe, it, expect } from "vitest";

import {
  DEFAULT_PASTE_POSITION,
  PASTE_OFFSET_STEP,
  PASTE_POSITION_LABELS,
  PASTE_POSITION_ORDER,
  isPastePosition,
  type PastePosition,
} from "./paste-position";

describe("paste position", () => {
  it("defaults to pasting in place", () => {
    // The whole point of the feature: a copy lands on top of its original
    // unless the user asks for something else.
    expect(DEFAULT_PASTE_POSITION).toBe("original");
  });

  it("offers every mode exactly once, in presentation order", () => {
    expect(PASTE_POSITION_ORDER).toEqual(["pointer", "viewport", "offset", "original"]);
    expect(new Set(PASTE_POSITION_ORDER).size).toBe(PASTE_POSITION_ORDER.length);
  });

  it("labels every mode it offers", () => {
    for (const mode of PASTE_POSITION_ORDER) {
      expect(PASTE_POSITION_LABELS[mode]).toBeTruthy();
    }
    // No orphan label for a mode the panel never renders.
    expect(Object.keys(PASTE_POSITION_LABELS).sort()).toEqual(
      [...PASTE_POSITION_ORDER].sort(),
    );
  });

  it("names the offset step in its label, so the number is discoverable", () => {
    expect(PASTE_POSITION_LABELS.offset).toContain(String(PASTE_OFFSET_STEP));
  });

  it("accepts every real mode", () => {
    for (const mode of PASTE_POSITION_ORDER) {
      expect(isPastePosition(mode)).toBe(true);
    }
  });

  it("rejects anything else a corrupt localStorage could hand back", () => {
    for (const value of [null, undefined, "", "centre", "cursor", 0, {}, []]) {
      expect(isPastePosition(value)).toBe(false);
    }
  });

  it("guards the exact union the fork's appState field declares", () => {
    // A mode added here but not to the fork's `pastePosition` type would be
    // written into appState and silently fall through to "original".
    const exhaustive: Record<PastePosition, true> = {
      pointer: true,
      viewport: true,
      offset: true,
      original: true,
    };
    expect(Object.keys(exhaustive).sort()).toEqual([...PASTE_POSITION_ORDER].sort());
  });
});
