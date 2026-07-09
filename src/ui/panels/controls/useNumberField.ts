import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface UseNumberFieldArgs {
  /** Current committed value, or null for a mixed (empty) field. */
  value: number | null;
  min: number;
  max: number;
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
 * reflects external value changes. Shared by NumberInput and SliderInput's field
 * (the slider's drag stays live, since that's a deliberate gesture, not typing).
 */
export function useNumberField({ value, min, max, onChange }: UseNumberFieldArgs): NumberFieldBinding {
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

  const commit = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      reflect(); // invalid/empty → restore the last good value
      return;
    }
    const clamped = clamp(n, min, max);
    setText(String(clamped));
    if (clamped !== committed.current) {
      committed.current = clamped;
      onChange(clamped);
    }
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
      }
    },
  };
}
