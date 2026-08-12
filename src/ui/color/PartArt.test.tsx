import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PartArt, NoneSwatch } from "./PartArt";

/**
 * The artwork is `aria-hidden` by design — the <button> around it in
 * PartChooser carries the accessible name. There is no accessible query for a
 * <path>, so these read the SVG directly. This is the legitimate use of
 * querySelector, not a shortcut around a role query.
 */
function layers(container: HTMLElement) {
  return Array.from(container.querySelectorAll("path")).map((p) => ({
    d: p.getAttribute("d"),
    stroke: p.getAttribute("stroke"),
    width: Number(p.getAttribute("stroke-width")),
    fill: p.getAttribute("fill"),
    paintOrder: p.getAttribute("paint-order"),
  }));
}

const INK = "var(--flow-ink)";
const SURFACE = "var(--flow-panel-bg)";

describe("PartArt", () => {
  it("paints a fill part as a dark rule, a light rule, then the color", () => {
    const { container } = render(<PartArt part="fill" color="#ff8800" />);
    const l = layers(container);
    expect(l).toHaveLength(2);
    expect(l[0]).toMatchObject({ stroke: INK, width: 8, fill: "none" });
    expect(l[1]).toMatchObject({ stroke: SURFACE, width: 4, fill: "#ff8800" });
  });

  it("paints a stroke part as a ring of three rules with a hole", () => {
    const { container } = render(<PartArt part="stroke" color="#ff8800" />);
    const l = layers(container);
    expect(l).toHaveLength(3);
    expect(l[0]).toMatchObject({ stroke: INK, width: 15 });
    expect(l[1]).toMatchObject({ stroke: SURFACE, width: 11 });
    expect(l[2]).toMatchObject({ stroke: "#ff8800", width: 7 });
    // fill:none on every layer is what leaves the centre open. A filled layer
    // anywhere here turns the ring into a bullseye.
    expect(l.every((x) => x.fill === "none")).toBe(true);
  });

  it("orders every part's layers widest first", () => {
    // Reversed, the ring collapses to a solid dark square and the filled parts
    // lose their light rule — both render as something plausible, so this is
    // the guard that has to hold.
    for (const part of ["fill", "stroke", "text"] as const) {
      const { container } = render(<PartArt part={part} color="#ff8800" />);
      const widths = layers(container).map((l) => l.width);
      expect(widths).toEqual([...widths].sort((a, b) => b - a));
      expect(new Set(widths).size).toBe(widths.length);
    }
  });

  it("shares one path between all of a part's layers", () => {
    const { container } = render(<PartArt part="stroke" color="#ff8800" />);
    const ds = layers(container).map((l) => l.d);
    expect(new Set(ds).size).toBe(1);
  });

  it("paints the fill over the inner half of its own light rule", () => {
    const { container } = render(<PartArt part="fill" color="#ff8800" />);
    expect(layers(container)[1].paintOrder).toBe("stroke fill");
  });

  it("draws the text part as a T, not a square", () => {
    const t = render(<PartArt part="text" color="#ff8800" />);
    const f = render(<PartArt part="fill" color="#ff8800" />);
    expect(layers(t.container)[0].d).not.toBe(layers(f.container)[0].d);
  });

  it("drops the ring for a none stroke", () => {
    // A ring means nothing without a color in it, so none falls back to the
    // plain square — same intent as the deleted `--none::after { content: none }`.
    // The ring suppression (drop from 3 to 2 rendered layers) is what matters here.
    //
    // The filter below is load-bearing, not a no-op: a none part also renders
    // a <defs><clipPath> containing its own bare <path> (no fill/stroke/width,
    // used only to clip the slash line to the part's silhouette), and
    // `layers()` picks up every <path> in the DOM including that one. Without
    // the filter this assertion would see 3 paths — the clip path plus the 2
    // real layers — not the 2 that actually matter here.
    const { container } = render(<PartArt part="stroke" color="transparent" />);
    const renderedLayers = layers(container).filter((l) => l.stroke !== null);
    expect(renderedLayers).toHaveLength(2);
  });

  it("shows a slash for a none stroke", () => {
    // A none stroke (zeroed width) should display the same "no colour" indicator
    // as fill and text parts — a slashed square. Stroke is a first-class part
    // in the chooser's quartet, so setting it to none must be visually distinct.
    const { container } = render(<PartArt part="stroke" color="transparent" />);
    const slash = container.querySelector("line");
    expect(slash).not.toBeNull();
    expect(slash!.getAttribute("stroke")).toBe("#e03131");
  });

  it("drops the ring for a mixed stroke", () => {
    const { container } = render(<PartArt part="stroke" color="#ff8800" isMixed />);
    expect(layers(container)).toHaveLength(2);
  });

  it("fills a none part with the surface and slashes it", () => {
    const { container } = render(<PartArt part="fill" color="transparent" />);
    expect(layers(container)[1].fill).toBe(SURFACE);
    const slash = container.querySelector("line");
    expect(slash).not.toBeNull();
    expect(slash!.getAttribute("stroke")).toBe("#e03131");
  });

  it("does not slash a part that has a real color", () => {
    const { container } = render(<PartArt part="fill" color="#ff8800" />);
    expect(container.querySelector("line")).toBeNull();
  });

  it("fills a mixed part with a checkerboard pattern it actually defines", () => {
    const { container } = render(<PartArt part="fill" color="#ff8800" isMixed />);
    const fill = layers(container)[1].fill!;
    const id = fill.replace(/^url\(#/, "").replace(/\)$/, "");
    expect(fill).toMatch(/^url\(#.+\)$/);
    expect(container.querySelector(`pattern#${id}`)).not.toBeNull();
  });

  it("keeps each part's path inset equal to half its widest stroke", () => {
    // PartArt.tsx documents that a shape's path inset must equal half its
    // widest stroke, so the stroked outline's outer edge lands exactly on the
    // viewBox edge. Nothing else enforces this: breaking it produces no type
    // error and no crash, just an outer edge that misses the viewBox and
    // bands that render unevenly — a defect that can still look deliberate
    // at a glance. This is the guard for that equally-silent sibling of the
    // layer-order invariant above.
    const inset = (d: string) => Number(d.match(/^M([\d.]+)/)![1]);
    for (const part of ["fill", "stroke", "text"] as const) {
      const { container } = render(<PartArt part={part} color="#ff8800" />);
      const l = layers(container);
      const widest = Math.max(...l.map((x) => x.width));
      expect(inset(l[0].d!)).toBe(widest / 2);
    }
  });

  it("shows only the checkerboard, not the none slash, for a mixed+transparent part", () => {
    // useColorTarget's rawColor resolves MIXED to the first selected
    // element's value, so a mixed part whose first element is transparent
    // arrives here with color === "transparent" AND isMixed === true. The
    // checkerboard must win alone — the old CSS this replaces showed only
    // the checkerboard in this case, so both rendering is a regression.
    const { container } = render(<PartArt part="fill" color="transparent" isMixed />);
    expect(container.querySelector("line")).toBeNull();
    expect(container.querySelector("pattern")).not.toBeNull();
  });

  it("gives two mounted instances disjoint def ids", () => {
    // The docked chooser and the rail chooser are both mounted at once. A
    // hardcoded id would make one reference the other's <defs>.
    const a = render(<PartArt part="fill" color="#ff8800" isMixed />);
    const b = render(<PartArt part="fill" color="#ff8800" isMixed />);
    const idOf = (c: HTMLElement) => c.querySelector("pattern")!.getAttribute("id");
    expect(idOf(a.container)).not.toBe(idOf(b.container));
  });

  it("produces def ids safe to embed in both a url() reference and a CSS selector", () => {
    // React 19 (this codebase's version) yields underscore-delimited ids like
    // "_r_0_" with no colon, so `expect(id).not.toContain(":")` would pass
    // trivially even with the defensive `.replace(/:/g, "")` in PartArt.tsx
    // deleted — it asserts a format detail, not the actual constraint. Assert
    // the real requirement instead: the id must be usable unescaped in a
    // url(#id) attribute reference (works via getElementById regardless of
    // format) AND in a CSS id/class selector (which colons would break),
    // whatever React's id format happens to be on any given version.
    const { container } = render(<PartArt part="fill" color="transparent" />);
    const id = container.querySelector("clipPath")!.getAttribute("id")!;
    expect(id).toMatch(/^[A-Za-z_-][A-Za-z0-9_-]*$/);
  });
});

describe("NoneSwatch", () => {
  it("is a white field with the same red slash a none part uses", () => {
    const { container } = render(<NoneSwatch />);
    const slash = container.querySelector("line");
    expect(slash!.getAttribute("stroke")).toBe("#e03131");
    // No double rule: the quartet chips carry a single hairline border in CSS.
    expect(container.querySelectorAll("path")).toHaveLength(0);
  });
});
