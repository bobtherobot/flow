import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useColorTarget } from "./useColorTarget";
import { reloadColorStore } from "../../lib/color-store";
import { getRecentPaletteColors, reloadPaletteStore } from "../../lib/palette-store";
import type { SelectionStyle } from "../panels/useSelectionStyle";

// jsdom/Node's native `localStorage` global does not implement a usable
// Storage in this project's vitest setup (see src/lib/color-store.test.ts and
// src/lib/palette-store.test.ts, which use this same in-memory mock for the
// identical reason). Without this stub, `localStorage.clear()` throws
// "not a function" — an environment gap, not a behavior change to this task.
const mockStorage: Record<string, string> = {};

const mockLocalStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockStorage[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockStorage[key];
  },
  clear: () => {
    for (const key in mockStorage) {
      delete mockStorage[key];
    }
  },
  key: (index: number) => {
    const keys = Object.keys(mockStorage);
    return keys[index] ?? null;
  },
  get length() {
    return Object.keys(mockStorage).length;
  },
};

vi.stubGlobal("localStorage", mockLocalStorage);

const rect = {
  id: "r1", type: "rectangle",
  strokeColor: "#111111", backgroundColor: "#eeeeee", strokeWidth: 2,
};

function fakeSel(over: Partial<SelectionStyle> = {}): SelectionStyle {
  return {
    elements: [rect],
    appState: {
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      currentItemStrokeWidth: 2,
    },
    selectedIds: { r1: true },
    textTargetIds: {},
    hasSelection: true,
    selectedCount: 1,
    hasText: false,
    hasLinear: false,
    setProp: vi.fn(),
    update: vi.fn(),
    executeAction: vi.fn(),
    ...over,
  } as unknown as SelectionStyle;
}

function Harness({ sel }: { sel: SelectionStyle }) {
  const t = useColorTarget(sel);
  return (
    <>
      <output data-testid="part">{t.part}</output>
      <output data-testid="hex">{t.hex}</output>
      <output data-testid="alpha">{String(t.alpha)}</output>
      <output data-testid="available">{t.available.join(",")}</output>
      <output data-testid="mixed">{String(t.isMixed)}</output>
      <output data-testid="partFill">{t.partColor("fill")}</output>
      <output data-testid="partStroke">{t.partColor("stroke")}</output>
      <button onClick={() => t.setPart("stroke")}>use stroke</button>
      <button onClick={() => t.setColor("#00ff00", 50, false)}>set green</button>
      <button onClick={() => t.setColor("#00ff00", 50, true)}>set green transient</button>
      <button onClick={() => t.swap()}>swap</button>
      <button onClick={() => t.quickSet("none")}>none</button>
      <button onClick={() => t.quickSet("grey")}>grey</button>
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  reloadColorStore();
  reloadPaletteStore();
});

describe("reading", () => {
  it("reads the fill color of the selection", () => {
    render(<Harness sel={fakeSel()} />);
    expect(screen.getByTestId("part")).toHaveTextContent("fill");
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
    expect(screen.getByTestId("alpha")).toHaveTextContent("100");
  });

  it("splits an 8-digit hex into color and opacity", () => {
    const sel = fakeSel({ elements: [{ ...rect, backgroundColor: "#eeeeee80" }] as never });
    render(<Harness sel={sel} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
    expect(screen.getByTestId("alpha")).toHaveTextContent("50");
  });

  it("falls back to the tool defaults with nothing selected", () => {
    render(<Harness sel={fakeSel({ selectedIds: {}, hasSelection: false, selectedCount: 0 })} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("transparent");
  });

  it("resolves a mixed selection to a concrete color", () => {
    const sel = fakeSel({
      elements: [rect, { ...rect, id: "r2", backgroundColor: "#123456" }] as never,
      selectedIds: { r1: true, r2: true },
      selectedCount: 2,
    });
    render(<Harness sel={sel} />);
    expect(screen.getByTestId("hex")).toHaveTextContent("#eeeeee");
  });

  it("reports a single-valued selection as not mixed", () => {
    render(<Harness sel={fakeSel()} />);
    expect(screen.getByTestId("mixed")).toHaveTextContent("false");
  });

  it("exposes each part's own color for the chooser boxes", () => {
    render(<Harness sel={fakeSel()} />);
    expect(screen.getByTestId("partFill")).toHaveTextContent("#eeeeee");
    expect(screen.getByTestId("partStroke")).toHaveTextContent("#111111");
  });

  it("flags a mixed selection", () => {
    const sel = fakeSel({
      elements: [rect, { ...rect, id: "r2", backgroundColor: "#123456" }] as never,
      selectedIds: { r1: true, r2: true },
      selectedCount: 2,
    });
    render(<Harness sel={sel} />);
    expect(screen.getByTestId("mixed")).toHaveTextContent("true");
  });
});

describe("part selection", () => {
  it("switches the active part", () => {
    render(<Harness sel={fakeSel()} />);
    fireEvent.click(screen.getByText("use stroke"));
    expect(screen.getByTestId("part")).toHaveTextContent("stroke");
    expect(screen.getByTestId("hex")).toHaveTextContent("#111111");
  });

  it("forces the text part for a text-only selection", () => {
    const text = { id: "t1", type: "text", strokeColor: "#222222", backgroundColor: "transparent", containerId: null };
    render(<Harness sel={fakeSel({ elements: [text] as never, selectedIds: { t1: true }, textTargetIds: { t1: true }, hasText: true })} />);
    expect(screen.getByTestId("part")).toHaveTextContent("text");
    expect(screen.getByTestId("available")).toHaveTextContent("text");
    expect(screen.getByTestId("hex")).toHaveTextContent("#222222");
  });
});

describe("writing", () => {
  it("writes a combined 8-digit hex to the fill", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("set green"));
    // Asserting the VALUE, not just that update ran: with a bare
    // `toHaveBeenCalled()` the alpha could be dropped entirely and this passes.
    const [ids, updater, currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual({ r1: true });
    expect(updater(rect)).toEqual({ backgroundColor: "#00ff0080" });
    expect(currentItems).toEqual({ currentItemBackgroundColor: "#00ff0080" });
  });

  it("forwards the transient flag so a drag is one undo entry", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("set green transient"));
    expect((sel.update as ReturnType<typeof vi.fn>).mock.calls[0][3]).toBe(true);
    fireEvent.click(screen.getByText("set green"));
    expect((sel.update as ReturnType<typeof vi.fn>).mock.calls[1][3]).toBe(false);
  });

  it("does not record into the Recent palette", () => {
    // Recording is RailColorControl's job now — the hook is shared by both
    // surfaces, and the docked panel must not feed the list.
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("set green"));
    expect(getRecentPaletteColors()).toEqual([]);
  });

  it("swaps fill and stroke in one update", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("swap"));
    const [ids, updater, currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(ids).toEqual({ r1: true });
    expect(updater(rect)).toEqual({ backgroundColor: "#111111", strokeColor: "#eeeeee" });
    expect(currentItems).toEqual({
      currentItemBackgroundColor: "#1e1e1e",
      currentItemStrokeColor: "transparent",
    });
  });
});

describe("quick colors", () => {
  it("sets a transparent fill for none", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("none"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ backgroundColor: "transparent" });
  });

  it("zeroes the stroke width for none on stroke", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("none"));
    const [, updater, currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ strokeColor: "transparent", strokeWidth: 0 });
    expect(currentItems).toEqual({
      currentItemStrokeColor: "transparent",
      currentItemStrokeWidth: 0,
    });
  });

  it("bumps a zero stroke width back to 1 when a real color is chosen", () => {
    const sel = fakeSel({ elements: [{ ...rect, strokeColor: "transparent", strokeWidth: 0 }] as never });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("grey"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater({ ...rect, strokeColor: "transparent", strokeWidth: 0 }))
      .toEqual({ strokeColor: "#808080", strokeWidth: 1 });
  });

  it("leaves a nonzero stroke width alone", () => {
    const sel = fakeSel();
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("grey"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater(rect)).toEqual({ strokeColor: "#808080" });
  });

  it("revives the stroke-width DEFAULT, not just the element", () => {
    // With an empty selection the element updater never runs, so the default is
    // the only path — and a default stuck at 0 draws every later shape invisible.
    const sel = fakeSel({
      selectedIds: {},
      hasSelection: false,
      selectedCount: 0,
      appState: {
        currentItemBackgroundColor: "transparent",
        currentItemStrokeColor: "transparent",
        currentItemTextColor: "#1e1e1e",
        currentItemStrokeWidth: 0,
      } as never,
    });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("grey"));
    const [, , currentItems] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(currentItems).toEqual({
      currentItemStrokeColor: "#808080",
      currentItemStrokeWidth: 1,
    });
  });

  it("revives the stroke width when a swap moves a real color onto it", () => {
    const zeroed = { ...rect, strokeColor: "transparent", strokeWidth: 0, backgroundColor: "#ff0000" };
    const sel = fakeSel({ elements: [zeroed] as never });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("swap"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    // Without the revival the shape vanishes: no fill, and a real stroke at width 0.
    expect(updater(zeroed)).toEqual({
      backgroundColor: "transparent",
      strokeColor: "#ff0000",
      strokeWidth: 1,
    });
  });

  it("does nothing for none on the text part", () => {
    const text = { id: "t1", type: "text", strokeColor: "#222222", backgroundColor: "transparent", containerId: null };
    const sel = fakeSel({ elements: [text] as never, selectedIds: { t1: true }, textTargetIds: { t1: true }, hasText: true });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("none"));
    expect(sel.update).not.toHaveBeenCalled();
  });

  it("does not bump version/undo when clicking none on an already-none stroke", () => {
    const sel = fakeSel({ elements: [{ ...rect, strokeColor: "transparent", strokeWidth: 0 }] as never });
    render(<Harness sel={sel} />);
    fireEvent.click(screen.getByText("use stroke"));
    fireEvent.click(screen.getByText("none"));
    const [, updater] = (sel.update as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(updater({ ...rect, strokeColor: "transparent", strokeWidth: 0 })).toBeNull();
  });
});
