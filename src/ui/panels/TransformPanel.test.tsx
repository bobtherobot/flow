import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// The real resize helper imports Excalidraw runtime that can't load under jsdom;
// resize behaviour is covered end-to-end. Unit tests exercise the pure paths.
vi.mock("../../lib/transform", () => ({
  resizeElementDimension: vi.fn(),
  setContainerPadding: vi.fn(),
  MIN_ELEMENT_SIZE: 1,
}));

import { TransformPanel } from "./TransformPanel";
import { resizeElementDimension } from "../../lib/transform";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SelectionStyle } from "./useSelectionStyle";

type El = Record<string, unknown> & { id: string; type: string };

const rect = (over: Partial<El> = {}): El => ({
  id: "a",
  type: "rectangle",
  x: 10,
  y: 20,
  width: 100,
  height: 50,
  angle: 0,
  ...over,
});

function mockSel(elements: El[], selectedIds: Record<string, boolean>) {
  const update = vi.fn();
  const sel = { elements, selectedIds, update } as unknown as SelectionStyle;
  return { sel, update };
}

const api = {} as unknown as ExcalidrawAPI;

describe("TransformPanel", () => {
  beforeEach(() => {
    vi.mocked(resizeElementDimension).mockClear();
  });

  it("shows the selected element's dimensions, position and rotation", () => {
    const { sel } = mockSel([rect({ angle: Math.PI / 2 })], { a: true });
    render(<TransformPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Width")).toHaveValue(100);
    expect(screen.getByLabelText("Height")).toHaveValue(50);
    expect(screen.getByLabelText("X position")).toHaveValue(10);
    expect(screen.getByLabelText("Y position")).toHaveValue(20);
    expect(screen.getByLabelText("Rotation")).toHaveValue(90);
  });

  it("greys every field with no selection", () => {
    const { sel } = mockSel([rect()], {});
    render(<TransformPanel sel={sel} api={api} />);
    for (const label of ["Width", "Height", "X position", "Y position", "Rotation"]) {
      expect(screen.getByLabelText(label)).toBeDisabled();
    }
  });

  it("greys every field for a multi-selection", () => {
    const { sel } = mockSel([rect(), rect({ id: "b" })], { a: true, b: true });
    render(<TransformPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Width")).toBeDisabled();
    expect(screen.getByLabelText("X position")).toBeDisabled();
  });

  it("greys width/height for a text element but keeps position editable", () => {
    const { sel } = mockSel([rect({ type: "text" })], { a: true });
    render(<TransformPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Width")).toBeDisabled();
    expect(screen.getByLabelText("Height")).toBeDisabled();
    expect(screen.getByLabelText("X position")).toBeEnabled();
  });

  it("greys rotation for a frame", () => {
    const { sel } = mockSel([rect({ type: "frame" })], { a: true });
    render(<TransformPanel sel={sel} api={api} />);
    expect(screen.getByLabelText("Rotation")).toBeDisabled();
    expect(screen.getByLabelText("X position")).toBeEnabled();
  });

  it("enables corner radius for a rectangle but not an ellipse", () => {
    const rectSel = mockSel([rect()], { a: true });
    const { unmount } = render(<TransformPanel sel={rectSel.sel} api={api} />);
    expect(screen.getByLabelText("Corner radius")).toBeEnabled();
    unmount();

    const ellipseSel = mockSel([rect({ type: "ellipse" })], { a: true });
    render(<TransformPanel sel={ellipseSel.sel} api={api} />);
    expect(screen.getByLabelText("Corner radius")).toBeDisabled();
  });

  it("disables padding without bound text, enables it with bound text", () => {
    const plain = mockSel([rect()], { a: true });
    const { unmount } = render(<TransformPanel sel={plain.sel} api={api} />);
    expect(screen.getByLabelText("Padding")).toBeDisabled();
    unmount();

    const withText = mockSel(
      [rect(), { id: "t", type: "text", containerId: "a" }],
      { a: true },
    );
    render(<TransformPanel sel={withText.sel} api={api} />);
    expect(screen.getByLabelText("Padding")).toBeEnabled();
  });

  it("commits a corner-radius edit with roundness for a rectangle", async () => {
    const user = userEvent.setup();
    const { sel, update } = mockSel([rect()], { a: true });
    render(<TransformPanel sel={sel} api={api} />);
    const radius = screen.getByLabelText("Corner radius");
    await user.clear(radius);
    await user.type(radius, "16{Enter}");
    const [ids, updater] = update.mock.lastCall!;
    expect(ids).toEqual({ a: true });
    expect(updater()).toEqual({ cornerRadius: 16, roundness: { type: 2 } });
  });

  it("commits an X edit through the selection bridge", async () => {
    const user = userEvent.setup();
    const { sel, update } = mockSel([rect()], { a: true });
    render(<TransformPanel sel={sel} api={api} />);
    const x = screen.getByLabelText("X position");
    await user.clear(x);
    await user.type(x, "250{Enter}");
    const [ids, updater] = update.mock.lastCall!;
    expect(ids).toEqual({ a: true });
    expect(updater()).toEqual({ x: 250 });
  });

  it("rotates the container and its bound text together", async () => {
    const user = userEvent.setup();
    const { sel, update } = mockSel(
      [rect(), { id: "t", type: "text", containerId: "a", x: 0, y: 0, width: 1, height: 1, angle: 0 }],
      { a: true },
    );
    render(<TransformPanel sel={sel} api={api} />);
    const rot = screen.getByLabelText("Rotation");
    await user.clear(rot);
    await user.type(rot, "90{Enter}");
    const [ids, updater] = update.mock.lastCall!;
    expect(ids).toEqual({ a: true, t: true });
    expect((updater() as { angle: number }).angle).toBeCloseTo(Math.PI / 2);
  });

  // Field order in the panel: W, H, X, Y, Rotation, Radius, Padding — every one
  // has finite bounds, so every one renders a grip.
  const gripAt = (container: HTMLElement, index: number) =>
    container.querySelectorAll(".flow-ctl-num__grip")[index];

  const scrub = (grip: Element, dy: number) => {
    fireEvent.pointerDown(grip, { clientY: 300, button: 0 });
    fireEvent.pointerMove(window, { clientY: 300 - dy });
    fireEvent.pointerUp(window, { clientY: 300 - dy });
  };

  it("scrubs X with a 300-unit span, deferring history until release", () => {
    const { sel, update } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 2), 15); // 15px × (300/150) = +30, from x=10

    const flags = update.mock.calls.map((call) => call[3]);
    expect(flags.length).toBeGreaterThan(1);
    expect(flags.slice(0, -1).every((f) => f === true)).toBe(true);
    expect(flags.at(-1)).toBe(false);

    // The last call's updater carries the committed value.
    const updater = update.mock.calls.at(-1)![1] as (el: El) => Record<string, number>;
    expect(updater(rect())).toEqual({ x: 40 });
  });

  it("scrubs width through the resize helper with the transient flag", () => {
    const { sel } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 0), 15); // +30, from width=100

    const calls = vi.mocked(resizeElementDimension).mock.calls;
    expect(calls.at(-1)).toEqual([api, "a", "width", 130, false]);
    expect(calls.slice(0, -1).every((c) => c[4] === true)).toBe(true);
  });

  it("gives rotation no explicit span, sweeping its full 0-360 range", () => {
    const { sel, update } = mockSel([rect()], { a: true });
    const { container } = render(<TransformPanel sel={sel} api={api} />);

    scrub(gripAt(container, 4), 75); // half the travel → half of 360 = +180

    const updater = update.mock.calls.at(-1)![1] as (el: El) => { angle: number };
    expect(updater(rect()).angle).toBeCloseTo(Math.PI, 5);
  });
});
