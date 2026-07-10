// src/ui/panels/SwatchPicker.tsx
import { useEffect, useRef, useState } from "react";
import { scrubHex } from "../../lib/color-palettes";

export interface SwatchPickerProps {
  /** Seed color (`#rrggbb`). */
  initial: string;
  onCommit: (color: string) => void;
  onClose: () => void;
}

/**
 * A compact popover for adding or editing a single palette swatch: the OS color
 * dialog plus a forgiving hex field. Commits an opaque `#rrggbb` via scrubHex.
 */
export function SwatchPicker({ initial, onCommit, onClose }: SwatchPickerProps) {
  const [color, setColor] = useState(scrubHex(initial) ?? "#000000");
  const [hexText, setHexText] = useState(scrubHex(initial) ?? "");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [onClose]);

  const commit = (raw: string) => {
    const hex = scrubHex(raw);
    if (hex) onCommit(hex);
  };

  return (
    <div className="flow-sw-picker" role="dialog" aria-label="Swatch picker" ref={wrapRef}>
      <input
        type="color"
        className="flow-sw-picker__native"
        aria-label="Swatch color"
        value={color}
        onInput={(e) => {
          const v = (e.target as HTMLInputElement).value;
          setColor(v);
          setHexText(v);
        }}
      />
      <input
        type="text"
        className="flow-sw-picker__hex"
        aria-label="Swatch hex"
        placeholder="#rrggbb"
        value={hexText}
        onChange={(e) => setHexText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(hexText);
          if (e.key === "Escape") onClose();
        }}
      />
      <button type="button" className="flow-sw-picker__add" onClick={() => commit(hexText || color)}>
        Add color
      </button>
    </div>
  );
}
