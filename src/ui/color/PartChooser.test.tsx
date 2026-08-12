import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PartChooser } from "./PartChooser";
import type { ColorTarget } from "./useColorTarget";

function target(over: Partial<ColorTarget> = {}): ColorTarget {
  return {
    part: "fill",
    available: ["fill", "stroke"],
    setPart: vi.fn(),
    hex: "#eeeeee",
    alpha: 100,
    isMixed: false,
    partColor: (p) => (p === "fill" ? "#eeeeee" : "#111111"),
    setColor: vi.fn(),
    adjustColor: vi.fn(),
    swap: vi.fn(),
    quickSet: vi.fn(),
    ...over,
  };
}

/** State now lives in the SVG, not in a modifier class on the button. */
const isNoneArt = (el: HTMLElement) => el.querySelector("line") !== null;
const isMixedArt = (el: HTMLElement) => el.querySelector("pattern") !== null;

describe("PartChooser", () => {
  it("renders a box per available part", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /stroke/i })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: /^text/i })).not.toBeInTheDocument();
  });

  it("marks the active part checked", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /stroke/i })).not.toBeChecked();
  });

  it("brings a back box forward on click", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("radio", { name: /stroke/i }));
    expect(t.setPart).toHaveBeenCalledWith("stroke");
  });

  it("renders the active part last in DOM order so it sits in front", () => {
    // available is [fill, stroke] but part is fill — a naive render in
    // `available` order would put fill first (behind), not last (in front).
    render(<PartChooser target={target()} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[radios.length - 1]).toHaveAccessibleName(/fill/i);

    render(<PartChooser target={target({ part: "stroke" })} />);
    const radiosAfterSwap = screen.getAllByRole("radio");
    expect(radiosAfterSwap[radiosAfterSwap.length - 1]).toHaveAccessibleName(/stroke/i);
  });

  it("swaps through the arrow button", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("button", { name: /swap fill and stroke/i }));
    expect(t.swap).toHaveBeenCalledTimes(1);
  });

  it("shows all three boxes for a labeled container", () => {
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows one box for a text-only selection", () => {
    render(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    const boxes = screen.getAllByRole("radio");
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAccessibleName(/text/i);
  });

  it("hides the swap arrow when stroke is unavailable", () => {
    render(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(screen.queryByRole("button", { name: /swap/i })).not.toBeInTheDocument();
  });

  it("draws a transparent part as none", () => {
    render(<PartChooser target={target({ partColor: () => "transparent" })} />);
    expect(isNoneArt(screen.getByRole("radio", { name: /fill/i }))).toBe(true);
  });

  it("does not draw an opaque part as none", () => {
    // Would still pass if the slash were drawn unconditionally.
    render(<PartChooser target={target()} />);
    expect(isNoneArt(screen.getByRole("radio", { name: /fill/i }))).toBe(false);
  });

  it("draws a mixed active part as mixed", () => {
    render(<PartChooser target={target({ isMixed: true })} />);
    expect(isMixedArt(screen.getByRole("radio", { name: /fill/i }))).toBe(true);
  });

  it("does not draw a non-mixed active part as mixed", () => {
    render(<PartChooser target={target({ isMixed: false })} />);
    expect(isMixedArt(screen.getByRole("radio", { name: /fill/i }))).toBe(false);
  });

  it("does not draw an inactive part as mixed even when isMixed is true", () => {
    // isMixed describes only the active part's read; the back box has no
    // opinion on mixedness and must not borrow the active part's state.
    render(<PartChooser target={target({ isMixed: true })} />);
    expect(isMixedArt(screen.getByRole("radio", { name: /stroke/i }))).toBe(false);
  });

  const posOf = (el: HTMLElement) => {
    const s = (el as HTMLElement).style;
    return `${s.getPropertyValue("--flow-clr-part-top")},${s.getPropertyValue("--flow-clr-part-left")}`;
  };

  it("gives every visible part a distinct position", () => {
    // stroke and text once shared right:0/bottom:0, which made whichever sat
    // behind completely covered and unclickable in the three-part case.
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    const positions = screen.getAllByRole("radio").map(posOf);
    expect(new Set(positions).size).toBe(3);
  });

  it("steps fill and stroke down the diagonal and drops text below fill", () => {
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    expect(posOf(screen.getByRole("radio", { name: /fill/i }))).toBe("0,0");
    expect(posOf(screen.getByRole("radio", { name: /stroke/i }))).toBe("0.5,0.5");
    expect(posOf(screen.getByRole("radio", { name: /^text/i }))).toBe("1.25,0");
  });

  it("puts a lone text part at the origin rather than on row two", () => {
    // Otherwise a bare text selection renders its only box floating below an
    // empty gap where fill and stroke would have been.
    render(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(posOf(screen.getByRole("radio", { name: /^text/i }))).toBe("0,0");
  });

  it("sizes the stack by how many parts are showing", () => {
    const { rerender } = render(<PartChooser target={target()} />);
    expect(screen.getByRole("radiogroup")).toHaveClass("flow-clr-chooser__stack--parts-2");

    rerender(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    expect(screen.getByRole("radiogroup")).toHaveClass("flow-clr-chooser__stack--parts-3");

    rerender(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(screen.getByRole("radiogroup")).toHaveClass("flow-clr-chooser__stack--parts-1");
  });

  it("moves the active part with arrow keys and wraps", () => {
    const t = target({ available: ["fill", "stroke", "text"] });
    render(<PartChooser target={t} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(t.setPart).toHaveBeenCalledWith("stroke");
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowLeft" });
    expect(t.setPart).toHaveBeenLastCalledWith("text");
  });

  it("keeps only the active box in the tab order", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /stroke/i })).toHaveAttribute("tabindex", "-1");
  });

  it("fires quickSet from the quartet", () => {
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("button", { name: /^none$/i }));
    expect(t.quickSet).toHaveBeenCalledWith("none");
    fireEvent.click(screen.getByRole("button", { name: /^grey$/i }));
    expect(t.quickSet).toHaveBeenCalledWith("grey");
  });

  it("still shows the quartet in compact mode", () => {
    render(<PartChooser target={target()} compact />);
    expect(screen.getByRole("button", { name: /^black$/i })).toBeInTheDocument();
  });

  it("lays the quartet out in reading order so a 2x2 grid stays predictable", () => {
    render(<PartChooser target={target()} />);
    const chips = screen
      .getAllByRole("button")
      .filter((b) => b.className.split(" ").includes("flow-clr-chip"));
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual([
      "None",
      "White",
      "Grey",
      "Black",
    ]);
  });
});
