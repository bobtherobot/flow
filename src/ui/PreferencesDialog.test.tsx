import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PreferencesDialog } from "./PreferencesDialog";

function setup(overrides = {}) {
  const onChangeSloppiness = vi.fn();
  const onChangeUnits = vi.fn();
  const onChangeSelectionMode = vi.fn();
  const onChangePastePosition = vi.fn();
  const onChangeGridSize = vi.fn();
  const onChangeGridColor = vi.fn();
  const onChangeLaserColor = vi.fn();
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
      pastePosition="original"
      onChangePastePosition={onChangePastePosition}
      gridSize={20}
      onChangeGridSize={onChangeGridSize}
      gridColor="#dddddd"
      onChangeGridColor={onChangeGridColor}
      laserColor="#ff0000"
      onChangeLaserColor={onChangeLaserColor}
      onShowShortcuts={onShowShortcuts}
      onClose={onClose}
      {...overrides}
    />,
  );
  return {
    onChangeSloppiness,
    onChangeUnits,
    onChangeSelectionMode,
    onChangePastePosition,
    onChangeGridSize,
    onChangeGridColor,
    onChangeLaserColor,
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

  it("shows every paste position and reflects the current one", () => {
    setup({ pastePosition: "offset" });
    expect(screen.getByRole("radio", { name: /Offset \d+px from original/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "At mouse pointer" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Center of view" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Same position as original" })).toBeInTheDocument();
  });

  it("fires onChangePastePosition with the chosen mode", async () => {
    const { onChangePastePosition } = setup({ pastePosition: "original" });
    await userEvent.click(screen.getByRole("radio", { name: "Center of view" }));
    expect(onChangePastePosition).toHaveBeenCalledWith("viewport");
  });

  it("keeps the paste-position radios in their own group, apart from sloppiness", async () => {
    // Both are plain radio fieldsets in the same panel; a shared `name` would
    // make choosing a paste position silently clear the sloppiness choice.
    const { onChangeSloppiness } = setup({ sloppiness: 0, pastePosition: "original" });
    await userEvent.click(screen.getByRole("radio", { name: "At mouse pointer" }));
    expect(onChangeSloppiness).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Architect" })).toBeChecked();
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

  it("keeps the label associated with the grid size field", () => {
    setup();
    expect(screen.getByLabelText("Grid size")).toHaveValue(20);
  });

  it("scrubs the grid size, snapped to the step", () => {
    const { onChangeGridSize } = setup();
    // By label, not `.flow-ctl-num__input` — the panel has more than one now.
    const field = screen.getByLabelText("Grid size");

    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    // span 95 over 150px → 20px = +12.67, from 20 → 32.67.
    // Snapped to step 5 that is 35; with a step of 1 it would be 33. The two
    // must diverge, or the test cannot tell a forwarded step from the default.
    fireEvent.pointerMove(window, { clientY: 280 });
    fireEvent.pointerUp(window, { clientY: 280 });

    expect(onChangeGridSize).toHaveBeenLastCalledWith(35);
  });

  it("shows the grid color swatch reflecting the current value", () => {
    setup();
    expect(screen.getByRole("button", { name: "Grid color" })).toHaveAttribute(
      "title",
      "#dddddd",
    );
  });

  it("fires onChangeGridColor with a hex committed from the picker", async () => {
    const { onChangeGridColor } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Grid color" }));
    const hex = screen.getByLabelText("Grid color hex");
    await userEvent.type(hex, "#3366aa");
    fireEvent.blur(hex);
    expect(onChangeGridColor).toHaveBeenCalledWith("#3366aa");
  });

  it("shows the laser swatch and opacity reflecting the current color", () => {
    setup({ laserColor: "#2f9e44cc" });
    expect(screen.getByRole("button", { name: "Laser color" })).toHaveAttribute(
      "title",
      "#2f9e44",
    );
    expect(screen.getByLabelText("Laser opacity")).toHaveValue(80);
  });

  it("fires onChangeLaserColor with the picked hue, preserving opacity", async () => {
    const { onChangeLaserColor } = setup({ laserColor: "#ff000080" });
    await userEvent.click(screen.getByRole("button", { name: "Laser color" }));
    // A preset from the default (Pastel) palette the picker seeds itself with.
    await userEvent.click(screen.getByRole("button", { name: "#a9def9" }));
    expect(onChangeLaserColor).toHaveBeenCalledWith("#a9def980");
  });

  it("fires onChangeLaserColor with the combined hex when opacity changes", async () => {
    const user = userEvent.setup();
    const { onChangeLaserColor } = setup({ laserColor: "#ff0000" });
    const opacity = screen.getByLabelText("Laser opacity");
    await user.clear(opacity);
    await user.type(opacity, "50");
    await user.tab();
    expect(onChangeLaserColor).toHaveBeenLastCalledWith("#ff000080");
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
