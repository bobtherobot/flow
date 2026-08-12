# Color Picker Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the two color surfaces shipped by the color-system redesign — move all part artwork from CSS to SVG, rearrange the part stack, add a drag-to-delete trash tile to the palette grid, and remove the preview well.

**Architecture:** A new presentational component, `PartArt`, owns every pixel of a part's artwork: it draws concentric stroked copies of that part's own path, widest first, on a fixed `viewBox` so one set of stroke widths serves both the docked chooser (46px) and the rail chooser (32px). `PartChooser` keeps only position, size and stacking; `color.css` loses all part painting. Everything else is a localized change to `PaletteSection` (trash tile) or `PickerRow` (preview removal). No change to the write path — `useColorTarget`, `useColorDraft`, `color-parts.ts`, `color-store.ts` and `palette-store.ts` keep their current public surface, and this plan adds no new call into any of them except the existing `removeSwatches`.

**Tech Stack:** React 19 + TypeScript, Vite, plain CSS with `--flow-*` custom properties, Vitest + React Testing Library for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-08-11-color-picker-refinement-design.md`

## Global Constraints

- **No new runtime dependency.** The color-system branch added none; this plan adds none.
- **flow is desktop-only.** Sizes are chosen for density. Pointer-target sizing guidelines do not constrain this work — see spec §4.
- **Light theme only.** `src/` defines its tokens once, unconditionally (`src/ui/menubar/menubar.css:4`). There is no `prefers-color-scheme` block anywhere in `src/`. Do not add one.
- **Tokens, not literals.** Dark rule = `var(--flow-ink)`, light rule = `var(--flow-panel-bg)`. The only hardcoded colors permitted in new code are the none slash (`#e03131`) and the mixed checkerboard (`#fff` / `#c8c8c8`), both carried forward verbatim from the CSS being deleted.
- **Commands.** Unit tests: `npx vitest run <path>`. Whole suite: `npx vitest run`. Types: `npm run typecheck`. E2E: `npx playwright test <path>` — **run `pkill -f vite` first**, stray dev servers make e2e results untrustworthy (see `.claude/memory/excalidraw-upgrade.md`).
- **Known-red baseline.** `e2e/text-panel.spec.ts:201` and `:225` fail deterministically on `main` and are out of scope. `e2e/new-document.spec.ts:60` and `e2e/style-memory.spec.ts` flake under parallel load and pass in isolation. A healthy full suite is **127 passed / 2 failed**. Do not "fix" these.
- **Commit style.** Conventional commits, `<type>(scope): <description>`. No attribution trailer.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/ui/color/PartArt.tsx` | **new.** All part artwork. Exports `PartArt` (one part's drawing) and `NoneSwatch` (the quartet's none chip). The single definition of the dark/light rules, the ring, the T silhouette, the none slash and the mixed checkerboard. |
| `src/ui/color/PartArt.test.tsx` | **new.** Layer order, widths, paints, path sharing, state fallbacks, `useId` isolation. |
| `src/ui/color/PartChooser.tsx` | Position, size, stacking, radiogroup semantics, quartet. Delegates all painting to `PartArt`. |
| `src/ui/color/PaletteSection.tsx` | Adds the trash tile (drop target + click), tooltips for the pre-existing gestures. |
| `src/ui/color/PickerRow.tsx` | Loses the preview well and its `isNone` prop. |
| `src/ui/color/PickerRow.test.tsx` | **renamed from `preview.test.tsx`.** Keeps the `PickerRow` cases, drops the `ColorPreview` ones. |
| `src/ui/color/ColorPreview.tsx` | **deleted.** |
| `src/ui/color/color.css` | Layout only for parts. Stack sizing, quartet grid, size tokens, tile styling. |

---

### Task 1: `PartArt` — the SVG part artwork

Pure presentational component, no wiring. Nothing renders it until Task 2.

**Files:**
- Create: `src/ui/color/PartArt.tsx`
- Test: `src/ui/color/PartArt.test.tsx`

**Interfaces:**
- Consumes: `ColorPart` from `src/lib/color-parts.ts` (`"fill" | "stroke" | "text"`).
- Produces:
  - `PartArt({ part, color, isMixed }: { part: ColorPart; color: string; isMixed?: boolean })` — `color` is `#rrggbb` or the literal `"transparent"`.
  - `NoneSwatch()` — no props.

**Background the implementer needs:**

An SVG stroke of width *W* straddles the path line by *W*/2 on each side. Painting copies of one path back-to-front, widest first, therefore produces even concentric bands. That is the entire mechanism:

| Part | Layers, back → front | Reads as |
|---|---|---|
| fill / text | ink w8 → surface w4 (filled, `paint-order: stroke fill`) | dark 2, light 2, solid color |
| stroke | ink w15 → surface w11 → color w7 (all `fill: none`) | dark 2, light 2, color 7, light 2, dark 2, hole |

`paint-order: stroke fill` on the filled layer makes the fill paint over the inner half of its own stroke, so the light rule reads 2 units instead of 4. Without it the filled parts stop matching the stroke part's edge.

Path insets are set by the widest stroke each shape carries, so the artwork's outer edge lands exactly on the viewBox: 4 for the w8 shapes, 7.5 for the ring's w15.

- [ ] **Step 1: Write the failing test**

Create `src/ui/color/PartArt.test.tsx`:

```tsx
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
    const { container } = render(<PartArt part="stroke" color="transparent" />);
    expect(layers(container)).toHaveLength(2);
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

  it("gives two mounted instances disjoint def ids", () => {
    // The docked chooser and the rail chooser are both mounted at once. A
    // hardcoded id would make one reference the other's <defs>.
    const a = render(<PartArt part="fill" color="#ff8800" isMixed />);
    const b = render(<PartArt part="fill" color="#ff8800" isMixed />);
    const idOf = (c: HTMLElement) => c.querySelector("pattern")!.getAttribute("id");
    expect(idOf(a.container)).not.toBe(idOf(b.container));
  });

  it("produces def ids usable in a url() reference", () => {
    // React's useId yields ":r0:" — colons are legal in an id and resolve fine
    // via getElementById, but they break any CSS selector built from the id.
    const { container } = render(<PartArt part="fill" color="transparent" />);
    const id = container.querySelector("clipPath")!.getAttribute("id")!;
    expect(id).not.toContain(":");
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/color/PartArt.test.tsx`
Expected: FAIL — `Failed to resolve import "./PartArt"`.

- [ ] **Step 3: Write the implementation**

Create `src/ui/color/PartArt.tsx`:

```tsx
import { useId } from "react";
import type { ColorPart } from "../../lib/color-parts";

/**
 * Everything is drawn in this square and scaled by the <svg> element's own
 * size, so ONE set of stroke widths serves both the docked chooser (46px) and
 * the rail's compact one (32px). The CSS version this replaces needed a
 * parallel set of thicknesses per size, which is exactly the kind of thing
 * that drifts.
 */
const VIEW = 46;

/** The dark rule separates a part from whatever it overlaps; the light rule
 *  holds the swatch color off the dark rule. */
const INK = "var(--flow-ink)";
const SURFACE = "var(--flow-panel-bg)";

/** One definition of "no color", shared by a part's none state and the
 *  quartet's none chip. */
const SLASH = "#e03131";
const SLASH_WIDTH = 4;

/**
 * Path insets are set by the widest stroke each shape carries, so the artwork's
 * outer edge lands exactly on the viewBox: 4 for the w8 shapes, 7.5 for the
 * ring's w15. Change a stroke width and you must change the inset with it.
 */
const SQUARE_D = "M4 4H42V42H4Z";
const RING_D = "M7.5 7.5H38.5V38.5H7.5Z";
const T_D = "M4 4H42V16H29V42H17V16H4Z";

interface Layer {
  stroke: string;
  width: number;
  fill: string;
}

interface PartArtProps {
  part: ColorPart;
  /** `#rrggbb`, or the literal "transparent" for none. */
  color: string;
  isMixed?: boolean;
}

/** Shared <svg> shell: fills its button, invisible to the a11y tree (the
 *  button carries the name). */
function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="flow-clr-art"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * One part's artwork: concentric stroked copies of that part's own path,
 * widest first. An SVG stroke of width W straddles the path line by W/2 each
 * side, so painting back-to-front in descending width produces even bands —
 * see the table in the design spec (§2).
 *
 * Reversed, the ring collapses to a solid dark square and the filled parts
 * lose their light rule. Both look deliberate; `PartArt.test.tsx` is what
 * catches it.
 */
export function PartArt({ part, color, isMixed = false }: PartArtProps) {
  // React's useId yields ":r0:". Colons resolve fine through getElementById,
  // which is how an SVG url(#id) attribute reference works, but they break any
  // CSS selector built from the same id — strip them rather than leave a trap.
  const uid = useId().replace(/:/g, "");
  const checkerId = `${uid}-checker`;
  const clipId = `${uid}-clip`;

  const isNone = color === "transparent";
  // A ring only means something with a real color in it, so none and mixed
  // fall back to the plain square. Same intent as the CSS this replaces
  // (`.flow-clr-part--none::after { content: none }`).
  const isRing = part === "stroke" && !isNone && !isMixed;

  const d = isRing ? RING_D : part === "text" ? T_D : SQUARE_D;
  const paint = isMixed ? `url(#${checkerId})` : isNone ? SURFACE : color;

  const layers: Layer[] = isRing
    ? [
        { stroke: INK, width: 15, fill: "none" },
        { stroke: SURFACE, width: 11, fill: "none" },
        { stroke: paint, width: 7, fill: "none" },
      ]
    : [
        { stroke: INK, width: 8, fill: "none" },
        { stroke: SURFACE, width: 4, fill: paint },
      ];

  return (
    <Canvas>
      {(isMixed || isNone) && (
        <defs>
          {isMixed && (
            <pattern id={checkerId} width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#fff" />
              <rect width="4" height="4" fill="#c8c8c8" />
              <rect x="4" y="4" width="4" height="4" fill="#c8c8c8" />
            </pattern>
          )}
          {isNone && (
            <clipPath id={clipId}>
              <path d={d} />
            </clipPath>
          )}
        </defs>
      )}

      {layers.map((l, i) => (
        <path
          key={i}
          d={d}
          fill={l.fill}
          stroke={l.stroke}
          strokeWidth={l.width}
          // Load-bearing: the fill paints over the inner half of its own
          // stroke, which is what makes the light rule read 2 units and not 4.
          paintOrder="stroke fill"
        />
      ))}

      {isNone && (
        <line
          x1="4"
          y1="4"
          x2={VIEW - 4}
          y2={VIEW - 4}
          stroke={SLASH}
          strokeWidth={SLASH_WIDTH}
          clipPath={`url(#${clipId})`}
        />
      )}
    </Canvas>
  );
}

/** The quartet's "none" chip. Same red slash as a part's none state, without
 *  the double rule — the chips carry a single hairline border in CSS. */
export function NoneSwatch() {
  return (
    <Canvas>
      <rect width={VIEW} height={VIEW} fill="#fff" />
      <line x1="0" y1="0" x2={VIEW} y2={VIEW} stroke={SLASH} strokeWidth={SLASH_WIDTH} />
    </Canvas>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/ui/color/PartArt.test.tsx`
Expected: PASS, 14 tests (13 in `PartArt`, 1 in `NoneSwatch`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/ui/color/PartArt.tsx src/ui/color/PartArt.test.tsx
git commit -m "feat(color): draw part artwork in SVG

Concentric stroked copies of each part's own path, widest first, on a
fixed viewBox so one set of widths serves both chooser sizes. Not wired
up yet."
```

---

### Task 2: `PartChooser` delegates painting to `PartArt`

**Files:**
- Modify: `src/ui/color/PartChooser.tsx:74-116` (the part buttons), `:145-157` (the quartet)
- Modify: `src/ui/color/color.css:218-292` (part painting), `:323-331` (`.flow-clr-chip--none`)
- Test: `src/ui/color/PartChooser.test.tsx:80-107` (none/mixed cases)

**Interfaces:**
- Consumes: `PartArt`, `NoneSwatch` from Task 1.
- Produces: nothing new. `PartChooser`'s props are unchanged.

The `--none` and `--mixed` modifier classes on the button are **removed**, not kept as inert markers — `PartArt` now carries that state, and a class with no CSS behind it is cruft a reviewer would rightly reject. The tests that asserted those classes assert the artwork instead.

- [ ] **Step 1: Rewrite the none/mixed tests to assert the artwork**

In `src/ui/color/PartChooser.test.tsx`, add this helper directly below the `target()` factory:

```tsx
/** State now lives in the SVG, not in a modifier class on the button. */
const isNoneArt = (el: HTMLElement) => el.querySelector("line") !== null;
const isMixedArt = (el: HTMLElement) => el.querySelector("pattern") !== null;
```

Replace the five cases at `:80-107` with:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx`
Expected: FAIL — the new cases fail because no `<line>` or `<pattern>` is rendered; the button still uses CSS classes.

- [ ] **Step 3: Render `PartArt` from the part buttons**

In `src/ui/color/PartChooser.tsx`, add the import:

```tsx
import { PartArt, NoneSwatch } from "./PartArt";
```

Replace the `classes` array and the `<button>`'s `style` and children (`:80-114`) with:

```tsx
          const classes = [
            "flow-clr-part",
            `flow-clr-part--${p}`,
            p === part ? "flow-clr-part--active" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={p}
              ref={(el) => {
                boxRefs.current[p] = el;
              }}
              type="button"
              role="radio"
              aria-checked={p === part}
              aria-label={`${PART_LABEL[p]}${none ? ", none" : ""}${mixed ? ", mixed" : ""}`}
              title={PART_LABEL[p]}
              className={classes}
              tabIndex={p === part ? 0 : -1}
              style={{ ["--flow-clr-part-offset" as string]: offsetOf(p) }}
              onClick={() => setPart(p)}
            >
              <PartArt part={p} color={color} isMixed={mixed} />
            </button>
          );
```

`none` and `mixed` are still computed above and still feed `aria-label` — only their use as class modifiers goes.

- [ ] **Step 4: Render `NoneSwatch` from the quartet's none chip**

Replace the quartet's `<button>` (`:147-155`) with:

```tsx
          <button
            key={q.kind}
            type="button"
            className="flow-clr-chip"
            style={q.kind === "none" ? undefined : { background: q.hex }}
            aria-label={q.label}
            title={q.label}
            onClick={() => quickSet(q.kind)}
          >
            {q.kind === "none" && <NoneSwatch />}
          </button>
```

- [ ] **Step 5: Strip part painting from `color.css`**

Delete these rules outright from `src/ui/color/color.css`:

- the whole `.flow-clr-part--stroke::after` block **and its long comment at `:230-247`** — that comment argues inset shadows cannot make a ring, a trap that can no longer be reached now that no part has a `background` or a `box-shadow`
- `.flow-clr-chooser--compact .flow-clr-part--stroke::after`
- `.flow-clr-part--none`
- `.flow-clr-part--mixed`
- `.flow-clr-part--none::after, .flow-clr-part--mixed::after`
- `.flow-clr-part__glyph`
- `.flow-clr-chip--none`

Replace the `.flow-clr-part` rule with layout only:

```css
/*
 * Layout only. Every pixel of a part's artwork — the dark and light rules, the
 * stroke ring, the T silhouette, none and mixed — is drawn by PartArt.tsx.
 * Nothing here paints.
 */
.flow-clr-part {
  position: absolute;
  top: calc(var(--flow-clr-part-offset, 0) * (100% - var(--flow-clr-part-size)));
  left: calc(var(--flow-clr-part-offset, 0) * (100% - var(--flow-clr-part-size)));
  width: var(--flow-clr-part-size);
  height: var(--flow-clr-part-size);
  padding: 0;
  cursor: pointer;
  background: none;
  border: none;
}

/* The SVG fills its button; `display: block` kills the inline-baseline gap. */
.flow-clr-art {
  display: block;
}
```

Add `overflow: hidden;` to the existing `.flow-clr-chip` rule so `NoneSwatch`'s square corners cannot poke past a future rounded chip, and leave its `border` as-is.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx src/ui/color/PartArt.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the full unit suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all pass, exit 0. (`e2e/` is not run by vitest.)

- [ ] **Step 8: Commit**

```bash
git add src/ui/color/PartChooser.tsx src/ui/color/PartChooser.test.tsx src/ui/color/color.css
git commit -m "refactor(color): move part painting out of CSS into PartArt

The CSS route needed three unrelated tricks for three parts — a
background, a stack of inset shadows, a pseudo-element hole-punch — and
could not express the text part at all. color.css now carries position,
size and stacking only."
```

---

### Task 3: The part stack's new geometry

**Files:**
- Modify: `src/ui/color/PartChooser.tsx:18-20` (`CANONICAL_ORDER` stays, the offset maths goes), `:45-53`, `:67-73`
- Modify: `src/ui/color/color.css` (`.flow-clr-chooser__stack`, `.flow-clr-part`)
- Test: `src/ui/color/PartChooser.test.tsx:109-117`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

Fixed per-part positions replace the index-derived diagonal. This was previously unsafe — fixed offsets once gave `stroke` and `text` the identical position, burying one of them — and is safe now only because the positions below are distinct by construction. The test at Step 1 is what holds that.

`availableParts` returns exactly three shapes (`src/lib/color-parts.ts:59-70`):

| Selection | Parts | Positions (units of part size) | Stack |
|---|---|---|---|
| bare text | `["text"]` | text `(0, 0)` | `1.0 × 1.0` |
| shape / empty selection | `["fill","stroke"]` | fill `(0, 0)`, stroke `(0.5, 0.5)` | `1.5 × 1.5` |
| labelled container | `["fill","stroke","text"]` | plus text `(1.25, 0)` | `1.5 × 2.25` |

- [ ] **Step 1: Write the failing tests**

In `src/ui/color/PartChooser.test.tsx`, replace the `"gives every visible part a distinct diagonal offset"` case (`:109-117`) with:

```tsx
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx`
Expected: FAIL — `--flow-clr-part-top` is never set (positions all read `","`), and the `--parts-N` class is absent.

- [ ] **Step 3: Replace the offset maths with fixed positions**

In `src/ui/color/PartChooser.tsx`, delete the `offsetOf` const and the comment above it (`:50-53`), keeping `visible` — the arrow-key handler still uses it. Add below `CANONICAL_ORDER`:

```tsx
/**
 * Where each part sits, in units of `--flow-clr-part-size`. Fill and stroke
 * step down a diagonal; text drops below fill and left-aligned with it, so it
 * reads as "the two edges" plus "the label".
 *
 * Fixed positions are safe here only because these three are distinct by
 * construction AND `availableParts` returns exactly three shapes
 * (`src/lib/color-parts.ts:59-70`). An earlier fixed-position attempt gave
 * stroke and text the same spot, which buried whichever sat behind.
 */
const POSITION: Record<ColorPart, { top: number; left: number }> = {
  fill: { top: 0, left: 0 },
  stroke: { top: 0.5, left: 0.5 },
  text: { top: 1.25, left: 0 },
};

/** Stack extent per part count, in units of `--flow-clr-part-size`. */
const STACK_SPAN: Record<number, { w: number; h: number }> = {
  1: { w: 1, h: 1 },
  2: { w: 1.5, h: 1.5 },
  3: { w: 1.5, h: 2.25 },
};
```

Inside the component, below `const visible = ...`:

```tsx
  // A bare text selection shows its only box at the origin, not floating on
  // row two below an empty gap where fill and stroke would have been.
  const soloText = visible.length === 1;
  const positionOf = (p: ColorPart) => (soloText ? { top: 0, left: 0 } : POSITION[p]);
  const span = STACK_SPAN[visible.length] ?? STACK_SPAN[2];
```

Change the stack element's opening tag:

```tsx
      <div
        className={`flow-clr-chooser__stack flow-clr-chooser__stack--parts-${visible.length}`}
        role="radiogroup"
        aria-label="Color target"
        onKeyDown={onStackKeyDown}
        style={{
          ["--flow-clr-stack-w" as string]: span.w,
          ["--flow-clr-stack-h" as string]: span.h,
        }}
      >
```

And the part button's `style`:

```tsx
              style={{
                ["--flow-clr-part-top" as string]: positionOf(p).top,
                ["--flow-clr-part-left" as string]: positionOf(p).left,
              }}
```

- [ ] **Step 4: Update the stack and part CSS**

In `src/ui/color/color.css`, replace `.flow-clr-chooser__stack` and its compact override with:

```css
/* Extent comes from the part count via `--flow-clr-stack-w/h`, set inline by
   PartChooser: 1x1 for a lone text part, 1.5x1.5 for a shape, 1.5x2.25 for a
   labelled container. The `--parts-N` class is a hook for tests and for
   anything that needs to style by count; the sizing itself is the vars. */
.flow-clr-chooser__stack {
  position: relative;
  width: calc(var(--flow-clr-stack-w, 1.5) * var(--flow-clr-part-size));
  height: calc(var(--flow-clr-stack-h, 1.5) * var(--flow-clr-part-size));
  --flow-clr-part-size: 46px;
}

.flow-clr-chooser--compact .flow-clr-chooser__stack {
  --flow-clr-part-size: 32px;
}
```

And in `.flow-clr-part`, replace the two `calc(...)` lines from Task 2 with:

```css
  top: calc(var(--flow-clr-part-top, 0) * var(--flow-clr-part-size));
  left: calc(var(--flow-clr-part-left, 0) * var(--flow-clr-part-size));
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx`
Expected: PASS.

- [ ] **Step 6: Look at it in the running app**

Run: `npm run dev`, open the app, and check with a rectangle selected and then with a labelled container (draw a rectangle, press Enter, type, press Escape):

- the stroke ring is a ring — a hole in the middle, not a filled centre
- fill and stroke each show 2px dark then 2px light before their color
- the T is a T, sits below fill, and its edges match the boxes
- every part has an exposed area to click in the three-part case
- the swap arrow still sits clear at the stack's top-right

This is not optional. Unit tests assert layer order and position but cannot show where the bands actually land — and the CSS comment deleted in Task 2 is itself a record of drawing that was reasoned about carefully and never rendered.

- [ ] **Step 7: Commit**

```bash
git add src/ui/color/PartChooser.tsx src/ui/color/PartChooser.test.tsx src/ui/color/color.css
git commit -m "feat(color): rearrange the part stack

Fill and stroke step down a diagonal, text drops below fill. Fixed
per-part positions replace the index-derived offset now that they are
distinct by construction; the stack sizes itself from the part count."
```

---

### Task 4: Quartet as a 2×2 grid, at desktop sizes

**Files:**
- Modify: `src/ui/color/color.css` (`.flow-clr-quartet`, `.flow-clr-chip`, and the compact overrides at `:509-522`)
- Test: `src/ui/color/PartChooser.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new.

Order is unchanged and still reads left-to-right, top-to-bottom: none, white / grey, black. Chips drop to 20px docked and 14px on the rail — flow is desktop-only and density is the goal (spec §4). Two columns is also *narrower* than today's four-across, which gives the rail some width back.

- [ ] **Step 1: Write the failing test**

Add to `src/ui/color/PartChooser.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it passes already**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx`
Expected: PASS. This one is a characterization test — it pins the DOM order the CSS grid depends on, so a later reorder cannot silently scramble the 2×2 reading. Keep it.

- [ ] **Step 3: Make the quartet a 2×2 grid**

In `src/ui/color/color.css`, replace the `.flow-clr-quartet` rule near `:310` with:

```css
/* Two columns, filled in reading order: none, white / grey, black. */
.flow-clr-quartet {
  display: grid;
  grid-template-columns: repeat(2, var(--flow-clr-chip-size));
  gap: 4px;
  --flow-clr-chip-size: 20px;
}
```

Delete the now-duplicate `.flow-clr-quartet { --flow-clr-chip-size: 22px; }` block at `:515-517` and replace the compact override at `:519-522` with:

```css
/* flow is desktop-only: these are mouse targets, sized for density. */
.flow-clr-chooser--compact .flow-clr-quartet {
  --flow-clr-chip-size: 14px;
  gap: 3px;
}
```

Update `.flow-clr-chip` to drop its `var(...)` fallback, which is no longer reachable now that the size is declared on the quartet:

```css
.flow-clr-chip {
  width: var(--flow-clr-chip-size);
  height: var(--flow-clr-chip-size);
  padding: 0;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--flow-ink);
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/ui/color/PartChooser.test.tsx && npm run typecheck`
Expected: PASS, exit 0.

- [ ] **Step 5: Check the rail in the running app**

With `npm run dev`, confirm the rail's color control still fits: the 2×2 quartet is 31px wide against 79px usable (88px rail − 1px border − 8px padding), and the compact stack is 48px wide. Nothing should overflow horizontally. Note the control is now taller — Task 7 adds an assertion for that.

- [ ] **Step 6: Commit**

```bash
git add src/ui/color/color.css src/ui/color/PartChooser.test.tsx
git commit -m "feat(color): quartet becomes a 2x2 grid at desktop sizes"
```

---

### Task 5: The palette grid's trash tile

**Files:**
- Modify: `src/ui/color/PaletteSection.tsx:39-46` (state), `:94-131` (grid), `:194-201` (footer trash)
- Modify: `src/ui/color/color.css` (`.flow-clr-palette__add`, `.flow-clr-palette__tile`, new `__trash`)
- Test: `src/ui/color/PaletteSection.test.tsx`

**Interfaces:**
- Consumes: `removeSwatches(paletteId: string, indices: number[]): void` from `src/lib/palette-store.ts:184` — already imported by this file.
- Produces: nothing new.

**Two things the implementer must get right:**

1. **The trash must NOT use the `disabled` attribute.** Chrome does not deliver mouse events to disabled form controls, and HTML5 drag-and-drop drop targets are driven by mouse events — a `disabled` trash would refuse drops, which is the *common* case (nothing selected, user drags a swatch onto it). Use `aria-disabled` plus a guard in the click handler, and style the disabled look from `[aria-disabled="true"]`.
2. **The gestures this documents already exist and are unchanged.** ⌘/Ctrl/Shift-click selects swatches (`:69-78`); the footer trash removes the selected swatches when there are any and otherwise offers to delete the palette (`:60-67`). Only the `title`s are new — the footer trash's `aria-label` already switches (`:197`) and the `title` just tracks it.

- [ ] **Step 1: Write the failing tests**

Add to `src/ui/color/PaletteSection.test.tsx`, inside the existing `describe("PaletteSection")`:

```tsx
  const trash = () => screen.getByRole("button", { name: "Delete swatches" });
  const swatches = () => screen.getAllByRole("button", { name: /^swatch /i });

  /** HTML5 DnD in jsdom: dragStart on the source, then drop on the target.
   *  PaletteSection tracks the source index in a ref, so no dataTransfer
   *  payload is involved and none needs faking. */
  function dragSwatchToTrash(index: number) {
    fireEvent.dragStart(swatches()[index]);
    fireEvent.dragOver(trash());
    fireEvent.drop(trash());
  }

  it("deletes the dropped swatch and only that one", () => {
    setup();
    const before = swatches().map((s) => s.getAttribute("title"));
    act(() => dragSwatchToTrash(2));
    const after = swatches().map((s) => s.getAttribute("title"));
    expect(after).toHaveLength(before.length - 1);
    expect(after).toEqual(before.filter((_, i) => i !== 2));
  });

  it("accepts a drop while nothing is selected", () => {
    // The regression this guards: a `disabled` trash gets no mouse events in
    // Chrome, so it silently refuses drops in exactly the common case.
    setup();
    expect(trash()).not.toBeDisabled();
    const before = swatches().length;
    act(() => dragSwatchToTrash(0));
    expect(swatches()).toHaveLength(before - 1);
  });

  it("marks the trash unavailable for clicking until swatches are selected", () => {
    setup();
    expect(trash()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(swatches()[1], { metaKey: true });
    expect(trash()).toHaveAttribute("aria-disabled", "false");
  });

  it("ignores a click while nothing is selected", () => {
    setup();
    const before = swatches().length;
    fireEvent.click(trash());
    expect(swatches()).toHaveLength(before);
  });

  it("removes exactly the selected swatches when clicked", () => {
    setup();
    const before = swatches().map((s) => s.getAttribute("title"));
    fireEvent.click(swatches()[0], { metaKey: true });
    fireEvent.click(swatches()[3], { metaKey: true });
    act(() => {
      fireEvent.click(trash());
    });
    const after = swatches().map((s) => s.getAttribute("title"));
    expect(after).toEqual(before.filter((_, i) => i !== 0 && i !== 3));
  });

  it("explains the selection gesture on the grid trash", () => {
    setup();
    expect(trash().getAttribute("title")).toMatch(/drag/i);
    expect(trash().getAttribute("title")).toMatch(/click/i);
  });

  it("says which of its two jobs the footer trash will do", () => {
    setup();
    const footer = () => screen.getByRole("button", { name: /delete the .* palette/i });
    expect(footer().getAttribute("title")).toMatch(/palette/i);

    fireEvent.click(swatches()[0], { metaKey: true });
    const withSelection = screen.getByRole("button", { name: /remove selected swatches/i });
    expect(withSelection.getAttribute("title")).toMatch(/selected swatches/i);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Delete swatches"`.

- [ ] **Step 3: Add the trash tile**

In `src/ui/color/PaletteSection.tsx`, add one piece of state beside the others (`:39-46`):

```tsx
  const [overTrash, setOverTrash] = useState(false);
```

Insert this button as the **first** child of `.flow-clr-palette__grid`, ahead of the existing `[+]` (`:97`):

```tsx
        <button
          type="button"
          className={`flow-clr-palette__trash${overTrash ? " flow-clr-palette__trash--over" : ""}`}
          aria-label="Delete swatches"
          title="Delete swatches — drag one here, or ⌘/Ctrl-click swatches to select them first"
          // NOT `disabled`: Chrome delivers no mouse events to a disabled form
          // control, and HTML5 drop targets run on mouse events — a disabled
          // trash would refuse drops in exactly the common case (nothing
          // selected, user drags a swatch onto it). aria-disabled announces
          // the same thing and keeps the element live.
          aria-disabled={selected.length === 0}
          onClick={() => {
            if (selected.length === 0) return;
            removeSwatches(current.id, selected);
            setSelected([]);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverTrash(true);
          }}
          onDragLeave={() => setOverTrash(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOverTrash(false);
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null) removeSwatches(current.id, [from]);
            setSelected([]);
          }}
        >
          🗑
        </button>
```

- [ ] **Step 4: Add the footer trash's title**

On the footer trash (`:194-201`), add a `title` that tracks its existing `aria-label`:

```tsx
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          title={
            selected.length > 0
              ? "Remove the selected swatches"
              : `Delete the “${current.name}” palette`
          }
          onClick={onTrash}
        >
          🗑
        </button>
```

Note the `aria-label` string is unchanged — `e2e/color-panel.spec.ts` and the existing unit tests query it.

- [ ] **Step 5: Update the class doc comment**

The component's doc comment (`:22-36`) describes the ⌘-click gesture as the only route to deletion. Append to it:

```
 * The grid's leading trash tile is the discoverable route to the same thing:
 * drag a swatch onto it, or select swatches and click it. The footer trash
 * keeps both of its jobs (remove the selected swatches / delete the whole
 * palette) and now says which one it will do via `title`.
```

- [ ] **Step 6: Style the trash tile and the grid**

In `src/ui/color/color.css`, replace the `.flow-clr-palette__add, .flow-clr-palette__tile` rule (`:380-388`) with:

```css
/* flow is desktop-only: these are mouse targets, sized for density. */
.flow-clr-palette__grid {
  --flow-clr-tile-size: 18px;
}

.flow-clr-palette__add,
.flow-clr-palette__trash,
.flow-clr-palette__tile {
  width: var(--flow-clr-tile-size);
  height: var(--flow-clr-tile-size);
  padding: 0;
  cursor: pointer;
  border-radius: var(--flow-radius-sm);
}

/* A colour tile carries no border: a hairline competes with the swatch it is
   supposed to be showing. The shadow gives a pale swatch an edge instead. */
.flow-clr-palette__tile {
  border: none;
  box-shadow: 0 1px 2px rgb(43 43 51 / 18%);
}

/* The trash and [+] carry no colour, so they keep a hairline against the
   panel background. */
.flow-clr-palette__add,
.flow-clr-palette__trash {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
  color: var(--flow-ink);
  background: transparent;
  border: 1px solid var(--flow-border);
}

.flow-clr-palette__add:hover,
.flow-clr-palette__trash:hover {
  background: var(--flow-hover);
}

.flow-clr-palette__trash[aria-disabled="true"] {
  color: var(--flow-ink-disabled);
}

/* Only while a swatch is actually over it — this is the drop affordance. */
.flow-clr-palette__trash--over {
  background: var(--flow-active);
  border-color: var(--flow-accent);
}
```

Delete the now-superseded `.flow-clr-palette__add` and `.flow-clr-palette__add:hover` blocks at `:390-402`.

Give the popup's recents the same edge treatment — in `.flow-clr-recents__slot`, replace `border: 1px solid var(--flow-border);` with:

```css
  border: none;
  box-shadow: 0 1px 2px rgb(43 43 51 / 18%);
```

and add, so an empty slot still reads as a slot:

```css
.flow-clr-recents__slot:disabled {
  cursor: default;
  border: 1px solid var(--flow-border);
  box-shadow: none;
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run src/ui/color/PaletteSection.test.tsx`
Expected: PASS.

- [ ] **Step 8: Run the full unit suite and typecheck**

Run: `npx vitest run && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/ui/color/PaletteSection.tsx src/ui/color/PaletteSection.test.tsx src/ui/color/color.css
git commit -m "feat(color): drag a swatch onto the palette trash to delete it

Adds a trash tile at the head of the palette grid, as a drop target and
as a button for the pre-existing multi-select. Both trashes now say what
they do — the modifier-click gesture was documented nowhere on screen.

Deliberately aria-disabled rather than disabled: Chrome sends no mouse
events to a disabled control, so a disabled trash would refuse drops."
```

---

### Task 6: Remove the preview well

**Files:**
- Delete: `src/ui/color/ColorPreview.tsx`
- Rename: `src/ui/color/preview.test.tsx` → `src/ui/color/PickerRow.test.tsx`
- Modify: `src/ui/color/PickerRow.tsx`, `src/ui/panels/ColorPanel.tsx:52-64`, `src/ui/toolbar/ColorPopup.tsx:117-129`
- Modify: `src/ui/color/color.css:91-116`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PickerRow`'s props become `{ hsv, alpha, onHue, onAlpha, onPick? }` — `isNone` is gone. Both call sites must stop passing it.

`preview.test.tsx` covers **both** `ColorPreview` and `PickerRow`, so it is renamed rather than deleted — deleting it would drop `PickerRow`'s coverage along with the preview's. `useColorDraft.isNone` itself stays; only the prop threading goes.

- [ ] **Step 1: Rename the test file and cut it back to `PickerRow`**

```bash
git mv src/ui/color/preview.test.tsx src/ui/color/PickerRow.test.tsx
```

Then replace its whole contents with:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PickerRow } from "./PickerRow";

describe("PickerRow", () => {
  const hsv = { h: 200, s: 50, v: 80 };

  it("renders the eyedropper and both tracks", () => {
    render(<PickerRow hsv={hsv} alpha={100} onHue={vi.fn()} onAlpha={vi.fn()} />);
    expect(screen.getByRole("button", { name: /pick a color/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /hue/i })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /opacity/i })).toBeInTheDocument();
  });

  it("no longer renders a preview well", () => {
    // Removed deliberately (design spec §7); this pins it so it cannot creep
    // back in as part of an unrelated change.
    const { container } = render(
      <PickerRow hsv={hsv} alpha={100} onHue={vi.fn()} onAlpha={vi.fn()} />,
    );
    expect(container.querySelector(".flow-clr-preview")).toBeNull();
  });

  it("forwards hue and alpha changes", () => {
    const onHue = vi.fn();
    const onAlpha = vi.fn();
    render(<PickerRow hsv={hsv} alpha={100} onHue={onHue} onAlpha={onAlpha} />);
    fireEvent.keyDown(screen.getByRole("slider", { name: /hue/i }), { key: "ArrowRight" });
    expect(onHue).toHaveBeenCalledWith(201, false);
    fireEvent.keyDown(screen.getByRole("slider", { name: /opacity/i }), { key: "ArrowLeft" });
    expect(onAlpha).toHaveBeenCalledWith(99, false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/ui/color/PickerRow.test.tsx`
Expected: FAIL — TypeScript/runtime error on the missing required `isNone` prop, and the preview is still rendered.

- [ ] **Step 3: Strip the preview from `PickerRow`**

Replace `src/ui/color/PickerRow.tsx` entirely with:

```tsx
import "./color.css";
import type { Hsv } from "../../lib/color-convert";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";
import { EyeDropperButton } from "./EyeDropperButton";

interface PickerRowProps {
  hsv: Hsv;
  /** 0–100. */
  alpha: number;
  onHue: (hue: number, transient: boolean) => void;
  onAlpha: (alpha: number, transient: boolean) => void;
  onPick?: () => void;
}

/**
 * Eyedropper and the two stacked tracks — the strip the Color panel and the
 * rail popup show identically. Their *outer* layouts differ (the panel puts
 * the saturation box beside the part chooser, the popup puts it full width on
 * top), which is why only this row is shared and not the whole picker.
 *
 * There is deliberately no preview well: the part chooser, the saturation box
 * and the numeric fields all already show the live color. Alpha is read from
 * the alpha track's thumb, and from the `A` field in the panel.
 */
export function PickerRow({ hsv, alpha, onHue, onAlpha, onPick }: PickerRowProps) {
  return (
    <div className="flow-clr-row">
      <EyeDropperButton onPick={onPick} />
      <div className="flow-clr-row__tracks">
        <HueSlider hue={hsv.h} onChange={onHue} />
        <AlphaSlider alpha={alpha} hue={hsv.h} onChange={onAlpha} />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Delete `ColorPreview` and stop passing `isNone`**

```bash
git rm src/ui/color/ColorPreview.tsx
```

In `src/ui/panels/ColorPanel.tsx`, delete the line `isNone={draft.isNone}` from the `<PickerRow>` call (`:56`).

In `src/ui/toolbar/ColorPopup.tsx`, delete the line `isNone={draft.isNone}` from the `<PickerRow>` call (`:121`).

In `src/ui/color/color.css`, delete `.flow-clr-preview`, `.flow-clr-preview__fill` and `.flow-clr-preview--none` (`:91-116`).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/ui/color/PickerRow.test.tsx && npm run typecheck`
Expected: PASS, exit 0.

- [ ] **Step 6: Confirm nothing else referenced the preview**

Run: `grep -rn "ColorPreview\|flow-clr-preview\|isNone=" src/ e2e/`
Expected: no matches. (`draft.isNone` and `useColorDraft`'s own `isNone` field are fine and will not match this pattern — if `grep -rn "isNone" src/` shows only `useColorDraft.ts` and its test, that is correct.)

- [ ] **Step 7: Commit**

```bash
git add -A src/ui/color src/ui/panels/ColorPanel.tsx src/ui/toolbar/ColorPopup.tsx
git commit -m "refactor(color): remove the preview well

The part chooser, saturation box and numeric fields already show the live
color. preview.test.tsx is renamed rather than deleted because it also
covered PickerRow."
```

---

### Task 7: End-to-end coverage and full verification

**Files:**
- Modify: `e2e/color-panel.spec.ts` (append two tests)

**Interfaces:**
- Consumes: the `panel` selector const (`e2e/color-panel.spec.ts:29`), `drawRect` helper (`:4`).
- Produces: nothing.

**What is NOT needed here, contrary to what the spec's first draft said:** the existing rail assertion at `:320` measures the rail's *width* against `--flow-toolbar-reserved`. It is unaffected by the color control getting taller and must not be touched. The vertical fit is genuinely uncovered, which is what the second test below adds.

- [ ] **Step 1: Write the failing e2e tests**

Append to `e2e/color-panel.spec.ts`:

```ts
test("dragging a swatch onto the trash deletes it", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-pnl");

  const swatches = page.locator(panel).getByRole("button", { name: /^Swatch /i });
  const before = await swatches.count();
  const doomed = await swatches.first().getAttribute("aria-label");

  // Playwright's dragAndDrop drives real HTML5 DnD in Chromium, which is what
  // the grid uses (native `draggable`, not pointer events).
  await page.dragAndDrop(
    `${panel} [aria-label="${doomed}"]`,
    `${panel} [aria-label="Delete swatches"]`,
  );

  await expect(swatches).toHaveCount(before - 1);
  await expect(page.locator(panel).getByRole("button", { name: doomed!, exact: true })).toHaveCount(0);
});

test("the rail's color control fits the rail without overflowing", async ({ page }) => {
  await page.goto("/");
  await page.waitForSelector(".flow-toolbar");

  // A labelled container is the tallest case: three parts, so the stack is
  // 2.25 part-sizes tall on top of a two-row quartet.
  await drawRect(page, 400, 300, 560, 400);
  await page.keyboard.press("Enter");
  await page.keyboard.type("hi");
  await page.keyboard.press("Escape");

  const overflow = await page.evaluate(() => {
    const rail = document.querySelector(".flow-toolbar") as HTMLElement;
    return {
      v: rail.scrollHeight - rail.clientHeight,
      h: rail.scrollWidth - rail.clientWidth,
    };
  });
  expect(overflow.h).toBeLessThanOrEqual(0);
  expect(overflow.v).toBeLessThanOrEqual(0);
});
```

- [ ] **Step 2: Kill stray dev servers, then run the new tests**

```bash
pkill -f vite
npx playwright test e2e/color-panel.spec.ts
```

Expected: the whole file passes. If `the rail's color control fits` fails, that is the real risk this plan flagged — the rail needs to scroll or the compact sizes need to come down further. Report it rather than deleting the test.

- [ ] **Step 3: Run the full verification sweep**

```bash
pkill -f vite
npx vitest run
npm run typecheck
npx playwright test
```

Expected:
- vitest: all files pass. The measured baseline on this branch's first commit is **83 files / 845 tests**; the count grows by the tests added here. What matters is zero failures.
- typecheck: exit 0.
- playwright: **129 passed / 2 failed**. The two failures must be `e2e/text-panel.spec.ts:201` and `:225` and nothing else — they reproduce on `main` and are out of scope. If `e2e/new-document.spec.ts:60` or `e2e/style-memory.spec.ts` also fail, re-run that spec alone before believing it; both flake under parallel load.

- [ ] **Step 4: Final visual pass in the running app**

`npm run dev`, then confirm against `working/color-picker-panel-2.png` and `working/color-picker-popup-2.png`:

- part chooser: fill top-left, stroke stepped down-right, T below fill; every part has 2px dark then 2px light before its color; the stroke ring has a hole
- quartet: 2×2, none is white with a red slash
- palette: trash then `[+]` then colors; tiles rounded with a soft edge, no hairline
- dragging a swatch over the trash highlights it; dropping removes it
- popup: no preview circle, six recents with the same edge as the palette tiles
- the rail's compact chooser shows the same artwork at a smaller size

- [ ] **Step 5: Commit**

```bash
git add e2e/color-panel.spec.ts
git commit -m "test(color): cover drag-to-trash and the rail's vertical fit"
```

- [ ] **Step 6: Record the work in repo-local memory**

Per `CLAUDE.md`, consolidate into `.claude/memory/`. Update `.claude/memory/color-system.md` — it is the file a future session will read before touching this code, and three of its statements are now stale:

- the `::after` hole-punch and the "inset shadows cannot make a ring" argument (its section on that CSS) — replaced by `PartArt.tsx`
- the layout section's description of the part stack as an even diagonal
- `ColorPreview` is no longer among the picker primitives listed under "Layout of the code"

Add a short section covering what is new: `PartArt` owns all part painting, the widest-first layer rule and why reversing it is silent, `useId` for the defs, and the `aria-disabled`-not-`disabled` trap on the trash. Add a one-line pointer in `.claude/memory/MEMORY.md`.

```bash
git add .claude/memory
git commit -m "docs(memory): record the color picker refinement"
```

---

## Self-Review

**Spec coverage.** §1 geometry → Task 3. §2 SVG artwork, layering rule, colour states, deletions → Tasks 1–2. §3 quartet 2×2 → Task 4. §4 sizing tokens → Tasks 4 (chips) and 5 (tiles). §5 trash tile and tooltips → Task 5. §6 tile styling → Task 5 Step 6. §7 preview removal → Task 6. §8 (nothing to do) → no task, correctly. Testing section → Tasks 1–6 inline plus Task 7. Risks: layer order → Task 1 Step 1 test 3; `paint-order` → Task 1 test 5; rail height → Task 7 Step 1 test 2; `useId` → Task 1 tests 11–12.

**Two corrections to the spec this plan makes, deliberately:**

1. The spec listed `sliders.test.tsx` as needing an update for the preview-less `PickerRow`. It does not — that file tests `HueSlider` and `AlphaSlider` directly and never renders `PickerRow`. The file that matters is `preview.test.tsx`, which covers *both* `ColorPreview` and `PickerRow`, so Task 6 renames it instead of deleting it.
2. The spec said `e2e/color-panel.spec.ts`'s exact-pixel rail assertion needed re-measuring against the taller control. It does not — that assertion is width-only (`rail.x + rail.width` against `--flow-toolbar-reserved`). Task 7 leaves it alone and adds a genuine vertical-fit test instead.

Both are noted in Task 6 and Task 7 respectively, and the spec is corrected to match.

**Placeholder scan:** none. Every code step carries the code.

**Type consistency:** `PartArt({ part, color, isMixed })` as defined in Task 1 is called with exactly those props in Task 2. `NoneSwatch()` takes no props in both. `PickerRow`'s post-Task-6 prop set matches its two call sites. `removeSwatches(paletteId, indices)` matches `palette-store.ts:184`. CSS custom properties are consistent across tasks: `--flow-clr-part-size`, `--flow-clr-part-top`, `--flow-clr-part-left`, `--flow-clr-stack-w`, `--flow-clr-stack-h`, `--flow-clr-chip-size`, `--flow-clr-tile-size`.
