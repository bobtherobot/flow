import "./color.css";
import { hsvToHex, type Hsv } from "../../lib/color-convert";
import { HueSlider } from "./HueSlider";
import { AlphaSlider } from "./AlphaSlider";
import { ColorPreview } from "./ColorPreview";
import { EyeDropperButton } from "./EyeDropperButton";

interface PickerRowProps {
  hsv: Hsv;
  /** 0–100. */
  alpha: number;
  /** True when the target color is "transparent". */
  isNone: boolean;
  onHue: (hue: number, transient: boolean) => void;
  onAlpha: (alpha: number, transient: boolean) => void;
  /** Absent until Phase 5 wires the eyedropper. */
  onPick?: () => void;
}

/**
 * Eyedropper, preview well and the two stacked tracks — the strip the Color
 * panel and the rail popup show identically. Their *outer* layouts differ (the
 * panel puts the saturation box beside the part chooser, the popup puts it full
 * width on top), which is why only this row is shared and not the whole picker.
 */
export function PickerRow({ hsv, alpha, isNone, onHue, onAlpha, onPick }: PickerRowProps) {
  return (
    <div className="flow-clr-row">
      <EyeDropperButton onPick={onPick} />
      <ColorPreview hex={isNone ? "transparent" : hsvToHex(hsv)} alpha={alpha} />
      <div className="flow-clr-row__tracks">
        <HueSlider hue={hsv.h} onChange={onHue} />
        <AlphaSlider alpha={alpha} hue={hsv.h} onChange={onAlpha} />
      </div>
    </div>
  );
}
