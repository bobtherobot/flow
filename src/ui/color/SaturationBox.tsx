import "./color.css";
import { hsvToHex, type Hsv } from "../../lib/color-convert";
import { useAreaDrag } from "./useAreaDrag";

interface SaturationBoxProps {
  hsv: Hsv;
  /** Reports S and V only; hue belongs to the slider. */
  onChange: (sv: { s: number; v: number }, transient: boolean) => void;
}

const STEP = 1;
const COARSE_STEP = 10;

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * The 2D field: saturation left→right, value top→bottom over a backdrop of the
 * pure hue. Reporting S/V without touching H is the whole point — it is what
 * lets a user drag into the black corner and back out with their hue intact.
 *
 * `role="application"` rather than a slider: this is a two-axis control, and
 * there is no ARIA slider that carries two values.
 */
export function SaturationBox({ hsv, onChange }: SaturationBoxProps) {
  const { ref, onPointerDown } = useAreaDrag({
    onChange: (pos, transient) =>
      onChange({ s: Math.round(pos.x * 100), v: Math.round((1 - pos.y) * 100) }, transient),
  });

  const onKeyDown = (e: React.KeyboardEvent) => {
    const size = e.shiftKey ? COARSE_STEP : STEP;
    const ds = e.key === "ArrowRight" ? size : e.key === "ArrowLeft" ? -size : 0;
    const dv = e.key === "ArrowUp" ? size : e.key === "ArrowDown" ? -size : 0;
    if (ds === 0 && dv === 0) return;
    e.preventDefault();
    onChange(
      { s: clamp100(Math.round(hsv.s) + ds), v: clamp100(Math.round(hsv.v) + dv) },
      false,
    );
  };

  return (
    <div
      ref={ref}
      className="flow-clr-satbox"
      role="application"
      tabIndex={0}
      aria-label={`Saturation and brightness, ${Math.round(hsv.s)}% and ${Math.round(hsv.v)}%`}
      style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    >
      <span
        className="flow-clr-satbox__thumb"
        style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
        aria-hidden="true"
      />
    </div>
  );
}
