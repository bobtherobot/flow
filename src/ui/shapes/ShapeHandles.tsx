import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { flowShapeParamsOf, useShapeSelection, type SceneElement } from "./useShapeSelection";
import { useHandleDrag } from "./useHandleDrag";
import type { HandleDef } from "./types";
import "./shape-handles.css";

interface ShapeHandlesProps {
  api: ExcalidrawAPI | null;
}

/**
 * Rotate local point (x, y) about the centre of a w×h box by `angle`
 * radians — the same convention Excalidraw itself uses to place a rotated
 * element (see `pointRotateRads` in the vendor math package, which this
 * mirrors rather than imports, since it isn't re-exported from the public
 * `@excalidraw/excalidraw` entry point).
 */
function rotateAboutCenter(
  x: number,
  y: number,
  w: number,
  h: number,
  angle: number,
): readonly [number, number] {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [dx * cos - dy * sin + cx, dx * sin + dy * cos + cy];
}

interface ShapeHandleDotProps {
  api: ExcalidrawAPI;
  element: SceneElement;
  handle: HandleDef;
  label: string;
}

/**
 * One draggable orange dot. Split out from `ShapeHandles` so `useHandleDrag`
 * (a hook) has a single, unconditional call site per dot — calling a hook
 * directly inside `def.handles.map(...)` would call it a varying number of
 * times per render, which breaks the rules of hooks. Each dot is its own
 * component instance instead, which the rules of hooks allow.
 */
function ShapeHandleDot({ api, element, handle, label }: ShapeHandleDotProps) {
  const { width, height, x, y, angle } = element;
  const p = flowShapeParamsOf(element);
  const [lx, ly] = handle.at(width, height, p);
  const [rx, ry] = rotateAboutCenter(lx, ly, width, height, angle);
  const { x: vx, y: vy } = sceneCoordsToViewportCoords(
    { sceneX: x + rx, sceneY: y + ry },
    api.getAppState(),
  );
  const onPointerDown = useHandleDrag({ api, element, handle });

  return (
    <button
      type="button"
      className="flow-shape-handle"
      aria-label={`${label} ${handle.id} handle`}
      onPointerDown={onPointerDown}
      // translate(), not top/left — panning and zooming then move a
      // compositor-friendly property instead of triggering layout. The
      // second translate centres the dot on the point rather than
      // anchoring its top-left corner there.
      style={{ transform: `translate(${vx}px, ${vy}px) translate(-50%, -50%)` }}
    />
  );
}

/**
 * Handle overlay: one draggable orange dot per `HandleDef` on the single
 * selected flow shape. Positions each dot so it tracks pan, zoom, move,
 * resize and rotate, and wires it to `useHandleDrag` so dragging it reshapes
 * the element live.
 *
 * Renders nothing unless `useShapeSelection` returns a selection (single,
 * unlocked, flow-shape-carrying element of a known kind with a non-empty
 * `handles` array) — see that hook for the full rejection list.
 */
export function ShapeHandles({ api }: ShapeHandlesProps) {
  const sel = useShapeSelection(api);

  if (!sel || !api) return null;

  const { element, def } = sel;

  return (
    <div className="flow-shape-handles">
      {def.handles.map((handle) => (
        <ShapeHandleDot
          key={handle.id}
          api={api}
          element={element}
          handle={handle}
          label={def.label}
        />
      ))}
    </div>
  );
}
