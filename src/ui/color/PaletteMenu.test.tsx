import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteMenu } from "./PaletteMenu";

const ITEMS = [
  "Rename palette…",
  "Add palette…",
  "Delete palette…",
  "Delete selected swatches",
  "Copy selected swatches to…",
];

const handlers = () => ({
  onRename: vi.fn(),
  onAdd: vi.fn(),
  onDeletePalette: vi.fn(),
  onDeleteSwatches: vi.fn(),
  onCopy: vi.fn(),
  onClose: vi.fn(),
});

const setup = (over: Partial<React.ComponentProps<typeof PaletteMenu>> = {}) => {
  const h = handlers();
  render(
    <PaletteMenu
      anchor={{ top: 0, left: 0 }}
      hasSelection
      canDeletePalette
      canCopy
      {...h}
      {...over}
    />,
  );
  return h;
};

describe("PaletteMenu", () => {
  it("renders all five items in order", () => {
    setup();
    const items = screen.getAllByRole("menuitem").map((el) => el.textContent);
    expect(items).toEqual(ITEMS);
  });

  it.each([
    ["Rename palette…", "onRename"],
    ["Add palette…", "onAdd"],
    ["Delete palette…", "onDeletePalette"],
    ["Delete selected swatches", "onDeleteSwatches"],
    ["Copy selected swatches to…", "onCopy"],
  ] as const)("invokes %s", (label, key) => {
    const h = setup();
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
    expect(h[key]).toHaveBeenCalledTimes(1);
  });

  it("marks the swatch items inert with nothing selected", () => {
    setup({ hasSelection: false });
    for (const label of ["Delete selected swatches", "Copy selected swatches to…"]) {
      expect(screen.getByRole("menuitem", { name: label })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    }
  });

  it("does NOT invoke an inert item that is clicked anyway", () => {
    // aria-disabled is advisory — the element stays clickable, so the guard
    // has to be in the handler. Without it the menu would act on a swatch
    // selection that does not exist.
    const h = setup({ hasSelection: false });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete selected swatches" }));
    expect(h.onDeleteSwatches).not.toHaveBeenCalled();
  });

  it("uses aria-disabled, never the native attribute", () => {
    // Native `disabled` is unfocusable, so a keyboard user could not land on
    // the item to discover why it is unavailable.
    setup({ hasSelection: false });
    expect(screen.getByRole("menuitem", { name: "Delete selected swatches" })).not.toBeDisabled();
  });

  it("marks Delete palette inert when the palette cannot be deleted", () => {
    const h = setup({ canDeletePalette: false });
    const item = screen.getByRole("menuitem", { name: "Delete palette…" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(h.onDeletePalette).not.toHaveBeenCalled();
  });

  it("marks Copy inert when there is nowhere to copy to", () => {
    const h = setup({ canCopy: false });
    const item = screen.getByRole("menuitem", { name: "Copy selected swatches to…" });
    expect(item).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(item);
    expect(h.onCopy).not.toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const h = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on an outside pointer press", () => {
    const h = setup();
    fireEvent.pointerDown(document.body);
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on a press inside itself", () => {
    const h = setup();
    fireEvent.pointerDown(screen.getByRole("menu"));
    expect(h.onClose).not.toHaveBeenCalled();
  });

  it("ignores a press on the gear trigger, so the toggle's close branch stays reachable", () => {
    // The gear lives outside this portal. Without the `.closest` guard in the
    // pointerdown handler, a press on it would close the menu here, and the
    // click that follows would immediately reopen it — the toggle's close
    // branch would never be reachable.
    const h = handlers();
    render(
      <>
        <button className="flow-clr-palette__gear">gear</button>
        <PaletteMenu anchor={{ top: 0, left: 0 }} hasSelection canDeletePalette canCopy {...h} />
      </>,
    );
    fireEvent.pointerDown(screen.getByRole("button", { name: "gear" }));
    expect(h.onClose).not.toHaveBeenCalled();
  });
});
