import { useState } from "react";
import "./color.css";
import { NumberInput } from "../panels/controls/NumberInput";
import { splitColorAlpha } from "../../lib/color-alpha";
import {
  hexToHsv, hsvToHex, hsvToRgb, rgbToHsv,
  hsvToHsl, hslToHsv, type Hsv,
} from "../../lib/color-convert";
import type { NumericMode } from "../../app/preferences";

interface NumericFieldsProps {
  hsv: Hsv;
  /** 0–100, as everywhere else in flow. Displayed here as 0–1. */
  alpha: number;
  mode: NumericMode;
  onModeChange: (mode: NumericMode) => void;
  onChange: (next: { hsv: Hsv; alpha: number }, transient: boolean) => void;
  disabled?: boolean;
}

const MODE_LABELS: Record<NumericMode, string> = {
  hsla: "HSLA",
  rgba: "RGBA",
  hex: "HEX",
};

/**
 * The numeric row. HSLA by default; RGBA and HEX behind the format select.
 *
 * The switcher is a real `<select>` even though the reference design draws it
 * as a chevron stack: a cycle button would be unreachable by keyboard and
 * nameless to a screen reader. CSS makes it look the part.
 *
 * H/S/L and R/G/B ride on `NumberInput`, so they inherit drag-to-scrub and the
 * cross-engine spin-button handling that control already solved.
 */
export function NumericFields({
  hsv, alpha, mode, onModeChange, onChange, disabled = false,
}: NumericFieldsProps) {
  // Free-typed hex text between focus and commit. null means "not editing" —
  // the field then falls back to formatting the live hsv/alpha.
  const [hexText, setHexText] = useState<string | null>(null);

  const emit = (next: Partial<{ hsv: Hsv; alpha: number }>, transient: boolean) =>
    onChange({ hsv: next.hsv ?? hsv, alpha: next.alpha ?? alpha }, transient);

  // The only place 0–100 alpha becomes the 0–1 display value the reference
  // design calls for, and back again on the way out.
  const onAlpha = (v: number, transient: boolean) =>
    emit({ alpha: Math.max(0, Math.min(100, v * 100)) }, transient);

  const alphaField = (
    <NumberInput
      value={Number((alpha / 100).toFixed(2))}
      min={0}
      max={1}
      step={0.01}
      onChange={onAlpha}
      ariaLabel="Alpha"
      disabled={disabled}
      className="flow-clr-num"
    />
  );

  const switcher = (
    <select
      className="flow-clr-mode"
      aria-label="Color format"
      value={mode}
      disabled={disabled}
      onChange={(e) => onModeChange(e.target.value as NumericMode)}
    >
      {(Object.keys(MODE_LABELS) as NumericMode[]).map((m) => (
        <option key={m} value={m}>{MODE_LABELS[m]}</option>
      ))}
    </select>
  );

  if (mode === "hex") {
    const shown = hexText ?? hsvToHex(hsv);
    const commit = () => {
      const raw = (hexText ?? "").trim();
      setHexText(null);
      if (!raw) return;
      // An 8-digit hex carries its own alpha; splitColorAlpha peels it off.
      const withHash = raw.startsWith("#") ? raw : `#${raw}`;
      const parts = splitColorAlpha(withHash);
      const next = hexToHsv(parts.hex);
      if (!next) return;
      const hadAlphaByte = /^#[0-9a-f]{8}$/i.test(withHash);
      emit({ hsv: next, alpha: hadAlphaByte ? parts.alpha : alpha }, false);
    };
    return (
      <div className="flow-clr-numrow">
        <input
          type="text"
          className="flow-clr-hex"
          aria-label="Hex"
          value={shown}
          disabled={disabled}
          onChange={(e) => setHexText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setHexText(null);
          }}
        />
        {switcher}
      </div>
    );
  }

  if (mode === "rgba") {
    const rgb = hsvToRgb(hsv);
    const setChannel = (key: "r" | "g" | "b") => (v: number, transient: boolean) =>
      emit({ hsv: rgbToHsv({ ...rgb, [key]: v }) }, transient);
    return (
      <div className="flow-clr-numrow">
        <NumberInput value={Math.round(rgb.r)} min={0} max={255} onChange={setChannel("r")} ariaLabel="Red" disabled={disabled} className="flow-clr-num" />
        <NumberInput value={Math.round(rgb.g)} min={0} max={255} onChange={setChannel("g")} ariaLabel="Green" disabled={disabled} className="flow-clr-num" />
        <NumberInput value={Math.round(rgb.b)} min={0} max={255} onChange={setChannel("b")} ariaLabel="Blue" disabled={disabled} className="flow-clr-num" />
        {alphaField}
        {switcher}
      </div>
    );
  }

  const hsl = hsvToHsl(hsv);
  const setHsl = (key: "h" | "s" | "l") => (v: number, transient: boolean) =>
    emit({ hsv: hslToHsv({ ...hsl, [key]: v }) }, transient);

  return (
    <div className="flow-clr-numrow">
      <NumberInput value={Math.round(hsl.h)} min={0} max={360} onChange={setHsl("h")} ariaLabel="Hue" disabled={disabled} className="flow-clr-num" />
      <NumberInput value={Math.round(hsl.s)} min={0} max={100} onChange={setHsl("s")} ariaLabel="Saturation" disabled={disabled} className="flow-clr-num" />
      <NumberInput value={Math.round(hsl.l)} min={0} max={100} onChange={setHsl("l")} ariaLabel="Lightness" disabled={disabled} className="flow-clr-num" />
      {alphaField}
      {switcher}
    </div>
  );
}
