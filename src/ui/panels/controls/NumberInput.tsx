import { useEffect, useRef } from "react";
import { useNumberField } from "./useNumberField";
import { useScrubDrag } from "./useScrubDrag";
import { resetDeferred } from "../../../lib/deferred-commit";

interface NumberInputProps {
  /** Current value, or null when the selection is mixed (renders empty). */
  value: number | null;
  min?: number;
  max?: number;
  /** Granularity for the scrub gesture. When passed explicitly it also snaps
   *  typed values; left undefined, typed values are only range-clamped. */
  step?: number;
  /** Optional short unit suffix (e.g. "px"). */
  unit?: string;
  /** Value units a full drag traverses. Defaults to the min/max range, which is
   *  right wherever the bounds are a designed range; fields whose bounds are
   *  sanity clamps (position, size) pass their own. */
  scrubSpan?: number;
  /** `transient` is true for every value during a drag and false for typed
   *  commits and the single commit ending a drag. */
  onChange: (value: number, transient: boolean) => void;
  ariaLabel: string;
  disabled?: boolean;
  /** Associates an external <label htmlFor>. */
  id?: string;
  /** Extra class on the wrapper, for host-specific sizing. */
  className?: string;
}

/**
 * A numeric field that can be dragged like Firefox devtools' CSS inspector: hover
 * shows an ns-resize cursor, dragging up/down scrubs the value live, and a click
 * without movement focuses the field to type instead. A `↕` grip advertises the
 * gesture and keeps working while the field is focused, where the field body
 * yields to normal text selection.
 *
 * `null` renders empty (mixed selection) and disables the scrub. Typed values
 * commit on blur or Enter, never per keystroke; Escape reverts.
 */
export function NumberInput({
  value,
  min = -Infinity,
  max = Infinity,
  step,
  unit,
  scrubSpan,
  onChange,
  ariaLabel,
  disabled = false,
  id,
  className,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const field = useNumberField({ value, min, max, step, onChange: (v) => onChange(v, false) });

  const range = max - min;
  const span = scrubSpan ?? (Number.isFinite(range) ? range : null);

  const scrub = useScrubDrag({
    value,
    min,
    max,
    step: step ?? 1,
    span,
    disabled,
    onScrub: onChange,
    onClick: () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
  });

  // Hold the resize cursor while the pointer is outside the field mid-drag.
  // The cleanup also releases the deferred-commit bit: a scrub that never
  // reaches its commit (this field unmounting mid-drag — a panel collapsing, a
  // layout being applied) would otherwise leave the bit set, and the next
  // unrelated panel write would inherit authority to skip the vendor's
  // uncommitted-element filter. On a normal drag end the commit has already
  // consumed the bit by the time this runs, so the release is a no-op.
  //
  // This is keyed on the isDragging transition, unlike SliderInput's equivalent
  // release (unmount-only): useScrubDrag already exposes isDragging as a
  // reactive signal for this gesture, so keying off it (rather than waiting for
  // unmount) releases the bit as soon as the drag itself ends, not just when
  // this component happens to unmount mid-drag.
  useEffect(() => {
    if (!scrub.isDragging) return;
    document.body.classList.add("flow-scrubbing");
    return () => {
      document.body.classList.remove("flow-scrubbing");
      resetDeferred();
    };
  }, [scrub.isDragging]);

  return (
    <div
      className={`flow-ctl-num${className ? ` ${className}` : ""}`}
      aria-disabled={disabled || undefined}
    >
      {value !== null && span !== null && (
        <span
          className="flow-ctl-num__grip"
          aria-hidden="true"
          onPointerDown={scrub.onPointerDown}
        >
          <svg width="8" height="14" viewBox="0 0 8 14" fill="none">
            <path
              d="M4 1.5 L6.5 4.5 H1.5 Z M4 12.5 L6.5 9.5 H1.5 Z"
              fill="currentColor"
            />
          </svg>
        </span>
      )}
      <input
        ref={inputRef}
        id={id}
        type="number"
        className="flow-ctl-num__input"
        aria-label={ariaLabel}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        value={field.text}
        disabled={disabled}
        onFocus={field.onFocus}
        onBlur={field.onBlur}
        onChange={field.onChange}
        onKeyDown={field.onKeyDown}
        onPointerDown={(e) => {
          // A focused field is being edited: leave the body to text selection.
          if (document.activeElement === inputRef.current) return;
          scrub.onPointerDown(e);
        }}
      />
      {unit && <span className="flow-ctl-num__unit">{unit}</span>}
    </div>
  );
}
