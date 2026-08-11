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

  it("marks a transparent part as none", () => {
    render(<PartChooser target={target({ partColor: () => "transparent" })} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveClass("flow-clr-part--none");
  });

  it("does not mark an opaque part as none", () => {
    // Would still pass if `--none` were applied unconditionally.
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).not.toHaveClass("flow-clr-part--none");
  });

  it("marks a mixed active part", () => {
    render(<PartChooser target={target({ isMixed: true })} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveClass("flow-clr-part--mixed");
  });

  it("does not mark a non-mixed active part as mixed", () => {
    // Would still pass if `--mixed` were applied unconditionally.
    render(<PartChooser target={target({ isMixed: false })} />);
    expect(screen.getByRole("radio", { name: /fill/i })).not.toHaveClass("flow-clr-part--mixed");
  });

  it("does not mark an inactive part as mixed even when isMixed is true", () => {
    // isMixed describes only the active part's read; the back box has no
    // opinion on mixedness and must not borrow the active part's class.
    render(<PartChooser target={target({ isMixed: true })} />);
    expect(screen.getByRole("radio", { name: /stroke/i })).not.toHaveClass("flow-clr-part--mixed");
  });

  it("gives every visible part a distinct diagonal offset", () => {
    // stroke and text once shared right:0/bottom:0, which made whichever sat
    // behind unclickable in the three-part case.
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    const offsets = screen
      .getAllByRole("radio")
      .map((el) => (el as HTMLElement).style.getPropertyValue("--flow-clr-part-offset"));
    expect(new Set(offsets).size).toBe(3);
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
});
