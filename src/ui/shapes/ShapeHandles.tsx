import { sceneCoordsToViewportCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { flowShapeParamsOf, useShapeSelection } from "./useShapeSelection";
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

/**
 * Read-only handle overlay: one orange dot per `HandleDef` on the single
 * selected flow shape. Dragging is a later task — today this only positions
 * the dots so they track pan, zoom, move, resize and rotate.
 *
 * Renders nothing unless `useShapeSelection` returns a selection (single,
 * unlocked, flow-shape-carrying element of a known kind with a non-empty
 * `handles` array) — see that hook for the full rejection list.
 */
export function ShapeHandles({ api }: ShapeHandlesProps) {
  const sel = useShapeSelection(api);

  if (!sel || !api) return null;

  const { element, def } = sel;
  const { width, height, x, y, angle } = element;
  const p = flowShapeParamsOf(element);
  const appState = api.getAppState();

  return (
    <div className="flow-shape-handles">
      {def.handles.map((handle) => {
        const [lx, ly] = handle.at(width, height, p);
        const [rx, ry] = rotateAboutCenter(lx, ly, width, height, angle);
        const { x: vx, y: vy } = sceneCoordsToViewportCoords(
          { sceneX: x + rx, sceneY: y + ry },
          appState,
        );
        return (
          <button
            key={handle.id}
            type="button"
            className="flow-shape-handle"
            aria-label={`${def.label} ${handle.id} handle`}
            // translate(), not top/left — panning and zooming then move a
            // compositor-friendly property instead of triggering layout. The
            // second translate centres the dot on the point rather than
            // anchoring its top-left corner there.
            style={{ transform: `translate(${vx}px, ${vy}px) translate(-50%, -50%)` }}
          />
        );
      })}
    </div>
  );
}
