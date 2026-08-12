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
  it("always renders all three boxes, whatever the selection exposes", () => {
    // The chooser is a fixed object: its size must not depend on the
    // selection, or the saturation box beside it resizes on every click.
    render(<PartChooser target={target()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /^text/i })).toBeInTheDocument();
  });

  it("marks parts the selection does not expose as unavailable", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /^text/i })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("ignores a click on an unavailable part", () => {
    // Would silently point the whole picker at a write that goes nowhere.
    const t = target();
    render(<PartChooser target={t} />);
    fireEvent.click(screen.getByRole("radio", { name: /^text/i }));
    expect(t.setPart).not.toHaveBeenCalled();
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

  /** Names in paint order, back to front — DOM order is the stacking order. */
  const stackOrder = () =>
    screen.getAllByRole("radio").map((r) => (r.getAttribute("title") ?? "").split(" ")[0]);

  it("keeps text behind the edges whenever an edge is the active part", () => {
    // The T overlaps stroke's bottom-left corner. Painted on top of stroke
    // while fill is active, it reads as if the picker were aimed at the text —
    // there is nothing on screen to say otherwise.
    const { rerender } = render(<PartChooser target={target({ part: "fill" })} />);
    expect(stackOrder()).toEqual(["Text", "Stroke", "Fill"]);

    rerender(<PartChooser target={target({ part: "stroke" })} />);
    expect(stackOrder()).toEqual(["Text", "Fill", "Stroke"]);
  });

  it("brings text to the front when text is the active part", () => {
    render(<PartChooser target={target({ available: ["fill", "stroke", "text"], part: "text" })} />);
    expect(stackOrder()[2]).toBe("Text");
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

  it("keeps fill and stroke on screen for a text-only selection", () => {
    // Bare text exposes only `text`. Dropping the other two would shrink the
    // stack and shift everything beside it — the same jitter the always-on
    // text box exists to prevent, just in the other direction.
    const t = target({ available: ["text"], part: "text" });
    render(<PartChooser target={t} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.getByRole("radio", { name: /^text/i })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    for (const name of [/fill/i, /stroke/i]) {
      expect(screen.getByRole("radio", { name })).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("keeps the swap arrow in place but inert when stroke is unavailable", () => {
    // It is absolutely positioned, so unmounting it shifts nothing — but
    // flickering it in and out is the same class of jitter.
    const t = target({ available: ["text"], part: "text" });
    render(<PartChooser target={t} />);
    const arrow = screen.getByRole("button", { name: /swap/i });
    expect(arrow).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(arrow);
    expect(t.swap).not.toHaveBeenCalled();
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

  it("puts every part in the same place whatever the selection exposes", () => {
    // The whole point of the fixed layout: a part's position must not move
    // because a different part became unavailable.
    const places = () => ({
      fill: posOf(screen.getByRole("radio", { name: /fill/i })),
      stroke: posOf(screen.getByRole("radio", { name: /stroke/i })),
      text: posOf(screen.getByRole("radio", { name: /^text/i })),
    });

    const { rerender } = render(
      <PartChooser target={target({ available: ["fill", "stroke", "text"] })} />,
    );
    const whenAllLive = places();

    rerender(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(places()).toEqual(whenAllLive);

    rerender(<PartChooser target={target()} />);
    expect(places()).toEqual(whenAllLive);
  });

  it("sizes the stack the same whatever the selection exposes", () => {
    // Was three sizes keyed to the part count, which made the saturation box
    // beside it resize on every selection change.
    const size = () => screen.getByRole("radiogroup").className;

    const { rerender } = render(<PartChooser target={target()} />);
    const forShape = size();

    rerender(<PartChooser target={target({ available: ["fill", "stroke", "text"] })} />);
    expect(size()).toBe(forShape);

    rerender(<PartChooser target={target({ available: ["text"], part: "text" })} />);
    expect(size()).toBe(forShape);
  });

  it("moves the active part with arrow keys and wraps", () => {
    const t = target({ available: ["fill", "stroke", "text"] });
    render(<PartChooser target={t} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(t.setPart).toHaveBeenCalledWith("stroke");
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowLeft" });
    expect(t.setPart).toHaveBeenLastCalledWith("text");
  });

  it("skips unavailable parts when cycling with arrow keys", () => {
    // available is [fill, stroke]; text is on screen but must not be a stop,
    // or the cycle lands the picker on a write that goes nowhere. Stepping
    // forward from the LAST live part is what proves it: text sits after
    // stroke in canonical order, so a cycle that counted it would land there
    // instead of wrapping to fill.
    const t = target({ part: "stroke" });
    render(<PartChooser target={t} />);
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" });
    expect(t.setPart).toHaveBeenLastCalledWith("fill");
  });

  it("keeps only the active box in the tab order", () => {
    render(<PartChooser target={target()} />);
    expect(screen.getByRole("radio", { name: /fill/i })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: /stroke/i })).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("radio", { name: /^text/i })).toHaveAttribute("tabindex", "-1");
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
