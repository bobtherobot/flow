import { ColorSwatch } from "../panels/controls/ColorSwatch";

interface BackgroundControlProps {
  /** Current canvas background (`#rrggbb`). */
  value: string;
  onChange: (color: string) => void;
}

/** Canvas background swatch — reuses the flow-native ColorSwatch, bound to
 *  Excalidraw's `viewBackgroundColor`. Transparent is not offered (the canvas
 *  always has a solid background). */
export function BackgroundControl({ value, onChange }: BackgroundControlProps) {
  return (
    <div className="flow-bottombar__bg">
      <ColorSwatch value={value} onChange={onChange} ariaLabel="Canvas background" />
    </div>
  );
}
