import { useEffect, useRef } from "react";
import "../color/color.css";
import { PartChooser } from "../color/PartChooser";
import { SaturationBox } from "../color/SaturationBox";
import { PickerRow } from "../color/PickerRow";
import { NumericFields } from "../color/NumericFields";
import { PaletteSection } from "../color/PaletteSection";
import { useColorTarget } from "../color/useColorTarget";
import { useColorDraft } from "../color/useColorDraft";
import { useColorUiState, setNumericMode } from "../../lib/color-store";
import { hsvToHex } from "../../lib/color-convert";
import { openEyeDropper, cancelEyeDropper, type EyeDropperHandle } from "../../lib/eyedropper";
import type { SelectionStyle } from "./useSelectionStyle";

/**
 * The one place color is edited. The part chooser picks which of the
 * selection's colors every other control below it is aimed at; the picker reads
 * and writes that color live through `useColorTarget`, so the panel is always a
 * view of the current object rather than a form you submit.
 */
export function ColorPanel({ sel }: { sel: SelectionStyle }) {
  const target = useColorTarget(sel);
  const { numericMode } = useColorUiState();

  // Every write from the picker's channels — saturation, hue, alpha — lands
  // through the draft so HSV survives a round trip through an achromatic hex.
  const draft = useColorDraft({
    hex: target.hex,
    alpha: target.alpha,
    onCommit: target.setColor,
  });

  // The accordion can collapse this panel (or swap it for another) while a
  // pick is in flight. The overlay lives outside this component's subtree
  // (LayerUI mounts it globally), so it would otherwise survive the unmount
  // with `onSelect` closing over a `target`/`draft` that no longer exists.
  // `cancelEyeDropper` only clears the atom if it's still this panel's own
  // handle — the rail popup shares the same global atom and can have its own
  // pick in flight when this panel happens to unmount.
  const pick = useRef<EyeDropperHandle | null>(null);
  useEffect(() => () => cancelEyeDropper(pick.current), []);

  return (
    <div className="flow-clr-panel">
      <div className="flow-clr-panel__top">
        <PartChooser target={target} />
        <SaturationBox hsv={draft.hsv} onChange={draft.setSv} />
      </div>

      <PickerRow
        hsv={draft.hsv}
        alpha={draft.alpha}
        onHue={draft.setHue}
        onAlpha={draft.setAlpha}
        onPick={() => {
          pick.current = openEyeDropper({
            part: target.part,
            onSelect: (hex) => target.setColor(hex, draft.alpha, false),
          });
        }}
      />

      <NumericFields
        hsv={draft.hsv}
        alpha={draft.alpha}
        mode={numericMode}
        onModeChange={setNumericMode}
        onChange={draft.setHsvAlpha}
        onHexCommit={(hex, hexAlpha) => target.setColor(hex, hexAlpha, false)}
      />

      <PaletteSection
        currentColor={hsvToHex(draft.hsv)}
        onPick={(hex) => target.setColor(hex, draft.alpha, false)}
      />
    </div>
  );
}
