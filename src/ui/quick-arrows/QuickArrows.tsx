import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SceneElement } from "../shapes/useShapeSelection";
import type { StyleMemoryHandle } from "../useStyleMemory";
import { useHoverTarget } from "./useHoverTarget";
import { useQuickArrowDrag } from "./useQuickArrowDrag";
import {
  arrowPlacement,
  visibleSides,
  type QuickArrowSide,
  type Viewport,
} from "./quick-arrow-geometry";
import "./quick-arrows.css";

interface QuickArrowsProps {
  api: ExcalidrawAPI | null;
  styleMemory?: StyleMemoryHandle | null;
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
interface QuickArrowProps {
  api: ExcalidrawAPI;
  element: SceneElement;
  side: QuickArrowSide;
  placement: { x: number; y: number; rotation: number };
  styleMemory?: StyleMemoryHandle | null;
}

/**
 * One triangle. Split out so `useQuickArrowDrag` has a single, unconditional
 * call site per glyph — calling a hook inside `visibleSides(...).map(...)`
 * would call it a varying number of times per render, which breaks the rules
 * of hooks. Same split, for the same reason, as `ShapeHandleDot`.
 */
function QuickArrow({ api, element, side, placement, styleMemory }: QuickArrowProps) {
  const onPointerDown = useQuickArrowDrag({ api, element, side, styleMemory });
  return (
    <button
      type="button"
      className="flow-quick-arrow"
      aria-label={LABELS[side]}
      onPointerDown={onPointerDown}
      style={{
        transform: `translate(${placement.x}px, ${placement.y}px) translate(-50%, -50%) rotate(${placement.rotation}deg)`,
      }}
    />
  );
}

export function QuickArrows({ api, styleMemory }: QuickArrowsProps) {
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
      {visibleSides(element, v).map((side) => (
        <QuickArrow
          key={side}
          api={api}
          element={element}
          side={side}
          placement={arrowPlacement(element, side, v)}
          styleMemory={styleMemory}
        />
      ))}
    </div>
  );
}
