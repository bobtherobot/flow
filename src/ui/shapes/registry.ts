import type { FlowGeometry, FlowShapeKind, ShapeDef, ShapeParams } from "./types";
import { triangle } from "./geometry/triangle";
import { parallelogram } from "./geometry/parallelogram";
import { trapezoid } from "./geometry/trapezoid";
import { star } from "./geometry/star";
import { cylinder } from "./geometry/cylinder";
import { cloud } from "./geometry/cloud";
import { tape } from "./geometry/tape";
import { cube } from "./geometry/cube";
import { fatArrow } from "./geometry/fatArrow";
import { sumJunction } from "./geometry/sumJunction";

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
        // Clamped to 0.9, not the geometry function's own 1.0: skew === 1
        // collapses the parallelogram to a zero-area line (top and bottom
        // edges coincide), and nothing else catches that — the invariant
        // helper (geometry/invariants.ts) only checks that the outline's
        // first and last points differ, not that adjacent ones do. 0.9 is a
        // UI reachability limit only; the geometry function's own 0..1 clamp
        // is unchanged, so this just keeps a *dragged* handle from ever
        // reaching the degenerate value.
        at: (w, _h, p) => [Math.min(Math.max(p.skew ?? 0.25, 0), 0.9) * w, 0],
        from: (x, _y, w) => ({
          skew: w === 0 ? 0 : Math.min(Math.max(x / w, 0), 0.9),
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
        // Matches the geometry function's own clamp exactly (0..0.5) — unlike
        // parallelogram's skew, inset === 0.5 (top edge collapsed to a point,
        // an isoceles triangle) is a valid, non-degenerate shape, so there's
        // no need for a UI-only margin short of the geometry's own limit.
        at: (w, _h, p) => [Math.min(Math.max(p.inset ?? 0.2, 0), 0.5) * w, 0],
        from: (x, _y, w) => ({
          inset: w === 0 ? 0 : Math.min(Math.max(x / w, 0), 0.5),
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
        // of the geometry's own clamp. `ir` is bounded 0.05..0.95 by the
        // geometry itself — at 0.95 the inner and outer vertices simply sit
        // close together (a near-decagon, still non-zero area, still
        // simple/non-self-intersecting since the ten vertices are visited at
        // strictly increasing angle); at 0.05 the points are sharp but the
        // star still encloses positive area. `rot` is a full rotation with no
        // degenerate value at all. So no parallelogram-style extra clamp.
        id: "inner",
        at: (w, h, p) => {
          const ir = Math.min(Math.max(p.ir ?? 0.38, 0.05), 0.95);
          const a = -Math.PI / 2 + (p.rot ?? 0) * Math.PI * 2 + Math.PI / 5;
          return [w / 2 + Math.cos(a) * (w / 2) * ir, h / 2 + Math.sin(a) * (h / 2) * ir];
        },
        from: (x, y, w, h) => {
          // Normalize into a unit circle so a non-square box still maps cleanly.
          const ux = w === 0 ? 0 : (x - w / 2) / (w / 2);
          const uy = h === 0 ? 0 : (y - h / 2) / (h / 2);
          const turn = (v: number) => ((v % 1) + 1) % 1; // keep rot in 0..1
          return {
            ir: Math.min(Math.max(Math.hypot(ux, uy), 0.05), 0.95),
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
        // Degenerate-clamp check: `cap` is already bounded 0.02..0.45 by the
        // geometry itself specifically so the two cap ellipses never cross
        // (see cylinder.ts's own comment); the handle reuses that bound
        // as-is rather than narrowing it further, since 0.45 itself is
        // already the safe boundary, not a degenerate one.
        id: "cap",
        at: (w, h, p) => [w / 2, 2 * Math.min(Math.max(p.cap ?? 0.18, 0.02), 0.45) * h],
        from: (_x, y, _w, h) => ({
          cap: h === 0 ? 0.02 : Math.min(Math.max(y / (2 * h), 0.02), 0.45),
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
        // `y = 2*amp*h`. This is the continuous formula the geometry samples
        // from (24 straight segments across the width) — the handle sits on
        // the true sine peak, which can differ from the polyline by a
        // sub-pixel amount between samples (worse at low `wave`, where the
        // geometry's own comment already documents aliasing from too few
        // samples per cycle). That's the geometry's known sampling
        // limitation, not a handle defect, and needs no change here.
        //
        // Degenerate-clamp check: `amp` (0..0.4) and `wave` (0.15..1) are
        // both bounded by the geometry itself with no degenerate value
        // inside that range — at `amp = 0` the band flattens to a straight
        // rectangle (still positive area), and top/bottom edges never touch
        // even at max amplitude (insets keep them `h - 2*amp = 0.2h` apart).
        // No extra clamp needed.
        id: "wave",
        at: (w, h, p) => [
          (w * Math.min(Math.max(p.wave ?? 0.5, 0.15), 1)) / 4,
          2 * Math.min(Math.max(p.amp ?? 0.12, 0), 0.4) * h,
        ],
        from: (x, y, w, h) => ({
          wave: w === 0 ? 0.15 : Math.min(Math.max((4 * x) / w, 0.15), 1),
          amp: h === 0 ? 0 : Math.min(Math.max(y / (2 * h), 0), 0.4),
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
        // Degenerate-clamp check: `dx`/`dy` are bounded 0.02..0.6 by the
        // geometry itself; at the max, the front face is still `0.4w x 0.4h`
        // — comfortably non-degenerate. No extra clamp needed.
        id: "depth",
        at: (w, h, p) => [
          w * (1 - Math.min(Math.max(p.dx ?? 0.25, 0.02), 0.6)),
          h * Math.min(Math.max(p.dy ?? 0.2, 0.02), 0.6),
        ],
        from: (x, y, w, h) => ({
          dx: w === 0 ? 0.02 : Math.min(Math.max(1 - x / w, 0.02), 0.6),
          dy: h === 0 ? 0.02 : Math.min(Math.max(y / h, 0.02), 0.6),
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
        // Degenerate-clamp check: `head` is bounded 0.05..0.95 by the
        // geometry itself; even at 0.95 the shaft keeps `0.05w` of width. No
        // extra clamp needed.
        id: "head",
        at: (w, _h, p) => [w * (1 - Math.min(Math.max(p.head ?? 0.4, 0.05), 0.95)), 0],
        from: (x, _y, w) => ({
          head: w === 0 ? 0.05 : Math.min(Math.max(1 - x / w, 0.05), 0.95),
        }),
      },
      {
        // The stem's top edge — geometry.ts's `[0, top]` where
        // `top = (h - stem) / 2`, a literal member of `points`.
        //
        // Degenerate-clamp check: `stem` is bounded 0.05..1 by the geometry
        // itself; at 1 the stem spans the full height without inverting
        // top/bottom (documented in fatArrow.ts as intentional, not
        // degenerate — it's a valid, thick arrow). No extra clamp needed.
        id: "stem",
        at: (_w, h, p) => [0, (h * (1 - Math.min(Math.max(p.stem ?? 0.4, 0.05), 1))) / 2],
        from: (_x, y, _w, h) => ({
          stem: h === 0 ? 0.05 : Math.min(Math.max(1 - (2 * y) / h, 0.05), 1),
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

/**
 * Geometry for a kind, or null when the kind is unknown.
 *
 * `SHAPES_REGISTRY` is now typed `Record<FlowShapeKind, ShapeDef>`, so any
 * value that actually type-checks as `FlowShapeKind` resolves to a real
 * entry. The `?.`/`?? null` here still guard the runtime case a bad value is
 * smuggled past the type system (an `as never` cast, external/untrusted
 * data) — unlike the `Object.values` iteration in `register.ts`, this is a
 * keyed lookup on a caller-supplied value, so it can't lean on the object
 * literal having been built with every key.
 */
export function geometryFor(
  kind: FlowShapeKind,
  w: number,
  h: number,
  p: ShapeParams,
): FlowGeometry | null {
  return SHAPES_REGISTRY[kind]?.geometry(w, h, p) ?? null;
}
