import { describe, it, expect } from "vitest";
import { ensureExtension, stripExtension } from "./filename";

describe("ensureExtension", () => {
  it("appends the extension when missing", () => {
    expect(ensureExtension("diagram", "excalidraw")).toBe("diagram.excalidraw");
  });

  it("accepts an extension with or without a leading dot", () => {
    expect(ensureExtension("diagram", ".png")).toBe("diagram.png");
  });

  it("does not double up an existing extension (case-insensitive)", () => {
    expect(ensureExtension("diagram.excalidraw", "excalidraw")).toBe("diagram.excalidraw");
    expect(ensureExtension("photo.PNG", "png")).toBe("photo.PNG");
  });

  it("trims surrounding whitespace", () => {
    expect(ensureExtension("  my diagram  ", "svg")).toBe("my diagram.svg");
  });
});

describe("stripExtension", () => {
  it("removes a matching extension", () => {
    expect(stripExtension("diagram.excalidraw", "excalidraw")).toBe("diagram");
  });

  it("leaves the name unchanged when the extension does not match", () => {
    expect(stripExtension("diagram.png", "excalidraw")).toBe("diagram.png");
  });
});
