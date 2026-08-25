import { describe, it, expect } from "vitest";
import { isBindableForQuickArrows } from "./bindable";

type El = Record<string, unknown> & { id: string; type: string };
const el = (over: Partial<El>): El =>
  ({ id: "a", type: "rectangle", locked: false, ...over }) as El;

describe("isBindableForQuickArrows", () => {
  it("accepts the shapes an arrow can bind to", () => {
    for (const type of [
      "rectangle",
      "diamond",
      "ellipse",
      "image",
      "iframe",
      "embeddable",
      "frame",
      "magicframe",
    ]) {
      expect(isBindableForQuickArrows(el({ type }) as never), type).toBe(true);
    }
  });

  it("accepts free text but not text bound into a container", () => {
    expect(isBindableForQuickArrows(el({ type: "text" }) as never)).toBe(true);
    expect(
      isBindableForQuickArrows(el({ type: "text", containerId: "c" }) as never),
    ).toBe(false);
  });

  it("rejects the types an arrow cannot bind to", () => {
    for (const type of ["arrow", "line", "freedraw", "selection"]) {
      expect(isBindableForQuickArrows(el({ type }) as never), type).toBe(false);
    }
  });

  it("rejects locked elements", () => {
    expect(isBindableForQuickArrows(el({ locked: true }) as never)).toBe(false);
  });
});
