/**
 * Pure geometry for the quick-arrow overlay: where the four triangles sit,
 * which of them to show, where a gesture starting from one should originate,
 * and whether the pointer is close enough to keep them on screen.
 *
 * Deliberately free of React and of `@excalidraw/excalidraw` imports — the
 * vendor package runs module-level UI code that throws under jsdom, so keeping
 * this file dependency-free is what lets the bulk of the logic be unit-tested
 * without mocking anything.
 */

export type QuickArrowSide = "n" | "e" | "s" | "w";

export const QUICK_ARROW_SIDES: readonly QuickArrowSide[] = ["n", "e", "s", "w"];

/** Viewport px from the element's bounds to the triangle's base. */
export const ARROW_GAP = 14;
/** Viewport px across the triangle's base. */
export const ARROW_WIDTH = 18;
/** Viewport px from the triangle's base to its tip. */
export const ARROW_DEPTH = 12;
/**
 * How far past the bounds the hover region reaches. It has to cover the
 * glyphs themselves: they live OUTSIDE the element, so a region that stopped
 * at the bounds would dismiss an arrow just as the pointer travelled toward
 * it, making the whole affordance unusable.
 */
export const HALO = ARROW_GAP + ARROW_DEPTH;
/**
 * Below this many viewport px, a box is too small to carry a glyph across
 * that dimension without the shape disappearing inside its own chrome.
 */
export const MIN_SIDE_PX = 20;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Radians, the convention Excalidraw stores on every element. */
  angle: number;
}

export interface Viewport {
  zoom: number;
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

/** The outward-pointing unit normal of each side on an unrotated box. */
const OUTWARD: Record<QuickArrowSide, readonly [number, number]> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

/** Glyph rotation for each side, given a triangle drawn pointing up at 0deg. */
const BASE_DEGREES: Record<QuickArrowSide, number> = { n: 0, e: 90, s: 180, w: 270 };

function rotate(dx: number, dy: number, angle: number): readonly [number, number] {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [dx * cos - dy * sin, dx * sin + dy * cos];
}

/**
 * Scene -> viewport, the same formula as vendor's `sceneCoordsToViewportCoords`
 * (`packages/common/src/utils.ts`). Reimplemented rather than imported for the
 * dependency reason in this module's docstring; `ShapeHandles.test.tsx` already
 * duplicates it for the same reason.
 */
export function toViewport(
  sceneX: number,
  sceneY: number,
  v: Viewport,
): { x: number; y: number } {
  return {
    x: (sceneX + v.scrollX) * v.zoom + v.offsetLeft,
    y: (sceneY + v.scrollY) * v.zoom + v.offsetTop,
  };
}

/**
 * The scene-space midpoint of `side`'s edge, rotated with the element.
 *
 * This is the gesture's origin, and it is load-bearing twice over.
 * `maxBindingDistance_simple` is only ~15px at zoom 1, so a gesture
 * originating under the user's finger — out on the triangle — would silently
 * fail to bind to the source shape. And an elbow arrow routes from its start
 * heading, so originating here is what makes the top arrow leave upward.
 */
export function edgeMidpoint(box: Box, side: QuickArrowSide): { x: number; y: number } {
  const cx = box.width / 2;
  const cy = box.height / 2;
  const [ox, oy] = OUTWARD[side];
  const [dx, dy] = rotate(ox * cx, oy * cy, box.angle);
  return { x: box.x + cx + dx, y: box.y + cy + dy };
}

/**
 * Viewport-space centre of `side`'s triangle, and the CSS rotation in degrees
 * that makes it point away from the shape.
 *
 * The offset from the edge is applied in VIEWPORT space, not scene space, so
 * the affordance stays the same physical size and the same physical distance
 * out at every zoom — the same reasoning as `ShapeHandles`' fixed 10px dot.
 */
export function arrowPlacement(
  box: Box,
  side: QuickArrowSide,
  v: Viewport,
): { x: number; y: number; rotation: number } {
  const mid = edgeMidpoint(box, side);
  const m = toViewport(mid.x, mid.y, v);
  const [ox, oy] = OUTWARD[side];
  const [nx, ny] = rotate(ox, oy, box.angle);
  const dist = ARROW_GAP + ARROW_DEPTH / 2;
  return {
    x: m.x + nx * dist,
    y: m.y + ny * dist,
    rotation: BASE_DEGREES[side] + (box.angle * 180) / Math.PI,
  };
}

/**
 * Which sides are worth drawing. A glyph spans `ARROW_WIDTH` across the edge
 * it sits on, so the n/s pair is gated on the box's width and the e/w pair on
 * its height — measured on screen, so zooming in re-reveals them.
 */
export function visibleSides(box: Box, v: Viewport): QuickArrowSide[] {
  const w = Math.abs(box.width) * v.zoom;
  const h = Math.abs(box.height) * v.zoom;
  return QUICK_ARROW_SIDES.filter((side) =>
    side === "n" || side === "s" ? w >= MIN_SIDE_PX : h >= MIN_SIDE_PX,
  );
}

/**
 * Is the viewport point within the element's rotated bounds expanded by
 * `HALO`? One region covering the shape AND its glyphs — see `HALO`.
 */
export function isInHaloRegion(
  box: Box,
  v: Viewport,
  clientX: number,
  clientY: number,
): boolean {
  const centre = toViewport(box.x + box.width / 2, box.y + box.height / 2, v);
  // Un-rotate the pointer about the box centre, so the test below is a plain
  // axis-aligned rectangle check in the element's own frame.
  const [lx, ly] = rotate(clientX - centre.x, clientY - centre.y, -box.angle);
  const halfW = (Math.abs(box.width) * v.zoom) / 2 + HALO;
  const halfH = (Math.abs(box.height) * v.zoom) / 2 + HALO;
  return Math.abs(lx) <= halfW && Math.abs(ly) <= halfH;
}
