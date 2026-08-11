import { describe, it, expect, vi, beforeEach } from "vitest";

// The real package renders a portal-based overlay that needs a live canvas;
// stub the two exports the bridge touches. `vi.hoisted` lets the hoisted mock
// factory reference the fn — a plain top-level `const` would hit vitest's
// "Cannot access before initialization" hoisting trap (see search-matches.test.ts).
const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({
  activeEyeDropperAtom: { __atom: true },
  editorJotaiStore: { set },
}));

import { openEyeDropper, cancelEyeDropper } from "./eyedropper";

beforeEach(() => set.mockClear());

describe("openEyeDropper", () => {
  it("sets the atom with a payload the vendor accepts", () => {
    openEyeDropper({ part: "fill", onSelect: vi.fn() });

    expect(set).toHaveBeenCalledTimes(1);
    const [atom, payload] = set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(atom).toEqual({ __atom: true });
    expect(payload).toMatchObject({
      keepOpenOnAlt: false,
      colorPickerType: "elementBackground",
    });
    expect(typeof payload.onSelect).toBe("function");
  });

  it("maps stroke and text to the stroke picker type", () => {
    openEyeDropper({ part: "stroke", onSelect: vi.fn() });
    expect((set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe(
      "elementStroke",
    );

    set.mockClear();
    openEyeDropper({ part: "text", onSelect: vi.fn() });
    expect((set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe(
      "elementStroke",
    );
  });

  it("forwards the picked color as a scrubbed hex", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });

    const payload = set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("#FF0000", {});

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("#ff0000");
  });

  it("ignores an unparseable picked color", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });

    const payload = set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("rgb(1,2,3)", {});

    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("cancelEyeDropper", () => {
  it("clears the atom with null, on the same atom openEyeDropper used", () => {
    cancelEyeDropper();

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ __atom: true }, null);
  });
});
