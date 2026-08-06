import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
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

  it("scrubs the field body, emitting transient values then one commit", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    // span defaults to max-min = 100 → 15px of a 150px travel = +10.
    expect(onChange).toHaveBeenLastCalledWith(60, false);
    expect(onChange.mock.calls.filter(([, t]) => t === true).length).toBeGreaterThan(0);
  });

  it("honours an explicit scrubSpan over the min/max range", () => {
    const onChange = vi.fn();
    render(
      <NumberInput value={0} min={-1e6} max={1e6} scrubSpan={300} onChange={onChange} ariaLabel="X position" />,
    );
    const field = screen.getByLabelText("X position");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 250 });   // 50px → 300/150 × 50 = 100
    fireEvent.pointerUp(window, { clientY: 250 });
    expect(onChange).toHaveBeenLastCalledWith(100, false);
  });

  it("marks a mixed (null) value so the spin buttons are hidden with the scrub", () => {
    // There is no base value to step from, and stepping an empty field would
    // write an arbitrary one to the whole selection. The buttons themselves are
    // shadow DOM, so the class carrying the CSS is what there is to assert.
    const { container, rerender } = render(
      <NumberInput value={null} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    expect(container.querySelector(".flow-ctl-num")).toHaveClass("flow-ctl-num--mixed");
    rerender(<NumberInput value={20} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />);
    expect(container.querySelector(".flow-ctl-num")).not.toHaveClass("flow-ctl-num--mixed");
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
    const { unmount } = render(
      <NumberInput value={50} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />,
    );
    const field = screen.getByLabelText("Opacity");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 }); // a transient write is now outstanding
    markDeferred();
    unmount();
    // Without the cleanup this stays true and the next unrelated panel write
    // would skip the vendor's uncommitted-element filter.
    expect(consumeDeferred()).toBe(false);
  });

  it("does not scrub when disabled", () => {
    const onChange = vi.fn();
    render(
      <NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" disabled />,
    );
    const field = screen.getByLabelText("Opacity");
    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();
  });

  // The browser's spin buttons live in the input's shadow DOM, so jsdom can't
  // press them. What it *can* do is reproduce the event sequence they produce,
  // measured in Chromium: the value is set internally (bypassing React's value
  // tracker, hence the prototype setter), each step dispatches a plain `input`
  // Event — never the InputEvent typing produces — and one `change` fires when
  // the gesture ends.
  //
  // Engines disagree on the event, so both measured shapes are exercised:
  // Chromium sends a plain Event, Firefox an InputEvent saying
  // "insertReplacementText". Reading only the interface classified every
  // Firefox spin as typing — the field's digits moved and the object never did.
  const spinTo = (field: HTMLInputElement, next: string, engine: "chromium" | "firefox" = "chromium") => {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(field, next);
    fireEvent(
      field,
      engine === "firefox"
        ? new InputEvent("input", { bubbles: true, inputType: "insertReplacementText" })
        : new Event("input", { bubbles: true }),
    );
  };
  const endSpin = (field: HTMLInputElement) => fireEvent(field, new Event("change", { bubbles: true }));

  it("writes a spin-button step transiently and commits it when the gesture ends", () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;

    spinTo(field, "21");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(21, true); // canvas tracks it live
    expect(field).toHaveValue(21);

    endSpin(field);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenLastCalledWith(21, false); // one undo entry, on release
  });

  it("writes a Firefox spin-button step, which arrives as typing-shaped InputEvent", () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;

    spinTo(field, "21", "firefox");
    expect(onChange).toHaveBeenLastCalledWith(21, true);

    endSpin(field);
    expect(onChange).toHaveBeenLastCalledWith(21, false);
  });

  it("reads a step as a step while a press is held on the buttons, whatever the engine calls it", () => {
    // The engine-agnostic half of the detection: an engine whose inputType is
    // neither measured shape still steps, because the press was recognised.
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, left: 100, right: 164, top: 0, bottom: 24, width: 64, height: 24,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(field, { clientX: 156, clientY: 300, button: 0 }); // on the buttons
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setValue.call(field, "21");
    fireEvent(field, new InputEvent("input", { bubbles: true, inputType: "insertFromSomethingNew" }));

    expect(onChange).toHaveBeenLastCalledWith(21, true);
  });

  it("batches a held spin button's auto-repeat into a single commit", () => {
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;

    spinTo(field, "19");
    spinTo(field, "18");
    spinTo(field, "17");
    expect(onChange.mock.calls.filter(([, t]) => t === false)).toHaveLength(0);

    endSpin(field);
    const commits = onChange.mock.calls.filter(([, t]) => t === false);
    expect(commits).toHaveLength(1);
    expect(commits[0][0]).toBe(17);
  });

  it("clamps a spin-button step to the field's bounds", () => {
    const onChange = vi.fn();
    render(<NumberInput value={5} min={3} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;

    spinTo(field, "0");
    endSpin(field);
    expect(onChange).toHaveBeenLastCalledWith(3, false);
  });

  // A panel field is live: every transient write lands on the scene and comes
  // straight back as a new `value` prop. Anything that closes a gesture has to
  // survive that echo, which a static `value` in a test never exercises.
  function LiveField({ writes }: { writes: [number, boolean][] }) {
    const [v, setV] = useState(2);
    return (
      <NumberInput
        value={v}
        min={0}
        max={10}
        step={0.5}
        ariaLabel="Stroke width"
        onChange={(n, transient) => {
          writes.push([n, transient]);
          setV(n);
        }}
      />
    );
  }

  it("commits a spin gesture even though its transient writes already moved the value", () => {
    // The closing write is what captures history — its job is the capture, not
    // the number, which the transient writes already applied. Skipping it as a
    // no-op leaves the scene advanced past a stale snapshot and the gesture
    // unundoable. SliderInput commits its gesture unconditionally for exactly
    // this reason.
    const writes: [number, boolean][] = [];
    render(<LiveField writes={writes} />);
    const field = screen.getByLabelText("Stroke width") as HTMLInputElement;

    spinTo(field, "2.5");
    endSpin(field);

    expect(writes).toEqual([
      [2.5, true],
      [2.5, false],
    ]);
  });

  it("commits a held arrow key even though its transient writes already moved the value", () => {
    const writes: [number, boolean][] = [];
    render(<LiveField writes={writes} />);
    const field = screen.getByLabelText("Stroke width");
    field.focus();

    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyUp(field, { key: "ArrowUp" });

    expect(writes).toEqual([
      [2.5, true],
      [3, true],
      [3, false],
    ]);
  });

  it("releases the deferred-commit bit if it unmounts mid-step", () => {
    const { unmount } = render(
      <NumberInput value={20} min={1} max={999} onChange={() => {}} ariaLabel="Font size value" />,
    );
    const field = screen.getByLabelText("Font size value") as HTMLInputElement;

    spinTo(field, "21"); // a transient write is now outstanding
    markDeferred();
    unmount(); // the gesture never reaches its commit
    expect(consumeDeferred()).toBe(false);
  });

  it("still defers typed input to Enter or blur", async () => {
    // The spin-button path must not swallow typing: the two arrive on the same
    // React onChange and are told apart only by the native event.
    const onChange = vi.fn();
    render(<NumberInput value={20} min={1} max={999} onChange={onChange} ariaLabel="Font size value" />);
    const field = screen.getByLabelText("Font size value");
    await userEvent.clear(field);
    await userEvent.type(field, "24");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a press on the spin buttons to the browser instead of scrubbing", () => {
    const onChange = vi.fn();
    render(<NumberInput value={50} min={0} max={100} onChange={onChange} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;
    // jsdom has no layout; give the field its real 64px so the hit test has a
    // right edge to measure from.
    vi.spyOn(field, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 0, left: 100, right: 164, top: 0, bottom: 24, width: 64, height: 24,
      toJSON: () => ({}),
    });

    // Inside the spin buttons: arming the scrub here would preventDefault and
    // suppress the browser's own stepping.
    fireEvent.pointerDown(field, { clientX: 156, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).not.toHaveBeenCalled();

    // Clear of them, the body still scrubs.
    fireEvent.pointerDown(field, { clientX: 110, clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 285 });
    fireEvent.pointerUp(window, { clientY: 285 });
    expect(onChange).toHaveBeenLastCalledWith(60, false);
  });

  it("suppresses wheel stepping while the field is focused", () => {
    // Chromium steps a focused number input on wheel. In a scrollable dock that
    // edits values by accident, and the step's commit wouldn't arrive until
    // blur — leaving the deferred-commit bit set across unrelated writes.
    render(<NumberInput value={50} min={0} max={100} onChange={() => {}} ariaLabel="Opacity" />);
    const field = screen.getByLabelText("Opacity") as HTMLInputElement;

    const scrolled = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    field.dispatchEvent(scrolled);
    expect(scrolled.defaultPrevented).toBe(false); // unfocused: the dock scrolls

    field.focus();
    const stepped = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    field.dispatchEvent(stepped);
    expect(stepped.defaultPrevented).toBe(true);
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
