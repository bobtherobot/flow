import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface UseNumberFieldArgs {
  /** Current committed value, or null for a mixed (empty) field. */
  value: number | null;
  min: number;
  max: number;
  /** Optional step to snap the committed value to (within [min,max]). When
   *  omitted, the committed value is only range-clamped, not snapped. */
  step?: number;
  onChange: (value: number) => void;
}

interface NumberFieldBinding {
  /** Controlled text for the `<input value>`. */
  text: string;
  onFocus: () => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Behaviour for a numeric text field that only *commits* on blur or Enter — not
 * on every keystroke — so a value doesn't churn while the user is still typing.
 * Escape reverts to the current value. While the user is not editing, the field
 * reflects external value changes. Used by NumberInput's typed-entry path (its
 * drag-to-scrub gesture stays live, since that's a deliberate gesture, not typing).
 */
export function useNumberField({ value, min, max, step, onChange }: UseNumberFieldArgs): NumberFieldBinding {
  const [text, setText] = useState(value === null ? "" : String(value));
  const focused = useRef(false);
  // Tracks the last value we know the parent holds, so re-committing an unchanged
  // value (e.g. Enter then the blur it triggers) doesn't fire a redundant change.
  const committed = useRef(value);
  // Set by Escape so the blur it triggers reverts instead of committing.
  const cancelled = useRef(false);

  const reflect = () => setText(value === null ? "" : String(value));

  useEffect(() => {
    committed.current = value;
    if (!focused.current) setText(value === null ? "" : String(value));
    // reflect intentionally excluded: it closes over this render's `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Clamp + step-snap a raw number, then push it through as the committed
  // value — updating the displayed text and firing onChange, unless it's
  // unchanged from what the parent already holds. Shared by the typed-entry
  // commit path (below) and arrow-key stepping, so both apply identical
  // float-noise rounding and identical "don't re-fire an unchanged value"
  // bookkeeping.
  const commitValue = (n: number) => {
    const clamped = clamp(n, min, max);
    const snapped =
      typeof step === "number" && Number.isFinite(step) && step > 0
        ? Math.min(max, Math.max(min, Math.round(clamped / step) * step))
        : clamped;
    setText(String(snapped));
    if (snapped !== committed.current) {
      committed.current = snapped;
      onChange(snapped);
    }
  };

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      reflect(); // invalid/empty → restore the last good value
      return;
    }
    commitValue(n);
  };

  return {
    text,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e) => setText(e.target.value),
    onBlur: () => {
      focused.current = false;
      if (cancelled.current) {
        cancelled.current = false;
        reflect();
        return;
      }
      commit();
    },
    onKeyDown: (e) => {
      if (e.key === "Enter") {
        commit();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        cancelled.current = true;
        e.currentTarget.blur(); // blur handler reverts (commit is skipped)
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Replace the browser's native number-input stepping outright — letting
        // it run alongside ours would double-increment — and commit immediately
        // instead of just updating the text. Arrow keys are a discrete gesture
        // like the scrub drag, not free-form typing, so the same
        // deferred-until-blur behaviour that protects typing doesn't apply:
        // a screen reader announcing the new digits while the canvas still
        // shows the old value is the exact regression this fixes.
        e.preventDefault();
        const delta = typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1;
        const typed = Number(text);
        const base = text.trim() !== "" && Number.isFinite(typed) ? typed : committed.current;
        if (base === null) return; // nothing usable to step from (empty field, mixed selection)
        commitValue(base + (e.key === "ArrowUp" ? delta : -delta));
      }
    },
  };
}
