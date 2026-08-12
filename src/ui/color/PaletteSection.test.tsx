// src/ui/color/PaletteSection.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PaletteSection } from "./PaletteSection";
import {
  reloadPaletteStore,
  getSnapshot,
  removePalette,
  recordUsedColor,
} from "../../lib/palette-store";
import { RECENT_PALETTE_NAME } from "../../lib/color-palettes";

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

/** Drives the same `<select>` the "switches palettes" test above uses,
 *  resolved from a palette name to its id since the select's value is the id. */
function selectPalette(name: string) {
  const id = getSnapshot().palettes.find((p) => p.name === name)!.id;
  fireEvent.change(screen.getByLabelText("Palette"), { target: { value: id } });
}

/** The name shown in the `<select>` — i.e. the palette the panel is on. */
const currentPaletteName = () =>
  (screen.getByLabelText("Palette") as HTMLSelectElement).selectedOptions[0].textContent;

/** Everything the gear can do now lives behind this one button. */
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Palette actions" }));

const trash = () => screen.getByRole("button", { name: "Delete swatches" });
const swatches = () => screen.getAllByRole("button", { name: /^swatch /i });
/** The tile's `title` is the bare hex; its aria-label is `Swatch <hex>`. */
const firstSwatchHex = () => swatches()[0].getAttribute("title")!;
const selectFirstSwatch = () => fireEvent.click(swatches()[0], { metaKey: true });

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

  it("selects a swatch for deletion with a modifier click and removes it", () => {
    setup();
    const first = swatches()[0];
    const before = swatches().length;
    fireEvent.click(first, { metaKey: true });
    expect(first).toHaveAttribute("aria-pressed", "true");
    act(() => {
      fireEvent.click(trash());
    });
    expect(swatches()).toHaveLength(before - 1);
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

  it("reseeds a fresh palette after deleting the last one", () => {
    setup();
    // Whittle the store down to a single palette directly, then delete that
    // last one through the UI's confirm flow.
    const ids = getSnapshot().palettes.map((p) => p.id);
    act(() => {
      for (const id of ids.slice(1)) removePalette(id);
    });
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete palette…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(getSnapshot().palettes).toHaveLength(1);
    // The select still resolves to a real, selected option — no crash, no
    // dangling reference to the palette that was just removed.
    const select = screen.getByLabelText("Palette") as HTMLSelectElement;
    expect(select.options).toHaveLength(1);
    expect(select.selectedOptions).toHaveLength(1);
  });

  it("has no set-as-default control", () => {
    setup();
    expect(screen.queryByRole("button", { name: /default/i })).not.toBeInTheDocument();
  });

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

  it("does not let a cancelled drag strand an index the trash would later honour", () => {
    // dragStart sets dragFrom.current but it was only ever cleared inside the
    // two onDrop handlers. A drag released over the canvas or cancelled with
    // Escape fires dragend on the source without either onDrop ever running,
    // so dragFrom.current stays pointed at a real swatch indefinitely — the
    // next drop on the trash, from anywhere, would then delete that stale
    // swatch. dragend fires on the source whether or not the drag succeeded,
    // so onDragEnd is where the ref must be cleared.
    setup();
    const before = swatches().length;
    fireEvent.dragStart(swatches()[0]);
    fireEvent.dragEnd(swatches()[0]);
    fireEvent.dragOver(trash());
    fireEvent.drop(trash());
    expect(swatches()).toHaveLength(before);
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
});

describe("the palette gear menu", () => {
  it("replaces the add and delete buttons", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Add palette" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete palette" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Palette actions" })).toBeInTheDocument();
  });

  it("renames through the dialog", () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("option", { name: "Renamed" })).toBeInTheDocument();
  });

  it("discards a rename on Cancel", () => {
    setup();
    const before = currentPaletteName();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(currentPaletteName()).toBe(before);
    expect(screen.queryByRole("option", { name: "Nope" })).not.toBeInTheDocument();
  });

  it("blocks OK on an all-whitespace name", () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("adds a palette AND switches to it", () => {
    // The `+` it replaces did both; adding without switching would be a
    // silent regression, since the new palette is empty and invisible.
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(currentPaletteName()).toBe("Fresh");
  });

  it("prefills Add with the next auto-name", () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    expect(screen.getByLabelText("Palette name")).toHaveValue("color set 1");
  });

  it("deletes the palette only after confirming", () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Add palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "Doomed" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete palette…" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("option", { name: "Doomed" })).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete palette…" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("option", { name: "Doomed" })).not.toBeInTheDocument();
  });

  it("deletes the selected swatches from the menu", () => {
    setup();
    selectFirstSwatch();
    const hex = firstSwatchHex();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete selected swatches" }));
    expect(screen.queryByRole("button", { name: `Swatch ${hex}` })).not.toBeInTheDocument();
  });

  it("closes the menu after an action", () => {
    setup();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    expect(screen.queryByRole("menu", { name: "Palette actions" })).not.toBeInTheDocument();
  });

  it("marks Delete palette inert for the Recent palette", () => {
    setup();
    selectPalette(RECENT_PALETTE_NAME);
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Delete palette…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("still lets the Recent palette be renamed", () => {
    // Only deletion is special. Rename must keep working — RECENT_PALETTE_ID
    // is fixed and migrateBuiltins exempts it, so a rename is safe.
    setup();
    selectPalette(RECENT_PALETTE_NAME);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename palette…" }));
    fireEvent.change(screen.getByLabelText("Palette name"), { target: { value: "My colors" } });
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.getByRole("option", { name: "My colors" })).toBeInTheDocument();
  });

  it("no longer renames on double-click", () => {
    setup();
    fireEvent.doubleClick(screen.getByLabelText("Palette"));
    expect(screen.queryByLabelText("Palette name")).not.toBeInTheDocument();
  });
});

describe("the Recent palette", () => {
  it("cannot be deleted", () => {
    setup();
    selectPalette(RECENT_PALETTE_NAME);
    openMenu();
    const item = screen.getByRole("menuitem", { name: "Delete palette…" });
    // NOT the native attribute: a disabled button cannot take focus, so a
    // keyboard user could never land on the item to learn why it is inert.
    // That makes the attribute advisory, which is why the click below has to
    // be answered by a handler guard rather than by the browser.
    expect(item).not.toBeDisabled();
    fireEvent.click(item);
    expect(screen.queryByRole("dialog", { name: "Delete palette" })).not.toBeInTheDocument();
  });

  it("still deletes selected swatches from the menu", () => {
    // Only the delete-palette item is inert — evicting a color you are sick
    // of must keep working on Recent like on any other palette.
    recordUsedColor("#123456");
    setup();
    selectPalette(RECENT_PALETTE_NAME);
    fireEvent.click(screen.getByRole("button", { name: "Swatch #123456" }), { ctrlKey: true });
    openMenu();
    const item = screen.getByRole("menuitem", { name: "Delete selected swatches" });
    expect(item).toHaveAttribute("aria-disabled", "false");
    fireEvent.click(item);
    expect(screen.queryByRole("button", { name: "Swatch #123456" })).not.toBeInTheDocument();
  });

  it("still accepts a hand-added swatch", () => {
    setup();
    selectPalette(RECENT_PALETTE_NAME);
    fireEvent.click(screen.getByRole("button", { name: "Add current color to palette" }));
    expect(screen.getAllByRole("button", { name: /^Swatch #/ })).toHaveLength(1);
  });

  it("leaves delete-palette live for every other palette", () => {
    setup();
    selectPalette("Pastel");
    openMenu();
    expect(screen.getByRole("menuitem", { name: "Delete palette…" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });
});
