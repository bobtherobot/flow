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

  const draft = useColorDraft({
    hex: target.hex,
    alpha: target.alpha,
    onCommit: target.setColor,
  });

  return (
    <div className="flow-clr-panel">
      <div className="flow-clr-panel__top">
        <PartChooser target={target} />
        <SaturationBox hsv={draft.hsv} onChange={draft.setSv} />
      </div>

      <PickerRow
        hsv={draft.hsv}
        alpha={draft.alpha}
        isNone={draft.isNone}
        onHue={draft.setHue}
        onAlpha={draft.setAlpha}
      />

      <NumericFields
        hsv={draft.hsv}
        alpha={draft.alpha}
        mode={numericMode}
        onModeChange={setNumericMode}
        onChange={draft.setHsvAlpha}
      />

      <PaletteSection
        currentColor={hsvToHex(draft.hsv)}
        onPick={(hex) => target.setColor(hex, draft.alpha, false)}
      />
    </div>
  );
}
