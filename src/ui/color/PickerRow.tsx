import "./color.css";
import type { Hsv } from "../../lib/color-convert";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";
import { EyeDropperButton } from "./EyeDropperButton";

interface PickerRowProps {
  hsv: Hsv;
  /** 0–100. */
  alpha: number;
  onHue: (hue: number, transient: boolean) => void;
  onAlpha: (alpha: number, transient: boolean) => void;
  onPick?: () => void;
}

/**
 * Eyedropper and the two stacked tracks — the strip the Color panel and the
 * rail popup show identically. Their *outer* layouts differ (the panel puts
 * the saturation box beside the part chooser, the popup puts it full width on
 * top), which is why only this row is shared and not the whole picker.
 *
 * There is deliberately no preview well: the part chooser, the saturation box
 * and the numeric fields all already show the live color. Alpha is read from
 * the alpha track's thumb, and from the `A` field in the panel.
 */
export function PickerRow({ hsv, alpha, onHue, onAlpha, onPick }: PickerRowProps) {
  return (
    <div className="flow-clr-row">
      <EyeDropperButton onPick={onPick} />
      <div className="flow-clr-row__tracks">
        <HueSlider hue={hsv.h} onChange={onHue} />
        <AlphaSlider alpha={alpha} hue={hsv.h} onChange={onAlpha} />
      </div>
    </div>
  );
}
