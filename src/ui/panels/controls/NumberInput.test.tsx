import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberInput } from "./NumberInput";
import { markDeferred, consumeDeferred } from "../../../lib/deferred-commit";

describe("NumberInput", () => {
  it("shows the current value and unit", () => {
    render(<NumberInput value={20} unit="px" onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(20);
    expect(screen.getByText("px")).toBeInTheDocument();
  });

  it("renders an empty field for a mixed (null) value", () => {
    render(<NumberInput value={null} onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(null);
  });

  it("does not commit while typing, only on Enter", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    expect(onChange).not.toHaveBeenCalled(); // still editing
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(24, false);
  });

  it("commits on blur", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(24, false);
  });

  it("clamps below the minimum on commit", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "0{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(1, false);
  });

  it("reverts to the current value on Escape without committing", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "99{Escape}");
    expect(onChange).not.toHaveBeenCalled();
    expect(field).toHaveValue(20);
  });

  it("batches a held ArrowUp into one commit: N transient writes, then a single non-transient commit on keyUp", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    field.focus();

    // Simulate the browser auto-repeating keydown with no interleaved keyup
    // while the key stays physically held, then the single keyup on release.
    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyDown(field, { key: "ArrowUp" });

    const transientCalls = onChange.mock.calls.filter(([, transient]) => transient === true);
    const commitCallsBeforeRelease = onChange.mock.calls.filter(([, transient]) => transient === false);
    expect(transientCalls).toHaveLength(3);
    expect(commitCallsBeforeRelease).toHaveLength(0);

    fireEvent.keyUp(field, { key: "ArrowUp" });

    const commitCalls = onChange.mock.calls.filter(([, transient]) => transient === false);
    expect(commitCalls).toHaveLength(1);
    expect(commitCalls[0][0]).toBe(23);
  });

  it("a single ArrowUp tap commits exactly once", async () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    field.focus();

    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyUp(field, { key: "ArrowUp" });

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]).toEqual([21, true]);
    expect(onChange.mock.calls[1]).toEqual([21, false]);
  });

  it("reflects an external value change when not focused", () => {
    const { rerender } = render(<NumberInput value={20} onChange={() => {}} ariaLabel="Font size value" />);
    rerender(<NumberInput value={28} onChange={() => {}} ariaLabel="Font size value" />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(28);
  });

  it("disables the input when disabled", () => {
    render(<NumberInput value={20} onChange={() => {}} ariaLabel="Font size value" disabled />);
    expect(screen.getByLabelText("Font size value")).toBeDisabled();
  });

  it("renders a scrub grip when the bounds give it a span", () => {
    const { container } = render(
      <NumberInput value={20} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip");
    expect(grip).toBeInTheDocument();
    // The input is the accessible control; the grip is decoration.
    expect(grip).toHaveAttribute("aria-hidden", "true");
  });

  it("renders no grip when the bounds are infinite and no span is given", () => {
    const { container } = render(
      <NumberInput value={20} onChange={() => {}} ariaLabel="Opacity" />,
    );
    expect(container.querySelector(".flow-ctl-num__grip")).not.toBeInTheDocument();
  });

  it("renders no grip for a mixed (null) value even with a finite span", () => {
    // useScrubDrag refuses to start a gesture when value is null, so a grip
    // here would advertise a drag the field won't perform.
    const { container } = render(
      <NumberInput value={null} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    expect(container.querySelector(".flow-ctl-num__grip")).not.toBeInTheDocument();
  });

  it("scrubs from the grip, emitting transient values then one commit", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    // span defaults to max-min = 100 → 15px of a 150px travel = +10.
    expect(onChange).toHaveBeenLastCalledWith(60, false);
    expect(onChange.mock.calls.filter(([, t]) => t === true).length).toBeGreaterThan(0);
  });

  it("honours an explicit scrubSpan over the min/max range", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={0} min={-1e6} max={1e6} scrubSpan={300} onChange={onChange} ariaLabel="X position" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 250 });   // 50px → 300/150 × 50 = 100
    fireEvent.pointerUp(window, { clientY: 250 });
    expect(onChange).toHaveBeenLastCalledWith(100, false);
  });

  it("scrubs from the field body while it is unfocused", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).toHaveBeenLastCalledWith(60, false);
  });

  it("yields the field body to text selection once focused", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;
    field.focus();
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("focuses and selects the field for a press that never became a drag", () => {
    render(<NumberInput value={50} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;
    // `type="number"` inputs don't expose selectionStart/End — spy on select()
    // rather than asserting a selection range that throws for this input type.
    const select = vi.spyOn(field, "select");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerUp(window, { clientY: 300 });
    expect(field).toHaveFocus();
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("releases the deferred-commit bit if it unmounts mid-scrub", () => {
    const { container, unmount } = render(
      <NumberInput value={50} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 }); // a transient write is now outstanding
    markDeferred();
    unmount();
    // Without the cleanup this stays true and the next unrelated panel write
    // would skip the vendor's uncommitted-element filter.
    expect(consumeDeferred()).toBe(false);
  });

  it("does not scrub when disabled", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" disabled />,
    );
    const grip = container.querySelector(".flow-ctl-num__grip")!;
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("applies an external id and className", () => {
    const { container } = render(
      <NumberInput value={20} min={5} max={100} id="grid-size" className="flow-num__control"
                   onChange={() => {}} ariaLabel="Grid size" />,
    );
    expect(screen.getByLabelText("Grid size")).toHaveAttribute("id", "grid-size");
    expect(container.querySelector(".flow-ctl-num")).toHaveClass("flow-num__control");
  });
});
