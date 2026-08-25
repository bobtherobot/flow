import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useHoverTarget } from "./useHoverTarget";
import {
  arrowPlacement,
  visibleSides,
  type QuickArrowSide,
  type Viewport,
} from "./quick-arrow-geometry";
import "./quick-arrows.css";

interface QuickArrowsProps {
  api: ExcalidrawAPI | null;
}

const LABELS: Record<QuickArrowSide, string> = {
  n: "Quick arrow up",
  e: "Quick arrow right",
  s: "Quick arrow down",
  w: "Quick arrow left",
};

interface ViewportAppState {
  zoom: { value: number };
  scrollX: number;
  scrollY: number;
  offsetLeft: number;
  offsetTop: number;
}

/**
 * The quick-arrow overlay: four translucent triangles around the hovered
 * bindable shape. Press one and drag to draw an elbow arrow from that side of
 * the shape, without picking up the arrow tool.
 *
 * Mounted as a sibling of `<Excalidraw>` (see `useHoverTarget`'s docstring for
 * why it can never live inside `App`), and modelled closely on
 * `src/ui/shapes/ShapeHandles.tsx` — real `<button>`s in a `pointer-events:
 * none` overlay, positioned by `transform` so pan and zoom stay
 * compositor-friendly.
 */
export function QuickArrows({ api }: QuickArrowsProps) {
  const element = useHoverTarget(api);

  if (!api || !element) return null;

  const state = api.getAppState() as unknown as ViewportAppState;
  const v: Viewport = {
    zoom: state.zoom.value,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    offsetLeft: state.offsetLeft,
    offsetTop: state.offsetTop,
  };

  return (
    <div className="flow-quick-arrows">
      {visibleSides(element, v).map((side) => {
        const p = arrowPlacement(element, side, v);
        return (
          <button
            key={side}
            type="button"
            className="flow-quick-arrow"
            aria-label={LABELS[side]}
            style={{
              // The second translate centres the glyph on its anchor rather
              // than anchoring its top-left corner there; the rotation is
              // applied last so it spins about that centre.
              transform: `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) rotate(${p.rotation}deg)`,
            }}
          />
        );
      })}
    </div>
  );
}
