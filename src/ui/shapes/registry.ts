import type { FlowShapeKind, ShapeDef, ShapeParams } from "./types";
import { triangle } from "./geometry/triangle";
import { parallelogram, PARALLELOGRAM_BOUNDS } from "./geometry/parallelogram";
import { trapezoid, TRAPEZOID_BOUNDS } from "./geometry/trapezoid";
import { star, STAR_BOUNDS } from "./geometry/star";
import { cylinder, CYLINDER_BOUNDS } from "./geometry/cylinder";
import { cloud } from "./geometry/cloud";
import { tape, TAPE_BOUNDS } from "./geometry/tape";
import { cube, CUBE_BOUNDS } from "./geometry/cube";
import { fatArrow, FAT_ARROW_BOUNDS } from "./geometry/fatArrow";
import { sumJunction } from "./geometry/sumJunction";
import { clamp } from "./geometry/bounds";

/** `skew`'s UI-only reachability limit — tighter than the geometry's own
 *  1.0 bound (`PARALLELOGRAM_BOUNDS.skew`, parallelogram.ts). `skew === 1`
 *  collapses the parallelogram to a zero-area line, which the geometry's own
 *  clamp alone doesn't prevent, so the handle stops short of it. This is
 *  intentionally *not* folded into `PARALLELOGRAM_BOUNDS`: that constant is
 *  the shape's true valid range, and this is a separate, narrower,
 *  drag-reachability decision layered on top of it. */
export const SKEW_UI_MAX = 0.9;

/**
 * Every flow shape, keyed by kind. This is the single source of truth for
 * geometry, starting parameters and handles: the shapebar builds its tools from
 * it, the vendor registry is populated from it, and the handle overlay reads
 * its `handles`.
 *
 * Typed `Record<FlowShapeKind, ShapeDef>` (not `Partial`), so a kind missing
 * from this object literal is a compile error — that's what keeps this
 * registry and the `FlowShapeKind` union in step forever after.
 */
export const SHAPES_REGISTRY: Record<FlowShapeKind, ShapeDef> = {
  triangle: { kind: "triangle", label: "Triangle", geometry: triangle, defaults: {}, handles: [] },
  parallelogram: {
    kind: "parallelogram",
    label: "Parallelogram",
    geometry: parallelogram,
    defaults: { skew: 0.25 },
    handles: [
      {
        id: "skew",
        // Clamped to SKEW_UI_MAX (0.9), not the geometry function's own 1.0
        // (PARALLELOGRAM_BOUNDS.skew): skew === 1 collapses the
        // parallelogram to a zero-area line (top and bottom edges coincide),
        // and nothing else catches that — the invariant helper
        // (geometry/invariants.ts) only checks that the outline's first and
        // last points differ, not that adjacent ones do. SKEW_UI_MAX is a UI
        // reachability limit only; the geometry function's own 0..1 clamp is
        // unchanged, so this just keeps a *dragged* handle from ever
        // reaching the degenerate value.
        at: (w, _h, p) => [clamp(p.skew ?? 0.25, [PARALLELOGRAM_BOUNDS.skew[0], SKEW_UI_MAX]) * w, 0],
        from: (x, _y, w) => ({
          skew: w === 0 ? 0 : clamp(x / w, [PARALLELOGRAM_BOUNDS.skew[0], SKEW_UI_MAX]),
        }),
      },
    ],
  },
  trapezoid: {
    kind: "trapezoid",
    label: "Trapezoid",
    geometry: trapezoid,
    defaults: { inset: 0.2 },
    handles: [
      {
        id: "inset",
        // Matches the geometry function's own clamp exactly (TRAPEZOID_BOUNDS,
        // 0..0.5) — unlike parallelogram's skew, inset === 0.5 (top edge
        // collapsed to a point, an isoceles triangle) is a valid,
        // non-degenerate shape (same class of harmless adjacent-duplicate-
        // point condition as fatArrow's head/stem extreme below — trapezoid.ts
        // has the full note), so there's no need for a UI-only margin short
        // of the geometry's own limit.
        at: (w, _h, p) => [clamp(p.inset ?? 0.2, TRAPEZOID_BOUNDS.inset) * w, 0],
        from: (x, _y, w) => ({
          inset: w === 0 ? 0 : clamp(x / w, TRAPEZOID_BOUNDS.inset),
        }),
      },
    ],
  },
  star: {
    kind: "star",
    label: "Star",
    geometry: star,
    defaults: { ir: 0.38, rot: 0 },
    handles: [
      {
        // The first inner vertex (geometry's i = 1) carries both parameters
        // at once: its distance from centre is `ir`, its angle is `rot`.
        //
        // Degenerate-clamp check: neither bound needs a UI-only margin short
        // of the geometry's own clamp. `ir` is bounded by STAR_BOUNDS
        // (0.05..0.95) — at 0.95 the inner and outer vertices simply sit
        // close together (a near-decagon, still non-zero area, still
        // simple/non-self-intersecting since the ten vertices are visited at
        // strictly increasing angle); at 0.05 the points are sharp but the
        // star still encloses positive area. `rot` is a full rotation with no
        // degenerate value at all. So no parallelogram-style extra clamp.
        id: "inner",
        at: (w, h, p) => {
          const ir = clamp(p.ir ?? 0.38, STAR_BOUNDS.ir);
          const a = -Math.PI / 2 + (p.rot ?? 0) * Math.PI * 2 + Math.PI / 5;
          return [w / 2 + Math.cos(a) * (w / 2) * ir, h / 2 + Math.sin(a) * (h / 2) * ir];
        },
        from: (x, y, w, h) => {
          // Normalize into a unit circle so a non-square box still maps cleanly.
          const ux = w === 0 ? 0 : (x - w / 2) / (w / 2);
          const uy = h === 0 ? 0 : (y - h / 2) / (h / 2);
          const turn = (v: number) => ((v % 1) + 1) % 1; // keep rot in 0..1
          return {
            ir: clamp(Math.hypot(ux, uy), STAR_BOUNDS.ir),
            rot: turn((Math.atan2(uy, ux) + Math.PI / 2 - Math.PI / 5) / (Math.PI * 2)),
          };
        },
      },
    ],
  },
  cylinder: {
    kind: "cylinder",
    label: "Cylinder",
    geometry: cylinder,
    defaults: { cap: 0.18 },
    handles: [
      {
        // The visible apex of the cap's *front* arc — the second, separately
        // closed subpath in `path` that draws the 3D lid illusion — not the
        // silhouette's own top vertex.
        //
        // Plan defect, corrected here: the original brief targeted
        // `[w/2, cap*h]`, the ellipse's *centre* (`cy = top = capH`). At
        // `x = w/2` that y only touches the curve at the cap's left/right
        // endpoints (x = 0 or x = w), never at the centre column — so that
        // point floated inside the cylinder body, on neither drawn arc. Two
        // real candidates sit at x = w/2: the silhouette's own peak, which
        // algebraically simplifies to `y = top - capH = 0` for every `cap`
        // (invariant to the parameter — a dead handle, since dragging it
        // could never change the value it's meant to control), and the front
        // arc's apex at `y = top + capH = 2*capH`, which does move with
        // `cap`, is part of the rendered path, and is the curve people
        // actually read as "the cap". Verified: `cap = 0.02` → y = 0.04h;
        // `cap = 0.45` → y = 0.9h — both inside the box, both below the
        // silhouette peak, matching what's on screen.
        //
        // Degenerate-clamp check: `cap` is already bounded by CYLINDER_BOUNDS
        // (0.02..0.45) specifically so the two cap ellipses never cross (see
        // cylinder.ts's own comment); the handle reuses that bound as-is
        // rather than narrowing it further, since 0.45 itself is already the
        // safe boundary, not a degenerate one.
        id: "cap",
        at: (w, h, p) => [w / 2, 2 * clamp(p.cap ?? 0.18, CYLINDER_BOUNDS.cap) * h],
        from: (_x, y, _w, h) => ({
          cap: h === 0 ? CYLINDER_BOUNDS.cap[0] : clamp(y / (2 * h), CYLINDER_BOUNDS.cap),
        }),
      },
    ],
  },
  cloud: {
    kind: "cloud",
    label: "Cloud",
    geometry: cloud,
    defaults: {},
    handles: [],
  },
  tape: {
    kind: "tape",
    label: "Tape",
    geometry: tape,
    defaults: { amp: 0.12, wave: 0.5 },
    handles: [
      {
        // The first crest of the top edge. `y = amp*h + sin(t*2*PI*cycles)*amp*h`
        // with `cycles = 1/wave` peaks at `t = wave/4`, giving `x = w*wave/4`,
        // `y = 2*amp*h`. tape.ts's `edge()` samples this exact `t` (and every
        // other crest) explicitly, alongside its uniform grid, so this point
        // is a literal member of the drawn polyline for every `wave`/`amp` —
        // not just an analytic point that happens to be near it. (Before that
        // fix, at low `wave` the true crest could fall between two grid
        // samples and the handle would sit up to several percent of the box
        // height off the drawn edge — e.g. `wave: 0.15, amp: 0.4` was off by
        // ~4.5% of height. Fixed in the geometry, not here, so the shape
        // itself stops under-drawing its own amplitude too.)
        //
        // Degenerate-clamp check: `amp` and `wave` (TAPE_BOUNDS) are both
        // bounded by the geometry itself with no degenerate value inside
        // that range — at `amp = 0` the band flattens to a straight
        // rectangle (still positive area), and top/bottom edges never touch
        // even at max amplitude (insets keep them `h - 2*amp = 0.2h` apart).
        // No extra clamp needed.
        id: "wave",
        at: (w, h, p) => [
          (w * clamp(p.wave ?? 0.5, TAPE_BOUNDS.wave)) / 4,
          2 * clamp(p.amp ?? 0.12, TAPE_BOUNDS.amp) * h,
        ],
        from: (x, y, w, h) => ({
          wave: w === 0 ? TAPE_BOUNDS.wave[0] : clamp((4 * x) / w, TAPE_BOUNDS.wave),
          amp: h === 0 ? 0 : clamp(y / (2 * h), TAPE_BOUNDS.amp),
        }),
      },
    ],
  },
  cube: {
    kind: "cube",
    label: "Cube",
    geometry: cube,
    defaults: { dx: 0.25, dy: 0.2 },
    handles: [
      {
        // The front face's top-right corner, where the front meets both side
        // faces — geometry.ts draws the front face from `[0, dy*h]` to
        // `[w - dx*w, ...]`, so that corner is exactly `[w*(1-dx), h*dy]`,
        // part of the front face's own interior-edge subpath in `path`.
        //
        // Degenerate-clamp check: `dx`/`dy` are bounded by CUBE_BOUNDS
        // (0.02..0.6); at the max, the front face is still `0.4w x 0.4h`
        // — comfortably non-degenerate. No extra clamp needed.
        id: "depth",
        at: (w, h, p) => [
          w * (1 - clamp(p.dx ?? 0.25, CUBE_BOUNDS.dx)),
          h * clamp(p.dy ?? 0.2, CUBE_BOUNDS.dy),
        ],
        from: (x, y, w, h) => ({
          dx: w === 0 ? CUBE_BOUNDS.dx[0] : clamp(1 - x / w, CUBE_BOUNDS.dx),
          dy: h === 0 ? CUBE_BOUNDS.dy[0] : clamp(y / h, CUBE_BOUNDS.dy),
        }),
      },
    ],
  },
  fatArrow: {
    kind: "fatArrow",
    label: "Fat Arrow",
    geometry: fatArrow,
    defaults: { head: 0.4, stem: 0.4 },
    handles: [
      {
        // The head's shoulder — geometry.ts's `[x, 0]` where `x = w - head`,
        // a literal member of `points`.
        //
        // Degenerate-clamp check: `head` is bounded by FAT_ARROW_BOUNDS
        // (0.05..0.95); even at 0.95 the shaft keeps `0.05w` of width. No
        // extra clamp needed. (At the *simultaneous* extreme with `stem: 1`,
        // this and the stem handle produce a harmless adjacent-duplicate
        // point — see fatArrow.ts.)
        id: "head",
        at: (w, _h, p) => [w * (1 - clamp(p.head ?? 0.4, FAT_ARROW_BOUNDS.head)), 0],
        from: (x, _y, w) => ({
          head: w === 0 ? FAT_ARROW_BOUNDS.head[0] : clamp(1 - x / w, FAT_ARROW_BOUNDS.head),
        }),
      },
      {
        // The stem's top edge — geometry.ts's `[0, top]` where
        // `top = (h - stem) / 2`, a literal member of `points`.
        //
        // Degenerate-clamp check: `stem` is bounded by FAT_ARROW_BOUNDS
        // (0.05..1); at 1 the stem spans the full height without inverting
        // top/bottom (documented in fatArrow.ts as intentional, not
        // degenerate — it's a valid, thick arrow). No extra clamp needed.
        id: "stem",
        at: (_w, h, p) => [0, (h * (1 - clamp(p.stem ?? 0.4, FAT_ARROW_BOUNDS.stem))) / 2],
        from: (_x, y, _w, h) => ({
          stem: h === 0 ? FAT_ARROW_BOUNDS.stem[0] : clamp(1 - (2 * y) / h, FAT_ARROW_BOUNDS.stem),
        }),
      },
    ],
  },
  sumJunction: {
    kind: "sumJunction",
    label: "Summing Junction",
    geometry: sumJunction,
    defaults: {},
    handles: [],
  },
};

/** A fresh copy of a kind's starting parameters — callers mutate what they get. */
export function defaultsFor(kind: FlowShapeKind): ShapeParams {
  return { ...SHAPES_REGISTRY[kind]?.defaults };
}
