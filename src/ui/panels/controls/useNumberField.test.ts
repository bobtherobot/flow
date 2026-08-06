import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useNumberField } from "./useNumberField";

describe("useNumberField", () => {
  it("snaps a typed in-range value up to the nearest step on commit", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, step: 5, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "23" } } as any));
    act(() => result.current.onBlur());

    expect(onChange).toHaveBeenCalledWith(25, false);
    expect(result.current.text).toBe("25");
  });

  it("does not fire onChange when the snapped value equals the current committed value (stale-display fix)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, step: 5, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "21" } } as any));
    act(() => result.current.onBlur());

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe("20");
  });

  it("clamps an out-of-range value to max on commit", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, step: 5, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "500" } } as any));
    act(() => result.current.onBlur());

    expect(onChange).toHaveBeenCalledWith(100, false);
    expect(result.current.text).toBe("100");
  });

  it("without step, commits the raw clamped value with no snapping", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "21" } } as any));
    act(() => result.current.onBlur());

    expect(onChange).toHaveBeenCalledWith(21, false);
    expect(result.current.text).toBe("21");
  });

  it("does not commit while typing — onChange only fires on blur/Enter, not per keystroke", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "2" } } as any));
    act(() => result.current.onChange({ target: { value: "27" } } as any));

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe("27");
  });

  it("Escape reverts the displayed text and does not commit", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "99" } } as any));
    act(() =>
      result.current.onKeyDown({
        key: "Escape",
        currentTarget: { blur: () => act(() => result.current.onBlur()) },
      } as any),
    );

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe("20");
  });

  // Helper matching what a real <input> does: ArrowUp/ArrowDown fire keydown
  // (once per tap, N times while auto-repeating during a hold) then exactly
  // one keyup when the physical key is released.
  const arrowKeyDown = (result: { current: { onKeyDown: (e: any) => void } }, keyName: "ArrowUp" | "ArrowDown") =>
    act(() =>
      result.current.onKeyDown({
        key: keyName,
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );
  const arrowKeyUp = (result: { current: { onKeyUp: (e: any) => void } }) =>
    act(() => result.current.onKeyUp({ key: "ArrowUp" } as any));

  it("ArrowUp writes transiently on keydown, then commits once on keyUp, with the incremented value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(21, true);
    expect(result.current.text).toBe("21");

    arrowKeyUp(result);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(2, 21, false);
  });

  it("ArrowDown writes transiently on keydown, then commits once on keyUp, with the decremented value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowDown");

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(19, true);
    expect(result.current.text).toBe("19");

    arrowKeyUp(result);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(2, 19, false);
  });

  it("a held ArrowUp (repeated keydown with no intervening keyUp) writes N transients and exactly one commit — one undo entry per hold", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    // The browser auto-repeats keydown without a matching keyup while the key
    // stays physically down — simulate 3 repeats before the eventual release.
    arrowKeyDown(result, "ArrowUp");
    arrowKeyDown(result, "ArrowUp");
    arrowKeyDown(result, "ArrowUp");

    const transientCalls = onChange.mock.calls.filter(([, transient]) => transient === true);
    const commitCalls = onChange.mock.calls.filter(([, transient]) => transient === false);
    expect(transientCalls).toHaveLength(3);
    expect(transientCalls.map(([v]) => v)).toEqual([21, 22, 23]);
    expect(commitCalls).toHaveLength(0); // no keyup yet — nothing committed

    arrowKeyUp(result);

    const commitCallsAfterRelease = onChange.mock.calls.filter(([, transient]) => transient === false);
    expect(commitCallsAfterRelease).toHaveLength(1); // exactly one commit for the whole hold
    expect(commitCallsAfterRelease[0][0]).toBe(23);
    expect(result.current.text).toBe("23");
  });

  it("a single tap (one keydown, one keyup) produces exactly one transient write and one commit", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp");
    arrowKeyUp(result);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]).toEqual([21, true]);
    expect(onChange.mock.calls[1]).toEqual([21, false]);
  });

  it("a second keyUp with nothing pending does not re-commit (guards against double-commit)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp");
    arrowKeyUp(result);
    arrowKeyUp(result); // stray/duplicate keyup — must be a no-op

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("arrow stepping respects an explicit step and clamps at max", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 99.7, min: 0, max: 100, step: 0.5, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp");
    arrowKeyUp(result);

    // 99.7 + 0.5 = 100.2, clamped to 100, then snapped to the nearest 0.5 step.
    expect(onChange).toHaveBeenCalledWith(100, true);
    expect(onChange).toHaveBeenLastCalledWith(100, false);
    expect(result.current.text).toBe("100");
  });

  it("arrow stepping respects an explicit step and clamps at min", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 0.2, min: 0, max: 100, step: 0.5, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowDown");
    arrowKeyUp(result);

    expect(onChange).toHaveBeenCalledWith(0, true);
    expect(onChange).toHaveBeenLastCalledWith(0, false);
    expect(result.current.text).toBe("0");
  });

  it("arrow stepping steps from the field's current (uncommitted) typed text, not the last committed value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "50" } } as any));
    arrowKeyDown(result, "ArrowUp");
    arrowKeyUp(result);

    expect(onChange).toHaveBeenCalledWith(51, true);
    expect(onChange).toHaveBeenLastCalledWith(51, false);
    expect(result.current.text).toBe("51");
  });

  it("an empty field with a null value does not commit on arrow keys", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: null, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp");
    arrowKeyUp(result);

    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.text).toBe("");
  });

  it("ArrowUp/ArrowDown call preventDefault so the native number-input step doesn't double-apply", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    const preventDefault = vi.fn();
    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowUp",
        preventDefault,
        currentTarget: {},
      } as any),
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("Escape during a held arrow key closes out the pending transient via the forced blur instead of leaking it", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    arrowKeyDown(result, "ArrowUp"); // one transient step outstanding, no keyup yet
    act(() =>
      result.current.onKeyDown({
        key: "Escape",
        currentTarget: { blur: () => act(() => result.current.onBlur()) },
      } as any),
    );

    // The canvas already reflects the transient step, so the forced blur must
    // close it out with a real commit rather than dropping it uncommitted.
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0]).toEqual([21, true]);
    expect(onChange.mock.calls[1]).toEqual([21, false]);
  });
});
