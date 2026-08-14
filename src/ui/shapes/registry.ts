import type { FlowGeometry, FlowShapeKind, ShapeDef, ShapeParams } from "./types";
import { triangle } from "./geometry/triangle";

/**
 * Every flow shape, keyed by kind. This is the single source of truth for
 * geometry, starting parameters and handles: the shapebar builds its tools from
 * it, the vendor registry is populated from it, and the handle overlay reads
 * its `handles`.
 *
 * `Partial` only because the set is incomplete until every kind lands — Task 8
 * of this plan swaps it for the full `Record<FlowShapeKind, ShapeDef>`, at which
 * point TypeScript enforces exhaustiveness and a missing shape is a compile
 * error. The accessors below already tolerate a missing entry.
 */
export const SHAPES_REGISTRY: Partial<Record<FlowShapeKind, ShapeDef>> = {
  triangle: { kind: "triangle", label: "Triangle", geometry: triangle, defaults: {}, handles: [] },
};

/** A fresh copy of a kind's starting parameters — callers mutate what they get. */
export function defaultsFor(kind: FlowShapeKind): ShapeParams {
  return { ...SHAPES_REGISTRY[kind]?.defaults };
}

/** Geometry for a kind, or null when the kind is unknown. */
export function geometryFor(
  kind: FlowShapeKind,
  w: number,
  h: number,
  p: ShapeParams,
): FlowGeometry | null {
  return SHAPES_REGISTRY[kind]?.geometry(w, h, p) ?? null;
}
