import { ColorSwatch } from "./controls/ColorSwatch";
import { SliderInput } from "./controls/SliderInput";
import { MIXED, readFormValue, type SelectedElementIds } from "../../lib/selection-style";
import { splitColorAlpha, combineColorAlpha } from "../../lib/color-alpha";
import { DEFAULT_LASER_HEX } from "../../lib/laser-color";
import type { SelectionStyle } from "./useSelectionStyle";

interface ColorRowProps {
  sel: SelectionStyle;
  label: string;
  /** Reads the raw color string off an element. */
  colorOf: (el: SelectionStyle["elements"][number]) => string;
  /** The element property to write and its currentItem* default key. */
  prop: string;
  currentItemKey: string;
  /** currentItem default color when nothing is selected. */
  fallbackColor: string;
  ids: SelectedElementIds;
  allowTransparent?: boolean;
  disabled?: boolean;
  /** When set, replaces the default per-element write — used by the always-global
   *  Laser row to persist + live-update instead of writing element props. */
  onWrite?: (color: string) => void;
}

/**
 * One "color + opacity" row. The swatch edits hue only; opacity is a separate
 * slider. They are combined into an 8-digit hex written to the element so each
 * color carries its own opacity (Excalidraw's element `opacity` is a single
 * value and can't do this). MIXED selections show an indeterminate swatch and
 * an empty opacity field.
 */
function ColorRow({
  sel,
  label,
  colorOf,
  prop,
  currentItemKey,
  fallbackColor,
  ids,
  allowTransparent = false,
  disabled = false,
  onWrite,
}: ColorRowProps) {
  const fallback = splitColorAlpha(fallbackColor);
  const hue = readFormValue(sel.elements, ids, (el) => splitColorAlpha(colorOf(el)).hex, fallback.hex);
  const alpha = readFormValue(sel.elements, ids, (el) => splitColorAlpha(colorOf(el)).alpha, fallback.alpha);

  const isTransparent = hue === "transparent";
  const currentAlpha = alpha === MIXED ? 100 : alpha;

  const write = (color: string) =>
    onWrite ? onWrite(color) : sel.setProp({ prop, value: color, currentItemKey, ids });

  const onColor = (hex: string) => {
    if (hex === "transparent") return write("transparent");
    write(combineColorAlpha(hex, currentAlpha > 0 ? currentAlpha : 100));
  };
  const onOpacity = (next: number) => {
    const base = hue === MIXED || isTransparent ? "#1e1e1e" : hue;
    write(combineColorAlpha(base, next));
  };

  return (
    <div className="flow-ctl-row" aria-disabled={disabled || undefined}>
      <span className="flow-ctl-row__label">{label}</span>
      <div className="flow-ctl-row__control">
        <ColorSwatch
          value={hue}
          onChange={onColor}
          ariaLabel={`${label} color`}
          allowTransparent={allowTransparent}
          disabled={disabled}
        />
        <SliderInput
          value={isTransparent ? 0 : alpha === MIXED ? null : alpha}
          min={0}
          max={100}
          unit="%"
          onChange={onOpacity}
          ariaLabel={`${label} opacity`}
          disabled={disabled || isTransparent}
        />
      </div>
    </div>
  );
}

/**
 * Color panel: background / stroke / text color, each with its own opacity. Text
 * color targets selected text (and bound container text) and is disabled when
 * the selection has none. With an empty selection the rows edit the tool
 * defaults, Illustrator-style.
 */
export function ColorPanel({
  sel,
  onChangeLaserColor,
}: {
  sel: SelectionStyle;
  onChangeLaserColor: (color: string) => void;
}) {
  const a = sel.appState;
  return (
    <div className="flow-color-panel">
      <ColorRow
        sel={sel}
        label="Fill"
        colorOf={(el) => el.backgroundColor}
        prop="backgroundColor"
        currentItemKey="currentItemBackgroundColor"
        fallbackColor={a?.currentItemBackgroundColor ?? "transparent"}
        ids={sel.selectedIds}
        allowTransparent
      />
      <ColorRow
        sel={sel}
        label="Stroke"
        colorOf={(el) => el.strokeColor}
        prop="strokeColor"
        currentItemKey="currentItemStrokeColor"
        fallbackColor={a?.currentItemStrokeColor ?? "#1e1e1e"}
        ids={sel.selectedIds}
      />
      <ColorRow
        sel={sel}
        label="Text"
        colorOf={(el) => el.strokeColor}
        prop="strokeColor"
        currentItemKey="currentItemTextColor"
        fallbackColor={a?.currentItemTextColor ?? "#1e1e1e"}
        ids={sel.textTargetIds}
        disabled={!sel.hasText}
      />
      <ColorRow
        sel={sel}
        label="Laser"
        colorOf={() => DEFAULT_LASER_HEX}
        prop="laserColor"
        currentItemKey="laserColor"
        fallbackColor={(a as { laserColor?: string } | null)?.laserColor ?? DEFAULT_LASER_HEX}
        ids={{}}
        onWrite={onChangeLaserColor}
      />
    </div>
  );
}
