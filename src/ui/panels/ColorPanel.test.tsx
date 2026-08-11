import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// The eyedropper bridge (src/lib/eyedropper.ts) imports the real vendor
// package; stub the two exports it touches so the unmount-cancellation test
// below can assert on the atom write directly. `vi.hoisted` avoids vitest's
// "cannot access before initialization" hoisting trap (see
// src/lib/eyedropper.test.ts).
const { set } = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({
  activeEyeDropperAtom: { __atom: true },
  editorJotaiStore: { set },
}));

import { ColorPanel } from "./ColorPanel";
import { reloadColorStore } from "../../lib/color-store";
import { reloadPaletteStore } from "../../lib/palette-store";
import { hexToHsl } from "../../lib/color-convert";
import type { SelectionStyle } from "./useSelectionStyle";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/palette-store.test.ts,
// src/lib/color-store.test.ts, src/app/preferences.test.ts and
// src/ui/color/PaletteSection.test.tsx, which all use this same in-memory
// mock for the identical reason). Without this stub, `localStorage.clear()`
// throws "not a function" — an environment gap, not a behavior change.
const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  },
  key: (index: number) => {
    const keys = Object.keys(mockStorage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

// A labeled container: a rectangle carrying `boundElements` pointing at its
// bound text, the way real Excalidraw represents a shape with a caption
// (never `containerId` alone). Every other fixture in this plan has used bare
// text, where `selectedIds` and `textTargetIds` happen to be the same map —
// this one deliberately selects the container but targets the child, so a
// write that accidentally lands on the container id would be caught.
const container = {
  id: "c1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
  boundElements: [{ id: "t1", type: "text" }],
};
const boundText = {
  id: "t1", type: "text", strokeColor: "#222222",
};

function fakeSelWithLabeledContainer(): SelectionStyle {
  return {
    elements: [container, boundText],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
    },
    selectedIds: { c1: true },
    textTargetIds: { t1: true },
    hasSelection: true,
    selectedCount: 1,
    hasText: true,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as SelectionStyle;
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
  reloadPaletteStore();
  set.mockClear();
});

describe("ColorPanel", () => {
  it("renders every section", () => {
    render(<ColorPanel sel={fakeSel()} />);
    expect(screen.getByRole("radiogroup", { name: /color target/i })).toBeInTheDocument();
    expect(screen.getByRole("application", { name: /saturation/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
    // "Hue" alone is ambiguous: the hue slider (role="slider") and the HSLA
    // numeric field both carry aria-label="Hue". The slider is already
    // asserted above by role; this checks the numeric field specifically.
    expect(screen.getByLabelText("Hue", { selector: "input" })).toBeInTheDocument();
    expect(screen.getByLabelText("Palette")).toBeInTheDocument();
  });

  it("no longer renders the old fill/stroke/text rows", () => {
    render(<ColorPanel sel={fakeSel()} />);
    expect(screen.queryByLabelText("Fill opacity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Stroke color")).not.toBeInTheDocument();
  });

  it("seeds the picker from the selection's fill", () => {
    render(<ColorPanel sel={fakeSel()} />);
    // #eeeeee is achromatic and nearly white.
    expect(screen.getByLabelText("Lightness")).toHaveValue(93);
  });

  it("follows the active part to the stroke color", () => {
    render(<ColorPanel sel={fakeSel()} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(screen.getByLabelText("Lightness")).toHaveValue(7);
  });

  // Wiring IS the deliverable of this task, so these assert the value written,
  // not merely that a write happened. `toHaveBeenCalled()` alone cannot tell
  // correct wiring from a swapped onHue/onAlpha, a wrong alpha on a palette
  // pick, or a numeric field routed through two setters instead of the
  // combined one.
  const chromatic = () =>
    fakeSel({ elements: [{ ...rect, backgroundColor: "#2091c2" }] as never });

  it("routes the hue slider to hue, not alpha", () => {
    const sel = chromatic();
    render(<ColorPanel sel={sel} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight" });
    const [, , currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    // Alpha untouched, so still a 6-digit hex. Swapped wiring would have moved
    // alpha to 99% and produced #2091c2fc instead.
    expect(currentItems.currentItemBackgroundColor).toBe("#208fc2");
  });

  it("routes the alpha slider to alpha, not hue", () => {
    const sel = chromatic();
    render(<ColorPanel sel={sel} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /opacity/i }), { key: "ArrowLeft" });
    const [, , currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    // 99% alpha, rgb half untouched.
    expect(currentItems.currentItemBackgroundColor).toBe("#2091c2fc");
  });

  it("sends a numeric-field edit through the combined setter", () => {
    const sel = chromatic();
    render(<ColorPanel sel={sel} />);
    const field = screen.getByLabelText("Lightness", { selector: "input" });
    fireEvent.change(field, { target: { value: "20" } });
    fireEvent.blur(field);
    const [, , currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    // Two separate setters would revert the first; the lightness must land.
    expect(Math.round(hexToHsl(currentItems.currentItemBackgroundColor as string)!.l)).toBe(20);
  });

  it("applies a palette swatch at full alpha", () => {
    const sel = fakeSel();
    render(<ColorPanel sel={sel} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0]);
    const [, , currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    // A wrong alpha here writes an invisible color; 6 digits proves alpha 100.
    expect(currentItems.currentItemBackgroundColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("targets the bound text element's id, not the container's, when the text part is active on a labeled container", () => {
    const sel = fakeSelWithLabeledContainer();
    render(<ColorPanel sel={sel} />);
    fireEvent.click(screen.getByRole("radio", { name: /^text/i }));
    const hue = screen.getByRole("slider", { name: /hue/i });
    fireEvent.keyDown(hue, { key: "ArrowRight" });
    expect(sel.update).toHaveBeenCalled();
    const ids = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ids).toEqual({ t1: true });
  });

  it("cancels an in-flight eyedropper pick if the panel unmounts", () => {
    // The accordion can collapse this panel (or switch to another) mid-pick.
    // The overlay lives outside this subtree (LayerUI mounts it globally), so
    // without this cleanup it would survive with `onSelect` closing over a
    // `target`/`draft` that no longer exists.
    const { unmount } = render(<ColorPanel sel={fakeSel()} />);

    // Rendering alone must not cancel anything — only tearing down should.
    expect(set).not.toHaveBeenCalled();

    unmount();

    expect(set).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ __atom: true }, null);
  });
});
