import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { StrokePanel } from "./StrokePanel";
import type { SelectionStyle } from "./useSelectionStyle";

function mockSel(over: Record<string, unknown> = {}): SelectionStyle {
  return {
    elements: [],
    appState: null,
    selectedIds: {},
    textTargetIds: {},
    hasSelection: false,
    selectedCount: 0,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

type El = Record<string, unknown> & { id: string; type: string };

const shape = (over: Partial<El> = {}): El => ({
  id: "a",
  type: "rectangle",
  width: 200,
  height: 100,
  ...over,
});

/** A selection mock whose `update` spy the radius assertions read back. */
function selWith(elements: El[], selectedIds: Record<string, boolean>) {
  const update = vi.fn();
  const sel = mockSel({ elements, selectedIds, hasSelection: true, update });
  return { sel, update };
}

describe("StrokePanel", () => {
  it("offers a 0-10px stroke width range", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    const width = screen.getByLabelText("Stroke width");
    expect(width).toHaveAttribute("min", "0");
    expect(width).toHaveAttribute("max", "10");
    expect(screen.queryByRole("slider", { name: "Stroke width" })).not.toBeInTheDocument();
  });

  it("falls back to the 2px app default before appState is available", () => {
    render(<StrokePanel sel={mockSel()} units="px" />);
    expect(screen.getByLabelText("Stroke width")).toHaveValue(2);
  });

  it("shows the selected element's width over the fallback", () => {
    const sel = mockSel({
      elements: [{ id: "a", type: "rectangle", strokeWidth: 7 }],
      selectedIds: { a: true },
      hasSelection: true,
    });
    render(<StrokePanel sel={sel} units="px" />);
    expect(screen.getByLabelText("Stroke width")).toHaveValue(7);
  });

  describe("corner radius", () => {
    it("is disabled with no selection and for a shape it can't round", () => {
      const { unmount } = render(<StrokePanel sel={mockSel()} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toBeDisabled();
      unmount();

      const { sel } = selWith([shape({ type: "ellipse" })], { a: true });
      render(<StrokePanel sel={sel} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toBeDisabled();
    });

    it("stays enabled when only some of a multi-selection can be rounded", () => {
      const { sel } = selWith([shape(), shape({ id: "b", type: "ellipse" })], {
        a: true,
        b: true,
      });
      render(<StrokePanel sel={sel} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toBeEnabled();
    });

    it("shows the shared radius, and blanks when the selection disagrees", () => {
      const same = selWith([shape({ cornerRadius: 12 }), shape({ id: "b", cornerRadius: 12 })], {
        a: true,
        b: true,
      });
      const { unmount } = render(<StrokePanel sel={same.sel} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toHaveValue(12);
      unmount();

      const differ = selWith([shape({ cornerRadius: 12 }), shape({ id: "b", cornerRadius: 4 })], {
        a: true,
        b: true,
      });
      render(<StrokePanel sel={differ.sel} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toHaveValue(null);
    });

    it("shows an elbow arrow's default radius", () => {
      const { sel } = selWith([shape({ type: "arrow", elbowed: true })], { a: true });
      render(<StrokePanel sel={sel} units="px" />);
      expect(screen.getByLabelText("Corner radius")).toHaveValue(16);
    });

    it("writes to every applicable element in one update, skipping the rest", async () => {
      const user = userEvent.setup();
      const { sel, update } = selWith(
        [
          shape(),
          shape({ id: "b", type: "ellipse" }),
          shape({ id: "c", type: "arrow", elbowed: true }),
        ],
        { a: true, b: true, c: true },
      );
      render(<StrokePanel sel={sel} units="px" />);

      const radius = screen.getByLabelText("Corner radius");
      await user.clear(radius);
      await user.type(radius, "8{Enter}");

      expect(update).toHaveBeenCalledTimes(1);
      const [ids, updater] = update.mock.lastCall!;
      expect(ids).toEqual({ a: true, c: true }); // the ellipse is left out
      // Rectangles need the companion roundness write; elbow arrows don't.
      expect(updater(shape())).toEqual({ cornerRadius: 8, roundness: { type: 2 } });
      expect(updater(shape({ type: "arrow", elbowed: true }))).toEqual({ cornerRadius: 8 });
    });

    it("clears a rectangle back to sharp at 0", async () => {
      const user = userEvent.setup();
      const { sel, update } = selWith([shape({ cornerRadius: 20 })], { a: true });
      render(<StrokePanel sel={sel} units="px" />);

      const radius = screen.getByLabelText("Corner radius");
      await user.clear(radius);
      await user.type(radius, "0{Enter}");

      const [, updater] = update.mock.lastCall!;
      expect(updater(shape())).toEqual({ cornerRadius: 0, roundness: null });
    });

    it("scrubs with a 200-unit span, deferring history until release", () => {
      const { sel, update } = selWith([shape()], { a: true });
      const { container } = render(<StrokePanel sel={sel} units="px" />);
      // Field order: stroke width, then radius.
      const field = container.querySelectorAll(".flow-ctl-num__input")[1];

      fireEvent.pointerDown(field, { clientY: 300, button: 0 });
      fireEvent.pointerMove(window, { clientY: 285 }); // 15px × (200/150) = +20
      fireEvent.pointerUp(window, { clientY: 285 });

      const flags = update.mock.calls.map((call) => call[3]);
      expect(flags.length).toBeGreaterThan(1);
      expect(flags.slice(0, -1).every((f) => f === true)).toBe(true);
      expect(flags[flags.length - 1]).toBe(false);

      const updater = update.mock.lastCall![1] as (el: El) => Record<string, unknown>;
      expect(updater(shape())).toEqual({ cornerRadius: 20, roundness: { type: 2 } });
    });
  });
});
