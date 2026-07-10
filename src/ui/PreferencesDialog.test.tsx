import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesDialog } from "./PreferencesDialog";

function setup(overrides = {}) {
  const onChangeSloppiness = vi.fn();
  const onChangeUnits = vi.fn();
  const onChangeSelectionMode = vi.fn();
  const onChangeGridSize = vi.fn();
  const onShowShortcuts = vi.fn();
  const onClose = vi.fn();
  render(
    <PreferencesDialog
      sloppiness={0}
      onChangeSloppiness={onChangeSloppiness}
      units="px"
      onChangeUnits={onChangeUnits}
      selectionMode="enclose"
      onChangeSelectionMode={onChangeSelectionMode}
      gridSize={20}
      onChangeGridSize={onChangeGridSize}
      onShowShortcuts={onShowShortcuts}
      onClose={onClose}
      {...overrides}
    />,
  );
  return {
    onChangeSloppiness,
    onChangeUnits,
    onChangeSelectionMode,
    onChangeGridSize,
    onShowShortcuts,
    onClose,
  };
}

describe("PreferencesDialog", () => {
  it("shows the General category with sloppiness options", () => {
    setup();
    expect(screen.getByRole("radio", { name: "Architect" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Artist" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Cartoonist" })).toBeInTheDocument();
  });

  it("fires onChangeSloppiness with the selected value", async () => {
    const { onChangeSloppiness } = setup();
    await userEvent.click(screen.getByRole("radio", { name: "Cartoonist" }));
    expect(onChangeSloppiness).toHaveBeenCalledWith(2);
  });

  it("shows the units selector and fires onChangeUnits", async () => {
    const { onChangeUnits } = setup();
    const select = screen.getByLabelText("Units");
    expect(select).toHaveValue("px");
    await userEvent.selectOptions(select, "mm");
    expect(onChangeUnits).toHaveBeenCalledWith("mm");
  });

  it("shows the marquee selection mode as radios and reflects the current mode", () => {
    setup({ selectionMode: "touch" });
    const group = screen.getByRole("radiogroup", { name: /marquee selection mode/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "marquee touch" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "marquee enclose" })).not.toBeChecked();
  });

  it("fires onChangeSelectionMode with the chosen mode", async () => {
    const { onChangeSelectionMode } = setup({ selectionMode: "enclose" });
    await userEvent.click(screen.getByRole("radio", { name: "marquee touch" }));
    expect(onChangeSelectionMode).toHaveBeenCalledWith("touch");
  });

  it("shows the grid-size input reflecting the current value", () => {
    setup({ gridSize: 40 });
    expect(screen.getByLabelText("Grid size")).toHaveValue(40);
  });

  it("does not commit while typing, only on blur", async () => {
    // Regression: the field must not clamp/commit per keystroke (which rewrote
    // the value mid-typing — e.g. "3" clamped to 5, then "0" made "50"). The
    // input is backed by the field hook's own text state, so typing accumulates.
    const user = userEvent.setup();
    const { onChangeGridSize } = setup();
    const input = screen.getByLabelText("Grid size");
    await user.clear(input);
    await user.type(input, "35");
    expect(onChangeGridSize).not.toHaveBeenCalled();
    await user.tab(); // blur commits
    expect(onChangeGridSize).toHaveBeenCalledWith(35);
  });

  it("commits the entered value on Enter", async () => {
    const user = userEvent.setup();
    const { onChangeGridSize } = setup();
    const input = screen.getByLabelText("Grid size");
    await user.clear(input);
    await user.type(input, "60{Enter}");
    expect(onChangeGridSize).toHaveBeenLastCalledWith(60);
  });

  it("clamps an out-of-range entry to the max on blur", async () => {
    const user = userEvent.setup();
    const { onChangeGridSize } = setup();
    const input = screen.getByLabelText("Grid size");
    await user.clear(input);
    await user.type(input, "500");
    await user.tab();
    expect(onChangeGridSize).toHaveBeenLastCalledWith(100);
  });

  it("switches to the Keyboard category and fires onShowShortcuts", async () => {
    const { onShowShortcuts } = setup();
    await userEvent.click(screen.getByRole("tab", { name: "Keyboard" }));
    await userEvent.click(screen.getByRole("button", { name: /show keyboard shortcuts/i }));
    expect(onShowShortcuts).toHaveBeenCalled();
  });

  it("closes on the Done button", async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalled();
  });
});
