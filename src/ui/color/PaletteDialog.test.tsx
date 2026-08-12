import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaletteDialog } from "./PaletteDialog";

const setup = (over: Partial<React.ComponentProps<typeof PaletteDialog>> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <PaletteDialog
      title="Rename palette"
      confirmLabel="OK"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...over}
    >
      <input aria-label="Palette name" defaultValue="Pastel" />
    </PaletteDialog>,
  );
  return { onConfirm, onCancel };
};

describe("PaletteDialog", () => {
  it("renders as a labelled dialog with its children", () => {
    setup();
    const dialog = screen.getByRole("dialog", { name: "Rename palette" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Palette name")).toBeInTheDocument();
  });

  it("portals out of its parent so a transformed ancestor cannot trap it", () => {
    // PaletteSection sits inside a draggable dock panel; a position:fixed
    // backdrop resolves against the nearest transformed ancestor, not the
    // viewport. jsdom does no layout, so this asserts the portal itself —
    // the only part of that guarantee a unit test can see.
    const { container } = render(
      <PaletteDialog title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <span>body</span>
      </PaletteDialog>,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.getByRole("dialog", { name: "T" })).toBeInTheDocument();
  });

  it("confirms from the confirm button", () => {
    const { onConfirm } = setup();
    fireEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("cancels from the Cancel button", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const { onCancel } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on a backdrop click", () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByTestId("palette-dialog-backdrop"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT cancel when the click started inside the dialog", () => {
    // A click that begins on the dialog body and ends on the backdrop (a
    // drag-select in the name field that overshoots) must not be read as a
    // backdrop dismissal — that would discard the user's typing.
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole("dialog", { name: "Rename palette" }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("submits on Enter inside the body", () => {
    const { onConfirm } = setup();
    fireEvent.submit(screen.getByTestId("palette-dialog-form"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uses the NATIVE disabled attribute on the confirm button", () => {
    // Not aria-disabled: .flow-btn:disabled already exists in dialogs.css and
    // this is neither a menu item nor a drop target. The two aria-disabled
    // rules elsewhere in this feature exist for reasons that do not apply here.
    setup({ confirmDisabled: true });
    expect(screen.getByRole("button", { name: "OK" })).toBeDisabled();
  });

  it("does not confirm on Enter while the confirm button is disabled", () => {
    const { onConfirm } = setup({ confirmDisabled: true });
    fireEvent.submit(screen.getByTestId("palette-dialog-form"));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
