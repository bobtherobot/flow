// src/ui/color/PaletteSection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PaletteSection } from "./PaletteSection";
import { reloadPaletteStore, getSnapshot, removePalette } from "../../lib/palette-store";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/palette-store.test.ts,
// src/lib/color-store.test.ts, src/app/preferences.test.ts and
// src/ui/panels/SwatchesPanel.test.tsx, which all use this same in-memory
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

beforeEach(() => {
  localStorage.clear();
  reloadPaletteStore();
});

function setup(currentColor = "#123456") {
  const onPick = vi.fn();
  render(<PaletteSection currentColor={currentColor} onPick={onPick} />);
  return { onPick };
}

describe("PaletteSection", () => {
  it("lists the seeded palettes and selects the default", () => {
    setup();
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    expect(select.options.length).toBeGreaterThan(1);
    expect(select.selectedOptions[0].textContent).toBe("Pastel");
  });

  it("applies a swatch on click", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0]);
    expect(onPick).toHaveBeenCalledWith(expect.stringMatching(/^#[0-9a-f]{6}$/));
  });

  it("adds the current color through the grid plus tile", () => {
    setup("#123456");
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(screen.getByRole("button", { name: /add current color/i }));
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before + 1);
    expect(screen.getByRole("button", { name: "Swatch #123456" })).toBeInTheDocument();
  });

  it("does not add a swatch when the current color cannot be parsed as a hex color", () => {
    // scrubHex rejects "transparent" and anything else that isn't hex-shaped;
    // addSwatch silently no-ops on that. The grid's [+] must not invent a
    // fallback color to paper over it.
    setup("transparent");
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(screen.getByRole("button", { name: /add current color/i }));
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before);
  });

  it("switches palettes and persists the choice", () => {
    setup();
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    const vibrant = [...select.options].find((o) => o.textContent === "Vibrant")!;
    fireEvent.change(select, { target: { value: vibrant.value } });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Vibrant");
    expect(localStorage.getItem("flow.defaultPaletteId")).toBe(vibrant.value);
  });

  it("adds a palette", () => {
    setup();
    const before = (screen.getByLabelText("Palette") as HTMLSelectElement).options.length;
    fireEvent.click(screen.getByRole("button", { name: /add palette/i }));
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).options).toHaveLength(before + 1);
  });

  it("selects a swatch for deletion with a modifier click and removes it", () => {
    setup();
    const first = screen.getAllByRole("button", { name: /^swatch /i })[0];
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(first, { metaKey: true });
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /remove selected swatches/i }));
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before - 1);
  });

  it("does not apply a color on a modifier click", () => {
    const { onPick } = setup();
    fireEvent.click(screen.getAllByRole("button", { name: /^swatch /i })[0], { metaKey: true });
    expect(onPick).not.toHaveBeenCalled();
  });

  it("removes the selected swatch via Delete keydown", () => {
    setup();
    const first = screen.getAllByRole("button", { name: /^swatch /i })[0];
    const label = first.getAttribute("aria-label")!;
    const before = screen.getAllByRole("button", { name: /^swatch /i }).length;
    fireEvent.click(first, { metaKey: true });
    fireEvent.keyDown(first, { key: "Delete" });
    expect(screen.queryByRole("button", { name: label })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^swatch /i })).toHaveLength(before - 1);
  });

  it("asks before deleting a palette when nothing is selected", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /delete palette/i }));
    expect(screen.getByRole("alertdialog", { name: /delete palette/i })).toBeInTheDocument();
  });

  it("deletes the palette only after confirming", () => {
    setup();
    const before = getSnapshot().palettes.length;
    fireEvent.click(screen.getByRole("button", { name: /delete palette/i }));
    expect(getSnapshot().palettes.length).toBe(before); // not yet deleted
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    expect(getSnapshot().palettes.length).toBe(before - 1);
  });

  it("reseeds a fresh palette after deleting the last one", () => {
    setup();
    // Whittle the store down to a single palette directly, then delete that
    // last one through the UI's confirm flow.
    const ids = getSnapshot().palettes.map((p) => p.id);
    act(() => {
      for (const id of ids.slice(1)) removePalette(id);
    });
    fireEvent.click(screen.getByRole("button", { name: /delete palette/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    expect(getSnapshot().palettes).toHaveLength(1);
    // The select still resolves to a real, selected option — no crash, no
    // dangling reference to the palette that was just removed.
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect(select.selectedOptions).toHaveLength(1);
  });

  it("renames in place on double-click", () => {
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    const input = screen.getByLabelText("Palette name");
    fireEvent.change(input, { target: { value: "Mine" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Mine");
  });

  it("has no set-as-default control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /default/i })).not.toBeInTheDocument();
  });
});
