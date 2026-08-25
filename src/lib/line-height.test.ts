import { describe, it, expect } from "vitest";
import {
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  clampLineHeight,
  customLineHeights,
  lineCount,
  textHeightAt,
} from "./line-height";

describe("lineCount", () => {
  it("counts a single line", () => {
    expect(lineCount("Flow")).toBe(1);
  });

  it("counts wrapped/explicit line breaks", () => {
    expect(lineCount("one\ntwo\nthree")).toBe(3);
  });

  it("counts a trailing blank line, which still occupies a line box", () => {
    expect(lineCount("one\n")).toBe(2);
  });

  it("normalizes CRLF rather than counting it twice", () => {
    expect(lineCount("one\r\ntwo")).toBe(2);
  });
});

describe("textHeightAt", () => {
  it("is lineCount × fontSize × lineHeight (vendor's getTextHeight)", () => {
    expect(textHeightAt({ text: "a\nb\nc", fontSize: 20 }, 1.5)).toBe(90);
  });

  it("scales linearly, so it round-trips vendor's detectLineHeight", () => {
    const el = { text: "a\nb", fontSize: 16 };
    const height = textHeightAt(el, 1.25);
    expect(height / lineCount(el.text) / el.fontSize).toBeCloseTo(1.25);
  });
});

describe("clampLineHeight", () => {
  it("passes an in-range value through", () => {
    expect(clampLineHeight(1.5)).toBe(1.5);
  });

  it("clamps to the bounds", () => {
    expect(clampLineHeight(0)).toBe(LINE_HEIGHT_MIN);
    expect(clampLineHeight(999)).toBe(LINE_HEIGHT_MAX);
  });
});

describe("customLineHeights", () => {
  // Stand-in for vendor's per-font metrics: family 1 sits at 1.25, family 2 at 1.15.
  const defaultFor = (family: number) => (family === 1 ? 1.25 : 1.15);
  const text = (id: string, fontFamily: number, lineHeight: number) => ({
    id,
    type: "text",
    text: "hi",
    fontSize: 20,
    fontFamily,
    lineHeight,
  });

  it("skips text still carrying its own font's line height", () => {
    const els = [text("t", 1, 1.25)];
    expect(customLineHeights(els, { t: true }, defaultFor).size).toBe(0);
  });

  it("keeps a deliberately chosen line height, at its current value", () => {
    const els = [text("t", 1, 2)];
    expect(customLineHeights(els, { t: true }, defaultFor)).toEqual(new Map([["t", 2]]));
  });

  it("judges each element against its OWN font, not a single default", () => {
    // 1.15 is default for family 2 but custom for family 1.
    const els = [text("a", 2, 1.15), text("b", 1, 1.15)];
    expect(customLineHeights(els, { a: true, b: true }, defaultFor)).toEqual(
      new Map([["b", 1.15]]),
    );
  });

  it("ignores unselected elements and non-text", () => {
    const els = [text("t", 1, 2), { id: "r", type: "rectangle" }];
    expect(customLineHeights(els, { r: true }, defaultFor).size).toBe(0);
  });
});
