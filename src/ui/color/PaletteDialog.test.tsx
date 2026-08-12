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

  it("returns focus to whatever was focused when it opened", () => {
    render(<button>opener</button>);
    const opener = screen.getByRole("button", { name: "opener" });
    opener.focus();

    const { unmount } = render(
      <PaletteDialog title="T" confirmLabel="OK" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <span>body</span>
      </PaletteDialog>,
    );
    unmount();

    expect(document.activeElement).toBe(opener);
  });

  it("focuses the first focusable element in the body on open", () => {
    setup();
    expect(document.activeElement).toBe(screen.getByLabelText("Palette name"));
  });

  it("focuses the dialog container when the body has no focusable element", () => {
    // Task 4's delete-confirm dialog body is a bare <p> — nothing in it can
    // take focus, so the dialog itself (tabIndex=-1) is the fallback target
    // rather than skipping straight to the footer's Cancel/OK buttons.
    render(
      <PaletteDialog title="Delete palette" confirmLabel="Delete" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <p>This will permanently delete the palette.</p>
      </PaletteDialog>,
    );
    expect(document.activeElement).toBe(screen.getByRole("dialog", { name: "Delete palette" }));
  });

  it("does not steal focus from an autoFocus child in the body", () => {
    render(
      <PaletteDialog title="Copy to" confirmLabel="Copy" onConfirm={vi.fn()} onCancel={vi.fn()}>
        <select aria-label="Target palette" autoFocus>
          <option>Pastel</option>
        </select>
      </PaletteDialog>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Target palette"));
  });

  it("wraps Tab from the last focusable element to the first", () => {
    setup();
    const input = screen.getByLabelText("Palette name");
    const okButton = screen.getByRole("button", { name: "OK" });
    okButton.focus();
    fireEvent.keyDown(okButton, { key: "Tab" });
    expect(document.activeElement).toBe(input);
  });

  it("wraps Shift+Tab from the first focusable element to the last", () => {
    setup();
    const input = screen.getByLabelText("Palette name");
    const okButton = screen.getByRole("button", { name: "OK" });
    input.focus();
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(okButton);
  });
});
