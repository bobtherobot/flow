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
    handles: [],
  },
  star: {
    kind: "star",
    label: "Star",
    geometry: star,
    defaults: { ir: 0.38, rot: 0 },
    handles: [],
  },
  cylinder: {
    kind: "cylinder",
    label: "Cylinder",
    geometry: cylinder,
    defaults: { cap: 0.18 },
    handles: [],
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
    handles: [],
  },
  cube: {
    kind: "cube",
    label: "Cube",
    geometry: cube,
    defaults: { dx: 0.25, dy: 0.2 },
    handles: [],
  },
  fatArrow: {
    kind: "fatArrow",
    label: "Fat Arrow",
    geometry: fatArrow,
    defaults: { head: 0.4, stem: 0.4 },
    handles: [],
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
