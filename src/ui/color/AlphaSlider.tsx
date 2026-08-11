import "./color.css";
import { hsvToHex } from "../../lib/color-convert";
import { useAreaDrag } from "./useAreaDrag";
import { keyDelta } from "./slider-keys";

interface AlphaSliderProps {
  /** 0–100. */
  alpha: number;
  /** 0–360, used only to paint the ramp. */
  hue: number;
  onChange: (alpha: number, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

/** Opacity track: a transparent→opaque ramp of the current hue laid over a
 *  checkerboard, so the alpha reads at a glance. */
export function AlphaSlider({ alpha, hue, onChange }: AlphaSliderProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) => onChange(Math.round(pos.x * 100), transient),
  });

  const solid = hsvToHex({ h: hue, s: 100, v: 100 });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = keyDelta(e, STEP, COARSE_STEP);
    if (delta === 0) return;
    e.preventDefault();
    onChange(Math.max(0, Math.min(100, Math.round(alpha) + delta)), false);
  };

  return (
    <div
      ref={ref}
      className="flow-clr-slider flow-clr-slider--alpha"
      role="slider"
      tabIndex={0}
      aria-label="Opacity"
      aria-valuenow={Math.round(alpha)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ ["--flow-clr-ramp" as string]: solid }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-slider__thumb"
        style={{ left: `${alpha}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
