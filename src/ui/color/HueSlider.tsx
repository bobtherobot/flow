import "./color.css";
import { useAreaDrag } from "./useAreaDrag";
import { keyDelta } from "./slider-keys";

interface HueSliderProps {
  /** 0–360. */
  hue: number;
  onChange: (hue: number, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

/** The rainbow track. Horizontal only — the vertical axis is ignored. */
export function HueSlider({ hue, onChange }: HueSliderProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) => onChange(Math.round(pos.x * 360), transient),
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = keyDelta(e, STEP, COARSE_STEP);
    if (delta === 0) return;
    e.preventDefault();
    // Clamped rather than wrapped: a hue that jumps 0 → 359 under the keyboard
    // reads as a bug, even though the color space really is a circle.
    onChange(Math.max(0, Math.min(360, Math.round(hue) + delta)), false);
  };

  return (
    <div
      ref={ref}
      className="flow-clr-slider flow-clr-slider--hue"
      role="slider"
      tabIndex={0}
      aria-label="Hue"
      aria-valuenow={Math.round(hue)}
      aria-valuemin={0}
      aria-valuemax={360}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-slider__thumb"
        style={{ left: `${(hue / 360) * 100}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
