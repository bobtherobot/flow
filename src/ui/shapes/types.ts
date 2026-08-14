/** The ten shapes flow draws on top of a rectangle carrier. */
export type FlowShapeKind =
  | "triangle"
  | "star"
  | "cylinder"
  | "cube"
  | "parallelogram"
  | "fatArrow"
  | "cloud"
  | "trapezoid"
  | "tape"
  | "sumJunction";

/** Parameters as fractions of the element box, each clamped to 0..1. */
export type ShapeParams = Record<string, number>;

/** What lives in `element.customData.flowShape`. */
export interface FlowShape {
  kind: FlowShapeKind;
  p: ShapeParams;
}

export type LocalPt = readonly [number, number];

export interface FlowGeometry {
  /**
   * The closed outline in local coordinates (0..w, 0..h).
   *
   * Always present. It is the hit-test polygon, and the rendered shape when
   * `path` is absent — which is why a curved shape must still supply a
   * reasonable polygonal approximation here.
   */
  points: readonly LocalPt[];
  /**
   * Optional SVG path in local coordinates, used for rendering when the shape
   * has curves. May contain several subpaths (`M … Z M … Z`) so inner detail
   * (the cylinder's cap arc, the summing junction's cross) is drawn without
   * becoming part of the hit area.
   */
  path?: string;
}

export type GeometryFn = (w: number, h: number, p: ShapeParams) => FlowGeometry;

/** One draggable orange dot. `at` and `from` must be inverses. */
export interface HandleDef {
  id: string;
  /** Where the dot sits, in local coordinates. Must land on the outline the
   *  geometry function actually draws, or the dot visibly drifts off its edge. */
  at: (w: number, h: number, p: ShapeParams) => LocalPt;
  /**
   * Turn a dragged local position back into the parameters it implies.
   *
   * Returns **only the parameters this handle owns** — callers merge the result
   * over the existing set (`{ ...p, ...from(...) }`) rather than replacing it,
   * so a shape with two handles does not lose the other one's value on drag.
   */
  from: (x: number, y: number, w: number, h: number, p: ShapeParams) => ShapeParams;
}

export interface ShapeDef {
  kind: FlowShapeKind;
  /** Accessible name; also the shapebar tool's label. */
  label: string;
  geometry: GeometryFn;
  /** Starting parameters for a newly drawn shape. */
  defaults: ShapeParams;
  /** Empty for the three shapes with no dots. */
  handles: readonly HandleDef[];
}
