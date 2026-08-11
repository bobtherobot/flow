import { describe, it, expect, vi, beforeEach } from "vitest";

// The real package renders a portal-based overlay that needs a live canvas;
// stub the two exports the bridge touches with a minimal real store (not just
// spies) so `get` reflects whatever `set` last wrote — the identity check in
// `cancelEyeDropper` depends on that. `vi.hoisted` lets the hoisted mock
// factory reference these — a plain top-level `const` would hit vitest's
// "Cannot access before initialization" hoisting trap (see search-matches.test.ts).
const store = vi.hoisted(() => {
  let value: unknown = null;
  return {
    get: vi.fn((_atom?: unknown) => value),
    set: vi.fn((_atom: unknown, v: unknown) => {
      value = v;
    }),
    reset: () => {
      value = null;
    },
  };
});
vi.mock("@excalidraw/excalidraw", () => ({
  activeEyeDropperAtom: { __atom: true },
  editorJotaiStore: { get: store.get, set: store.set },
}));

import { openEyeDropper, cancelEyeDropper } from "./eyedropper";

beforeEach(() => {
  store.get.mockClear();
  store.set.mockClear();
  store.reset();
});

describe("openEyeDropper", () => {
  it("sets the atom with a payload the vendor accepts", () => {
    openEyeDropper({ part: "fill", onSelect: vi.fn() });

    expect(store.set).toHaveBeenCalledTimes(1);
    const [atom, payload] = store.set.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(atom).toEqual({ __atom: true });
    expect(payload).toMatchObject({
      keepOpenOnAlt: false,
      colorPickerType: "elementBackground",
    });
    expect(typeof payload.onSelect).toBe("function");
  });

  it("maps stroke and text to the stroke picker type", () => {
    openEyeDropper({ part: "stroke", onSelect: vi.fn() });
    expect((store.set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe(
      "elementStroke",
    );

    store.set.mockClear();
    openEyeDropper({ part: "text", onSelect: vi.fn() });
    expect((store.set.mock.calls[0][1] as Record<string, unknown>).colorPickerType).toBe(
      "elementStroke",
    );
  });

  it("forwards the picked color as a scrubbed hex", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });

    const payload = store.set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("#FF0000", {});

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("#ff0000");
  });

  it("ignores an unparseable picked color", () => {
    const onSelect = vi.fn();
    openEyeDropper({ part: "fill", onSelect });

    const payload = store.set.mock.calls[0][1] as { onSelect: (c: string, e: unknown) => void };
    payload.onSelect("rgb(1,2,3)", {});

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("returns the exact payload it installed, as an opaque handle", () => {
    const handle = openEyeDropper({ part: "fill", onSelect: vi.fn() });
    expect(store.set.mock.calls[0][1]).toBe(handle);
  });
});

describe("cancelEyeDropper", () => {
  it("clears the atom when the handle is still the live one", () => {
    const handle = openEyeDropper({ part: "fill", onSelect: vi.fn() });
    store.set.mockClear();

    cancelEyeDropper(handle);

    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith({ __atom: true }, null);
  });

  it("does nothing for a null handle", () => {
    cancelEyeDropper(null);
    expect(store.set).not.toHaveBeenCalled();
  });

  it("does nothing when the handle is no longer the live one (another pick has since opened, or the vendor already cleared it)", () => {
    // This is the case that matters: two independent surfaces share the one
    // global atom. If surface A's stale handle could still null the atom,
    // A's cleanup could wipe out a pick that surface B opened afterward.
    const handleA = openEyeDropper({ part: "fill", onSelect: vi.fn() });
    openEyeDropper({ part: "stroke", onSelect: vi.fn() }); // surface B's pick supersedes A's
    store.set.mockClear();

    cancelEyeDropper(handleA);

    expect(store.set).not.toHaveBeenCalled();
    expect(store.get(undefined)).not.toBe(handleA);
  });
});
