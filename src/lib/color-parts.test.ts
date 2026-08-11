import { describe, it, expect } from "vitest";
import {
  availableParts, partSpec, normalizeActivePart, swapFillStroke,
} from "./color-parts";

/** Minimal element stand-ins.
 *
 *  Note the container binding: `resolveTextTargetIds` reads `boundElements` on
 *  the CONTAINER (`selection-style.ts:46`), not `containerId` on the child.
 *  Real Excalidraw keeps both in sync; a fixture carrying only `containerId`
 *  would resolve to no text targets and quietly test nothing. */
const rect = { id: "r1", type: "rectangle", strokeColor: "#111111", backgroundColor: "#eeeeee" };
const text = { id: "t1", type: "text", strokeColor: "#222222" };
const label = { id: "t2", type: "text", strokeColor: "#333333", containerId: "r1" };
const labeledRect = { ...rect, boundElements: [{ id: "t2", type: "text" }] };

describe("availableParts", () => {
  it("gives a shape fill and stroke", () => {
    expect(availableParts([rect], { r1: true })).toEqual(["fill", "stroke"]);
  });

  it("gives a bare text element only the text part", () => {
    expect(availableParts([text], { t1: true })).toEqual(["text"]);
  });

  it("gives a labeled container all three", () => {
    expect(availableParts([labeledRect, label], { r1: true })).toEqual(["fill", "stroke", "text"]);
  });

  it("falls back to fill and stroke with nothing selected", () => {
    expect(availableParts([rect], {})).toEqual(["fill", "stroke"]);
  });
});

describe("partSpec", () => {
  it("maps fill to backgroundColor over the selection", () => {
    expect(partSpec("fill", { r1: true }, {})).toEqual({
      part: "fill",
      prop: "backgroundColor",
      ids: { r1: true },
      currentItemKey: "currentItemBackgroundColor",
    });
  });

  it("maps stroke to strokeColor over the selection", () => {
    expect(partSpec("stroke", { r1: true }, {})).toEqual({
      part: "stroke",
      prop: "strokeColor",
      ids: { r1: true },
      currentItemKey: "currentItemStrokeColor",
    });
  });

  it("maps text to strokeColor over the resolved text targets", () => {
    expect(partSpec("text", { r1: true }, { t2: true })).toEqual({
      part: "text",
      prop: "strokeColor",
      ids: { t2: true },
      currentItemKey: "currentItemTextColor",
    });
  });
});

describe("normalizeActivePart", () => {
  it("keeps an available part", () => {
    expect(normalizeActivePart(["fill", "stroke"], "stroke")).toBe("stroke");
  });

  it("forces text when text is the only part", () => {
    expect(normalizeActivePart(["text"], "fill")).toBe("text");
  });

  it("falls back to fill when the active part is unavailable", () => {
    expect(normalizeActivePart(["fill", "stroke"], "text")).toBe("fill");
  });

  it("falls back to the first part when even fill is unavailable", () => {
    expect(normalizeActivePart(["text"], "stroke")).toBe("text");
  });
});

describe("swapFillStroke", () => {
  it("exchanges the two colors", () => {
    expect(swapFillStroke(rect)).toEqual({
      backgroundColor: "#111111",
      strokeColor: "#eeeeee",
    });
  });

  it("returns null when the two already match", () => {
    expect(swapFillStroke({ ...rect, strokeColor: "#aaaaaa", backgroundColor: "#aaaaaa" })).toBeNull();
  });

  it("carries transparent through in either direction", () => {
    expect(swapFillStroke({ ...rect, backgroundColor: "transparent" })).toEqual({
      backgroundColor: "#111111",
      strokeColor: "transparent",
    });
  });
});
