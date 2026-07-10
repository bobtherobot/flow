import { useEffect, useRef, useState } from "react";
import { MIXED, type Mixed } from "../../../lib/selection-style";
import { scrubHex } from "../../../lib/color-palettes";
import { useDefaultPaletteColors } from "../../../lib/palette-store";

/** A hex the native `<input type=color>` will accept (it rejects transparent). */
function safeNativeHex(value: string | Mixed): string {
  if (value === MIXED || value === "transparent") return "#000000";
  return scrubHex(value) ?? "#000000";
}

interface ColorSwatchProps {
  /** Current color (`#rrggbb` or "transparent"), or MIXED across a selection. */
  value: string | Mixed;
  onChange: (color: string) => void;
  ariaLabel: string;
  /** Offer a "None" (transparent) choice — used for fills/backgrounds. */
  allowTransparent?: boolean;
  disabled?: boolean;
}

/**
 * A color well that opens a flow-native picker: preset palette, the OS color
 * dialog, a hex field, and optionally "None". Kept deliberately independent of
 * Excalidraw's ColorPicker so the panels own their look. Opacity is a separate
 * control; this handles hue only.
 */
export function ColorSwatch({
  value,
  onChange,
  ariaLabel,
  allowTransparent = false,
  disabled = false,
}: ColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const [hexText, setHexText] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);
  const presets = useDefaultPaletteColors();

  const isMixed = value === MIXED;
  const isTransparent = value === "transparent";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const swatchClass = [
    "flow-ctl-color__swatch",
    isTransparent || isMixed ? "flow-ctl-color__swatch--checker" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const commitHex = () => {
    const hex = scrubHex(hexText);
    if (hex) onChange(hex);
  };

  return (
    <div className="flow-ctl-color" ref={wrapRef}>
      <button
        type="button"
        className={swatchClass}
        style={isTransparent || isMixed ? undefined : { background: value as string }}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={isMixed ? "Mixed" : (value as string)}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        {isMixed && <span className="flow-ctl-color__mixed">–</span>}
      </button>

      {open && (
        <div className="flow-ctl-color__popover" role="dialog" aria-label={`${ariaLabel} picker`}>
          <div className="flow-ctl-color__grid">
            {presets.map((c) => (
              <button
                key={c}
                type="button"
                className="flow-ctl-color__preset"
                style={{ background: c }}
                aria-label={c}
                title={c}
                onClick={() => onChange(c)}
              />
            ))}
          </div>
          <div className="flow-ctl-color__custom">
            <input
              type="color"
              className="flow-ctl-color__native"
              aria-label={`${ariaLabel} custom`}
              value={safeNativeHex(value)}
              onChange={(e) => onChange(e.target.value)}
            />
            <input
              type="text"
              className="flow-ctl-color__hex"
              aria-label={`${ariaLabel} hex`}
              placeholder={isMixed ? "Mixed" : "#rrggbb"}
              value={hexText}
              onChange={(e) => setHexText(e.target.value)}
              onBlur={commitHex}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitHex();
              }}
            />
            {allowTransparent && (
              <button
                type="button"
                className="flow-ctl-color__none"
                onClick={() => onChange("transparent")}
              >
                None
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
