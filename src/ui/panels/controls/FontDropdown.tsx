import { useEffect, useRef, useState } from "react";
import { MIXED, type Mixed } from "../../../lib/selection-style";

export interface FontOption {
  value: number;
  label: string;
  /** CSS font-family used to preview the option in its own typeface. */
  css: string;
}

interface FontDropdownProps {
  options: readonly FontOption[];
  value: number | Mixed | null;
  onChange: (value: number) => void;
  ariaLabel: string;
  disabled?: boolean;
}

/**
 * Font-family picker: a button showing the current family (rendered in that
 * font) that opens a listbox of options, each previewed in its own typeface.
 * MIXED shows an em dash. Flow-native so the panels own the look.
 */
export function FontDropdown({ options, value, onChange, ariaLabel, disabled = false }: FontDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [open]);

  const selected = value === MIXED || value === null ? undefined : options.find((o) => o.value === value);

  return (
    <div className="flow-ctl-font" ref={wrapRef}>
      <button
        type="button"
        className="flow-ctl-font__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        style={selected ? { fontFamily: selected.css } : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="flow-ctl-font__value">{value === MIXED ? "—" : selected?.label ?? "—"}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="flow-ctl-font__caret">
          <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <ul className="flow-ctl-font__list" role="listbox" aria-label={ariaLabel}>
          {options.map((opt) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={selected?.value === opt.value}
              className="flow-ctl-font__option"
              style={{ fontFamily: opt.css }}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
