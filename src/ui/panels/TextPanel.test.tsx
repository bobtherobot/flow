import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real package runs DOM/canvas code that throws in jsdom (no `canvas`
// package installed, so getContext("2d") is null) — same issue worked around
// in useSelectionStyle.test.tsx and search-matches.test.ts. Stub just the
// constant TextPanel actually imports at runtime.
vi.mock("@excalidraw/excalidraw", () => ({
  FONT_FAMILY: {
    Virgil: 1,
    Helvetica: 2,
    Cascadia: 3,
    Excalifont: 5,
    Nunito: 6,
    "Lilita One": 7,
    "Comic Shanns": 8,
    "Liberation Sans": 9,
  },
}));

// The padding helper imports Excalidraw's resize routine through the barrel,
// which drags in the same jsdom-hostile runtime; the rewrap itself is covered
// end-to-end, so the unit tests assert the call it makes.
vi.mock("../../lib/transform", () => ({
  setContainerPadding: vi.fn(),
  resizeElementDimension: vi.fn(),
  MIN_ELEMENT_SIZE: 1,
}));

import { TextPanel } from "./TextPanel";
import { setContainerPadding } from "../../lib/transform";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SelectionStyle } from "./useSelectionStyle";

const textEl = { id: "t", type: "text", fontSize: 20, fontFamily: 1, textAlign: "left" };

const api = {} as unknown as ExcalidrawAPI;

function mockSel(over: Record<string, unknown> = {}) {
  const executeAction = vi.fn();
  const sel = {
    elements: [textEl],
    appState: null,
    selectedIds: { t: true },
    textTargetIds: { t: true },
    hasSelection: true,
    selectedCount: 1,
    hasText: true,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction,
    ...over,
  } as unknown as SelectionStyle;
  return { sel, executeAction };
}

describe("TextPanel", () => {
  it("shows the selected text's font size", () => {
    const { sel } = mockSel();
    render(<TextPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Font size value")).toHaveValue(20);
  });

  it("shows scrubbed digits without writing, then commits once on release", () => {
    const { sel, executeAction } = mockSel();
    const { container } = render(<TextPanel sel={sel} api={api} />);
    const field = container.querySelectorAll(".flow-ctl-num__input")[0];

    fireEvent.pointerDown(field, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 290 }); // 10px × (150/150) = +10
    // The digits track the drag; the canvas deliberately does not, because
    // Excalidraw's changeFontSize action always captures history.
    expect(screen.getByLabelText("Font size value")).toHaveValue(30);
    expect(executeAction).not.toHaveBeenCalled();

    fireEvent.pointerUp(window, { clientY: 290 });
    expect(executeAction).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledWith("changeFontSize", 30);
  });

  it("still commits a typed size on Enter", async () => {
    const { sel, executeAction } = mockSel();
    render(<TextPanel sel={sel} api={api} />);
    const field = screen.getByLabelText("Font size value");
    fireEvent.change(field, { target: { value: "42" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(executeAction).toHaveBeenLastCalledWith("changeFontSize", 42);
  });

  it("disables the field with no text selected", () => {
    const { sel } = mockSel({ hasText: false, textTargetIds: {} });
    render(<TextPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Font size value")).toBeDisabled();
  });

  describe("padding", () => {
    const container = (over: Record<string, unknown> = {}) => ({
      id: "c",
      type: "rectangle",
      width: 200,
      height: 100,
      ...over,
    });
    const label = (over: Record<string, unknown> = {}) => ({
      id: "t",
      type: "text",
      containerId: "c",
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      ...over,
    });

    /** A selection of labelled containers, as the panel actually sees it. */
    const labelled = (over: Record<string, unknown> = {}) =>
      mockSel({
        elements: [container(), label()],
        selectedIds: { c: true },
        textTargetIds: { t: true },
        ...over,
      });

    beforeEach(() => vi.mocked(setContainerPadding).mockClear());

    it("is disabled for a bare container and for loose text", () => {
      const bare = mockSel({ elements: [container()], selectedIds: { c: true }, textTargetIds: {} });
      const { unmount } = render(<TextPanel sel={bare.sel} api={api} />);
      expect(screen.getByLabelText("Padding")).toBeDisabled();
      unmount();

      // A free text element has no container to pad.
      render(<TextPanel sel={mockSel().sel} api={api} />);
      expect(screen.getByLabelText("Padding")).toBeDisabled();
    });

    it("shows the default padding for a labelled container", () => {
      render(<TextPanel sel={labelled().sel} api={api} />);
      const padding = screen.getByLabelText("Padding");
      expect(padding).toBeEnabled();
      expect(padding).toHaveValue(5);
    });

    it("blanks when selected containers disagree", () => {
      const { sel } = mockSel({
        elements: [
          container({ padding: 10 }),
          container({ id: "d", padding: 30 }),
          label(),
          label({ id: "u", containerId: "d" }),
        ],
        selectedIds: { c: true, d: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      expect(screen.getByLabelText("Padding")).toHaveValue(null);
    });

    it("pads every labelled container in the selection in one write", async () => {
      const user = userEvent.setup();
      const { sel } = mockSel({
        elements: [
          container({ padding: 10 }),
          container({ id: "d", padding: 10 }),
          container({ id: "bare" }), // no bound text — skipped
          label(),
          label({ id: "u", containerId: "d" }),
        ],
        selectedIds: { c: true, d: true, bare: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);

      const padding = screen.getByLabelText("Padding");
      await user.clear(padding);
      await user.type(padding, "24{Enter}");

      expect(setContainerPadding).toHaveBeenCalledTimes(1);
      expect(setContainerPadding).toHaveBeenCalledWith(api, ["c", "d"], 24, false);
    });

    it("scrubs with a 200-unit span, deferring history until release", () => {
      const { sel } = labelled();
      const { container: dom } = render(<TextPanel sel={sel} api={api} />);
      // Field order: font size, then padding.
      const field = dom.querySelectorAll(".flow-ctl-num__input")[1];

      fireEvent.pointerDown(field, { clientY: 300, button: 0 });
      fireEvent.pointerMove(window, { clientY: 285 }); // 15px × (200/150) = +20
      fireEvent.pointerUp(window, { clientY: 285 });

      const calls = vi.mocked(setContainerPadding).mock.calls;
      expect(calls[calls.length - 1]).toEqual([api, ["c"], 25, false]);
      expect(calls.slice(0, -1).every((c) => c[3] === true)).toBe(true);
    });
  });
});
