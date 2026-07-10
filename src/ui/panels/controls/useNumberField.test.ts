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
});
