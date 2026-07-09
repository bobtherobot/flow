import { minusIcon, plusIcon } from "./icons";

interface ZoomControlProps {
  /** Current zoom as a whole-number percentage. */
  pct: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  /** Reset to 100% (bound to clicking the percentage). */
  onReset: () => void;
}

/** The `−  {pct}%  +` zoom cluster. Clicking the percentage resets to 100%. */
export function ZoomControl({ pct, onZoomIn, onZoomOut, onReset }: ZoomControlProps) {
  return (
    <div className="flow-bottombar__zoom" role="group" aria-label="Zoom">
      <button
        type="button"
        className="flow-bottombar__btn"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={onZoomOut}
      >
        {minusIcon}
      </button>
      <button
        type="button"
        className="flow-bottombar__zoom-pct"
        aria-label={`Zoom ${pct}%, click to reset`}
        title="Reset zoom to 100%"
        onClick={onReset}
      >
        {pct}%
      </button>
      <button
        type="button"
        className="flow-bottombar__btn"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={onZoomIn}
      >
        {plusIcon}
      </button>
    </div>
  );
}
