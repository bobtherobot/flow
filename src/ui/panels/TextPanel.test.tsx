import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real package runs DOM/canvas code that throws in jsdom (no `canvas`
// package installed, so getContext("2d") is null) — same issue worked around
// in useSelectionStyle.test.tsx and search-matches.test.ts. Stub just the
// constant TextPanel actually imports at runtime.
vi.mock("@excalidraw/excalidraw", () => ({
  // Vendor's per-font metrics, trimmed to the two families these tests use.
  getLineHeight: (family: number) => (family === 1 ? 1.25 : 1.15),
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
  setTextLineHeight: vi.fn(),
  restoreTextLineHeights: vi.fn(),
  resizeElementDimension: vi.fn(),
  MIN_ELEMENT_SIZE: 1,
}));

import { TextPanel } from "./TextPanel";
import {
  restoreTextLineHeights,
  setContainerPadding,
  setTextLineHeight,
} from "../../lib/transform";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SelectionStyle } from "./useSelectionStyle";

const textEl = { id: "t", type: "text", fontSize: 20, fontFamily: 1, textAlign: "left", lineHeight: 1.25 };

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

  describe("line height", () => {
    const preset = (name: string) => screen.getByRole("radio", { name });
    const field = () => screen.getByLabelText("Line height value");

    beforeEach(() => vi.mocked(setTextLineHeight).mockClear());

    it("shows the selected text's line height", () => {
      render(<TextPanel sel={mockSel().sel} api={api} />);
      expect(field()).toHaveValue(1.25);
    });

    it("lights no preset for a font's off-preset default", () => {
      render(<TextPanel sel={mockSel().sel} api={api} />);
      for (const name of ["Single spacing", "One and a half spacing", "Double spacing"]) {
        expect(preset(name)).toHaveAttribute("aria-checked", "false");
      }
    });

    it("lights the preset the value matches", () => {
      const { sel } = mockSel({
        elements: [{ ...textEl, lineHeight: 1.5 }],
      });
      render(<TextPanel sel={sel} api={api} />);
      expect(preset("One and a half spacing")).toHaveAttribute("aria-checked", "true");
      expect(field()).toHaveValue(1.5);
    });

    it("writes the preset to every selected text element at once", async () => {
      const user = userEvent.setup();
      const { sel } = mockSel({
        elements: [textEl, { ...textEl, id: "u" }],
        selectedIds: { t: true, u: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      await user.click(preset("Double spacing"));
      expect(setTextLineHeight).toHaveBeenCalledTimes(1);
      expect(setTextLineHeight).toHaveBeenCalledWith(api, ["t", "u"], 2, false);
    });

    it("commits a typed off-preset value", async () => {
      const user = userEvent.setup();
      render(<TextPanel sel={mockSel().sel} api={api} />);
      await user.clear(field());
      await user.type(field(), "1.8{Enter}");
      expect(setTextLineHeight).toHaveBeenLastCalledWith(api, ["t"], 1.8, false);
    });

    it("blanks the field when selected text disagrees", () => {
      const { sel } = mockSel({
        elements: [textEl, { ...textEl, id: "u", lineHeight: 2 }],
        selectedIds: { t: true, u: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      expect(field()).toHaveValue(null);
    });

    it("scrubs with a 0.05 step, deferring history until release", () => {
      const { sel } = mockSel();
      const { container: dom } = render(<TextPanel sel={sel} api={api} />);
      // Field order: font size, then line height.
      const input = dom.querySelectorAll(".flow-ctl-num__input")[1];

      fireEvent.pointerDown(input, { clientY: 300, button: 0 });
      fireEvent.pointerMove(window, { clientY: 285 });
      fireEvent.pointerUp(window, { clientY: 285 });

      const calls = vi.mocked(setTextLineHeight).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[calls.length - 1][3]).toBe(false);
      expect(calls.slice(0, -1).every((c) => c[3] === true)).toBe(true);
    });

    it("is disabled with no text selected", () => {
      const { sel } = mockSel({ hasText: false, textTargetIds: {} });
      render(<TextPanel sel={sel} api={api} />);
      expect(field()).toBeDisabled();
      expect(preset("Double spacing")).toBeDisabled();
    });
  });

  describe("line height across a font change", () => {
    const openFont = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: "Font family" }));
      await user.click(screen.getByRole("option", { name: "Lilita One" }));
    };

    beforeEach(() => {
      vi.mocked(restoreTextLineHeights).mockClear();
    });

    it("re-applies a deliberately chosen line height after the font changes", async () => {
      const user = userEvent.setup();
      // fontFamily 1 defaults to 1.25 in the mock above, so 2 is the user's own.
      const { sel, executeAction } = mockSel({
        elements: [{ ...textEl, lineHeight: 2 }],
      });
      render(<TextPanel sel={sel} api={api} />);
      await openFont(user);

      expect(executeAction).toHaveBeenCalledWith("changeFontFamily", {
        currentItemFontFamily: 7,
      });
      expect(restoreTextLineHeights).toHaveBeenCalledWith(api, new Map([["t", 2]]));
      // Order matters: vendor's action resets lineHeight, so the restore has to
      // land after it, never before.
      expect(executeAction.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(restoreTextLineHeights).mock.invocationCallOrder[0],
      );
    });

    it("leaves untouched text to adopt the new font's own line height", async () => {
      const user = userEvent.setup();
      const { sel, executeAction } = mockSel(); // textEl carries family 1's own 1.25
      render(<TextPanel sel={sel} api={api} />);
      await openFont(user);

      expect(executeAction).toHaveBeenCalled();
      expect(restoreTextLineHeights).not.toHaveBeenCalled();
    });

    it("carries only the customized elements of a mixed selection", async () => {
      const user = userEvent.setup();
      const { sel } = mockSel({
        elements: [
          { ...textEl, lineHeight: 1.25 }, // family 1's own — dropped
          { ...textEl, id: "u", lineHeight: 1.5 }, // chosen — carried
        ],
        selectedIds: { t: true, u: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      await openFont(user);

      expect(restoreTextLineHeights).toHaveBeenCalledWith(api, new Map([["u", 1.5]]));
    });
  });

  describe("vertical align", () => {
    const label = (over: Record<string, unknown> = {}) => ({
      id: "t",
      type: "text",
      containerId: "c",
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "middle",
      ...over,
    });
    const container = (over: Record<string, unknown> = {}) => ({
      id: "c",
      type: "rectangle",
      boundElements: [{ id: "t", type: "text" }],
      ...over,
    });

    const group = () => screen.getByRole("radiogroup", { name: "Vertical align" });
    const option = (name: string) => screen.getByRole("radio", { name });

    it("is disabled for loose text, which has no box to align within", () => {
      render(<TextPanel sel={mockSel().sel} api={api} />);
      expect(group()).toHaveAttribute("aria-disabled", "true");
      expect(option("Align text top")).toBeDisabled();
    });

    it("is disabled for an arrow label, which rides the line", () => {
      const { sel } = mockSel({
        elements: [container({ id: "a", type: "arrow" }), label({ containerId: "a" })],
        selectedIds: { a: true },
        textTargetIds: { t: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      expect(option("Align text middle")).toBeDisabled();
    });

    it("lights the labelled container's current vertical align", () => {
      const { sel } = mockSel({
        elements: [container(), label({ verticalAlign: "bottom" })],
        selectedIds: { c: true },
        textTargetIds: { t: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      expect(option("Align text bottom")).toHaveAttribute("aria-checked", "true");
      expect(option("Align text top")).toHaveAttribute("aria-checked", "false");
    });

    it("lights nothing when selected labels disagree", () => {
      const { sel } = mockSel({
        elements: [
          container(),
          label({ verticalAlign: "top" }),
          container({ id: "d", boundElements: [{ id: "u", type: "text" }] }),
          label({ id: "u", containerId: "d", verticalAlign: "bottom" }),
        ],
        selectedIds: { c: true, d: true },
        textTargetIds: { t: true, u: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      for (const name of ["Align text top", "Align text middle", "Align text bottom"]) {
        expect(option(name)).toHaveAttribute("aria-checked", "false");
      }
    });

    it("dispatches Excalidraw's own vertical-align action", async () => {
      const user = userEvent.setup();
      const { sel, executeAction } = mockSel({
        elements: [container(), label()],
        selectedIds: { c: true },
        textTargetIds: { t: true },
      });
      render(<TextPanel sel={sel} api={api} />);
      await user.click(option("Align text bottom"));
      expect(executeAction).toHaveBeenCalledWith("changeVerticalAlign", "bottom");
    });
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
      // Field order: font size, line height, then padding.
      const field = dom.querySelectorAll(".flow-ctl-num__input")[2];

      fireEvent.pointerDown(field, { clientY: 300, button: 0 });
      fireEvent.pointerMove(window, { clientY: 285 }); // 15px × (200/150) = +20
      fireEvent.pointerUp(window, { clientY: 285 });

      const calls = vi.mocked(setContainerPadding).mock.calls;
      expect(calls[calls.length - 1]).toEqual([api, ["c"], 25, false]);
      expect(calls.slice(0, -1).every((c) => c[3] === true)).toBe(true);
    });
  });
});
