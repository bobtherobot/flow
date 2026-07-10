// src/ui/panels/SwatchesPanel.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwatchesPanel } from "./SwatchesPanel";
import { reloadPaletteStore, getSnapshot } from "../../lib/palette-store";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/palette-store.test.ts
// and src/app/preferences.test.ts, which use this same in-memory mock for
// the identical reason). Without this stub, `localStorage.clear()` throws
// "not a function" — an environment gap, not a behavior change.
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

/** Add a color through the "+" tile → picker → hex Enter. */
function addColorViaPicker(hex: string) {
  fireEvent.click(screen.getByRole("button", { name: "Add swatch" }));
  const field = screen.getByLabelText("Swatch hex");
  fireEvent.change(field, { target: { value: hex } });
  fireEvent.keyDown(field, { key: "Enter" });
}

describe("SwatchesPanel", () => {
  it("adds a palette named 'color set 1', selects it, empties the grid", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    expect((screen.getByLabelText("Palette name") as HTMLInputElement).value).toBe("color set 1");
    // no swatch tiles yet (only the + tile)
    expect(screen.queryByRole("button", { name: /^Swatch / })).not.toBeInTheDocument();
  });

  it("adds a swatch via the + tile", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    addColorViaPicker("#0a0b0c");
    expect(screen.getByRole("button", { name: "Swatch #0a0b0c" })).toBeInTheDocument();
  });

  it("removes selected swatches with the context trash", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    addColorViaPicker("#111111");
    addColorViaPicker("#222222");
    fireEvent.click(screen.getByRole("button", { name: "Swatch #111111" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove selected swatches" }));
    expect(screen.queryByRole("button", { name: "Swatch #111111" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Swatch #222222" })).toBeInTheDocument();
  });

  it("deletes the palette only after confirming", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" })); // now 8 palettes
    const before = getSnapshot().palettes.length;
    fireEvent.click(screen.getByRole("button", { name: "Delete palette" }));
    // confirm appears
    expect(screen.getByText(/really want to delete/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(getSnapshot().palettes.length).toBe(before - 1);
  });

  it("renames on blur", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    const name = screen.getByLabelText("Palette name");
    fireEvent.change(name, { target: { value: "Brand" } });
    fireEvent.blur(name);
    expect(getSnapshot().palettes.some((p) => p.name === "Brand")).toBe(true);
  });

  it("sets the selected palette as default", () => {
    render(<SwatchesPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Add palette" }));
    const palettesAfterAdd = getSnapshot().palettes;
    const newId = palettesAfterAdd[palettesAfterAdd.length - 1].id;
    fireEvent.click(screen.getByRole("button", { name: "Set as default" }));
    expect(getSnapshot().defaultPaletteId).toBe(newId);
  });
});
