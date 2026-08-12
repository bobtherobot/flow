// src/ui/color/PaletteSection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PaletteSection } from "./PaletteSection";
import { reloadPaletteStore, getSnapshot, removePalette } from "../../lib/palette-store";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/palette-store.test.ts,
// src/lib/color-store.test.ts and src/app/preferences.test.ts, which all use
// this same in-memory mock for the identical reason). Without this stub,
// `localStorage.clear()` throws "not a function" — an environment gap, not a
// behavior change.
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

  it("selects rather than applies on shift-click", () => {
    // Shift-click was SwatchGrid's original (and only) multi-select gesture
    // for this exact grid. A habitual shift-click must select, not fall
    // through to "apply" and silently overwrite the live color.
    const { onPick } = setup();
    const first = screen.getAllByRole("button", { name: /^swatch /i })[0];
    fireEvent.click(first, { shiftKey: true });
    expect(first).toHaveAttribute("aria-pressed", "true");
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

  it("abandons a rename on Escape", () => {
    // Unmounting a focused input can fire blur on the way out; without an
    // explicit abandon flag that blur commits the edit Escape just cancelled.
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    const input = screen.getByLabelText("Palette name");
    fireEvent.change(input, { target: { value: "Discarded" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Pastel");
  });

  it("leaves rename mode when a palette is switched via Add palette mid-rename", () => {
    // The select is hidden while renaming, so the only way to invoke
    // choosePalette() without going through Escape first is the "Add
    // palette" button — it stays mounted in the same row throughout. This is
    // the actual regression path for whether choosePalette itself resets
    // rename mode: a variant of this test that triggers Escape before
    // switching can't tell, because Escape already clears `renaming` on its
    // own before the switch ever happens.
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    expect(screen.getByLabelText("Palette name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add palette/i }));
    expect(screen.queryByLabelText("Palette name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Palette")).toBeInTheDocument();
  });

  it("still commits a rename after an earlier Escape", () => {
    // The abandon flag must not survive the session it was set in: Escape
    // unmounts without a blur in jsdom, so a flag cleared only in onBlur
    // strands and eats the next real rename.
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    fireEvent.keyDown(screen.getByLabelText("Palette name"), { key: "Escape" });

    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    const input = screen.getByLabelText("Palette name");
    fireEvent.change(input, { target: { value: "Kept" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect((screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent)
      .toBe("Kept");
  });

  it("has no set-as-default control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /default/i })).not.toBeInTheDocument();
  });

  const trash = () => screen.getByRole("button", { name: "Delete swatches" });
  const swatches = () => screen.getAllByRole("button", { name: /^swatch /i });

  /** HTML5 DnD in jsdom: dragStart on the source, then drop on the target.
   *  PaletteSection tracks the source index in a ref, so no dataTransfer
   *  payload is involved and none needs faking. */
  function dragSwatchToTrash(index: number) {
    fireEvent.dragStart(swatches()[index]);
    fireEvent.dragOver(trash());
    fireEvent.drop(trash());
  }

  it("deletes the dropped swatch and only that one", () => {
    setup();
    const before = swatches().map((s) => s.getAttribute("title"));
    act(() => dragSwatchToTrash(2));
    const after = swatches().map((s) => s.getAttribute("title"));
    expect(after).toHaveLength(before.length - 1);
    expect(after).toEqual(before.filter((_, i) => i !== 2));
  });

  it("accepts a drop while nothing is selected", () => {
    // The regression this guards: a `disabled` trash gets no mouse events in
    // Chrome, so it silently refuses drops in exactly the common case.
    setup();
    expect(trash()).not.toBeDisabled();
    const before = swatches().length;
    act(() => dragSwatchToTrash(0));
    expect(swatches()).toHaveLength(before - 1);
  });

  it("marks the trash unavailable for clicking until swatches are selected", () => {
    setup();
    expect(trash()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(swatches()[1], { metaKey: true });
    expect(trash()).toHaveAttribute("aria-disabled", "false");
  });

  it("ignores a click while nothing is selected", () => {
    setup();
    const before = swatches().length;
    fireEvent.click(trash());
    expect(swatches()).toHaveLength(before);
  });

  it("removes exactly the selected swatches when clicked", () => {
    setup();
    const before = swatches().map((s) => s.getAttribute("title"));
    fireEvent.click(swatches()[0], { metaKey: true });
    fireEvent.click(swatches()[3], { metaKey: true });
    act(() => {
      fireEvent.click(trash());
    });
    const after = swatches().map((s) => s.getAttribute("title"));
    expect(after).toEqual(before.filter((_, i) => i !== 0 && i !== 3));
  });

  it("explains the selection gesture on the grid trash", () => {
    setup();
    expect(trash().getAttribute("title")).toMatch(/drag/i);
    expect(trash().getAttribute("title")).toMatch(/click/i);
  });

  it("says which of its two jobs the footer trash will do", () => {
    setup();
    const footer = () => screen.getByRole("button", { name: /delete palette/i });
    expect(footer().getAttribute("title")).toMatch(/palette/i);

    fireEvent.click(swatches()[0], { metaKey: true });
    const withSelection = screen.getByRole("button", { name: /remove selected swatches/i });
    expect(withSelection.getAttribute("title")).toMatch(/selected swatches/i);
  });
});
