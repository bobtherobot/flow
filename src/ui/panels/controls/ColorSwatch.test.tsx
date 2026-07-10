import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorSwatch } from "./ColorSwatch";
import { MIXED } from "../../../lib/selection-style";
import { reloadPaletteStore, setDefaultPalette, addPalette, addSwatch } from "../../../lib/palette-store";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/app/preferences.test.ts and
// src/lib/palette-store.test.ts, which use this same in-memory mock for the
// identical reason). Without this stub, `localStorage.clear()` throws
// "not a function" — an environment gap, not a behavior change to this task.
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

describe("ColorSwatch", () => {
  it("opens the picker and reports a preset choice", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    await userEvent.click(screen.getByRole("button", { name: "#e03131" }));
    expect(onChange).toHaveBeenCalledWith("#e03131");
  });

  it("commits a valid hex typed into the field", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    const hex = screen.getByLabelText("Stroke color hex");
    await userEvent.type(hex, "#abcdef{Enter}");
    expect(onChange).toHaveBeenCalledWith("#abcdef");
  });

  it("ignores an invalid hex", async () => {
    const onChange = vi.fn();
    render(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Stroke color" />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    await userEvent.type(screen.getByLabelText("Stroke color hex"), "nope{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers None only when transparent is allowed", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Background" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Background" }));
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();

    rerender(<ColorSwatch value="#1971c2" onChange={onChange} ariaLabel="Background" allowTransparent />);
    await userEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenCalledWith("transparent");
  });

  it("shows a mixed indicator without a solid background", () => {
    render(<ColorSwatch value={MIXED} onChange={() => {}} ariaLabel="Stroke color" />);
    const btn = screen.getByRole("button", { name: "Stroke color" });
    expect(btn).toHaveAttribute("title", "Mixed");
  });

  it("does not open when disabled", async () => {
    render(<ColorSwatch value="#1971c2" onChange={() => {}} ariaLabel="Stroke color" disabled />);
    await userEvent.click(screen.getByRole("button", { name: "Stroke color" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("ColorSwatch presets come from the default palette", () => {
  beforeEach(() => {
    localStorage.clear();
    reloadPaletteStore();
  });

  it("renders the default palette's colors as presets", () => {
    render(<ColorSwatch value="#111111" onChange={vi.fn()} ariaLabel="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" })); // open popover
    // "Default" seed includes #e03131
    expect(screen.getByRole("button", { name: "#e03131" })).toBeInTheDocument();
  });

  it("reflects a new default palette live", () => {
    const p = addPalette();
    addSwatch(p.id, "#0a0b0c");
    setDefaultPalette(p.id);
    render(<ColorSwatch value="#111111" onChange={vi.fn()} ariaLabel="Fill" />);
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(screen.getByRole("button", { name: "#0a0b0c" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "#e03131" })).not.toBeInTheDocument();
  });
});
