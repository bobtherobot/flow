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

    expect(onChange).toHaveBeenCalledWith(25);
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

    expect(onChange).toHaveBeenCalledWith(100);
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

    expect(onChange).toHaveBeenCalledWith(21);
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

  it("ArrowUp commits immediately, once, with the incremented value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowUp",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(21);
    expect(result.current.text).toBe("21");
  });

  it("ArrowDown commits immediately, once, with the decremented value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowDown",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(19);
    expect(result.current.text).toBe("19");
  });

  it("arrow stepping respects an explicit step and clamps at max", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 99.7, min: 0, max: 100, step: 0.5, onChange }),
    );

    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowUp",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

    // 99.7 + 0.5 = 100.2, clamped to 100, then snapped to the nearest 0.5 step.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(100);
    expect(result.current.text).toBe("100");
  });

  it("arrow stepping respects an explicit step and clamps at min", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 0.2, min: 0, max: 100, step: 0.5, onChange }),
    );

    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowDown",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(0);
    expect(result.current.text).toBe("0");
  });

  it("arrow stepping steps from the field's current (uncommitted) typed text, not the last committed value", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: 20, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() => result.current.onChange({ target: { value: "50" } } as any));
    act(() =>
      result.current.onKeyDown({
        key: "ArrowUp",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(51);
    expect(result.current.text).toBe("51");
  });

  it("an empty field with a null value does not commit on arrow keys", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useNumberField({ value: null, min: 5, max: 100, onChange }),
    );

    act(() => result.current.onFocus());
    act(() =>
      result.current.onKeyDown({
        key: "ArrowUp",
        preventDefault: () => {},
        currentTarget: {},
      } as any),
    );

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
});
