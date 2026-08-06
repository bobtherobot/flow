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

/** How far in from the field's right edge the browser's spin buttons reach.
 *  Measured, not guessed, with this field's own padding and border (6px inset):
 *  Chromium's control is 15px wide (reaching 21px in), Firefox's is 18px
 *  (reaching 24px). 25 covers both with a pixel to spare — at the cost of a few
 *  px of Chromium field body that starts no gesture, which beats a band of
 *  Firefox spin button that does nothing when pressed. */
const SPINNER_HIT_PX = 25;

/** `inputType` values engines report when their *own UI* changed the value,
 *  rather than the user typing ("insertText", "deleteContentBackward", …).
 *  Chromium dispatches a plain Event carrying no inputType at all; Firefox
 *  dispatches an InputEvent saying "insertReplacementText". Both measured — and
 *  reading only the interface, as this first did, silently classified every
 *  Firefox spin as typing, which deferred the write to a blur that a spin
 *  gesture never produces. */
const UI_STEP_INPUT_TYPES = new Set(["", "insertReplacementText"]);

/**
 * Whether an event on the field carried a value the browser's own UI stepped.
 *
 * `spinning` — a press is currently held on the spin buttons — is the
 * engine-agnostic signal and is checked first: an engine whose `inputType` is
 * not in the list above (this file has measured two of them) still steps
 * correctly as long as the press was recognised. The `inputType` list is the
 * converse safety net, for a press just outside SPINNER_HIT_PX.
 */
function isUiStep(native: Event, spinning: boolean): boolean {
  // jsdom's `fireEvent.change` dispatches `change`, which is typing here.
  if (native.type !== "input") return false;
  if (spinning) return true;
  const inputType = native instanceof InputEvent ? (native.inputType ?? "") : "";
  return UI_STEP_INPUT_TYPES.has(inputType);
}

/** Whether a press landed on the browser's spin buttons rather than the field
 *  body. They live at the right end of the field and are shadow DOM, so the
 *  event target can't tell us — geometry is the only signal available. */
function isSpinnerPress(e: React.PointerEvent<HTMLInputElement>): boolean {
  const rect = e.currentTarget.getBoundingClientRect();
  // A zero-width rect means the field was never laid out (jsdom, a hidden
  // ancestor), and an unlaid-out field has no spin buttons to press.
  if (rect.width === 0) return false;
  return rect.right - e.clientX <= SPINNER_HIT_PX;
}

/**
 * A numeric field that can be dragged like Firefox devtools' CSS inspector: hover
 * shows an ns-resize cursor, dragging up/down scrubs the value live, and a click
 * without movement focuses the field to type instead. The browser's own spin
 * buttons sit at the right end for discrete ±1 steps, and are excluded from the
 * scrub so both gestures can share the field.
 *
 * `null` renders empty (mixed selection) and disables the scrub and the
 * spinners — stepping from an empty field would write an arbitrary base value
 * to the whole selection. Typed values commit on blur or Enter, never per
 * keystroke; Escape reverts.
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
  /** A press is down on the browser's spin buttons — see `isUiStep`. */
  const spinning = useRef(false);
  const field = useNumberField({ value, min, max, step, onChange });

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
  //
  // The field's typed-entry arrow-key hold has its own equivalent release
  // inside useNumberField.ts (unmount-only, gated on its own pending ref, like
  // SliderInput's) — a third site of the same pattern, not a new one.
  useEffect(() => {
    if (!scrub.isDragging) return;
    document.body.classList.add("flow-scrubbing");
    return () => {
      document.body.classList.remove("flow-scrubbing");
      resetDeferred();
    };
  }, [scrub.isDragging]);

  // Two native events the React bindings can't carry:
  //
  //   • `change` — the browser fires exactly one when a spin-button gesture
  //     ends (a click, or the release of a held auto-repeat), which is the
  //     single commit closing the undo entry the transient steps opened. React
  //     won't re-fire its own onChange for it: its value tracker already saw
  //     the value move on the preceding `input`.
  //   • `wheel` — a wheel over a *focused* number input steps it in Chromium.
  //     Inside a scrollable dock that is an accident waiting to happen, and its
  //     `change` wouldn't arrive until blur, leaving the deferred-commit bit set
  //     across unrelated writes in between. Suppressed outright: a scroll over a
  //     focused field should do nothing rather than quietly edit it. React
  //     registers wheel passively at the root, so only a native listener with
  //     `{ passive: false }` can preventDefault it.
  //
  // Read through a ref so the listeners bind once instead of on every render.
  const commitStep = field.commitStep;
  const commitStepRef = useRef(commitStep);
  useEffect(() => {
    commitStepRef.current = commitStep;
  });
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onNativeChange = () => commitStepRef.current();
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement === el) e.preventDefault();
    };
    // On window, not the field: a press that began on the buttons can be
    // released anywhere. Chromium fires the closing `change` after pointerup,
    // and the commit doesn't consult this flag, so clearing it here is safe.
    const endSpin = () => {
      spinning.current = false;
    };
    el.addEventListener("change", onNativeChange);
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("pointerup", endSpin);
    window.addEventListener("pointercancel", endSpin);
    return () => {
      el.removeEventListener("change", onNativeChange);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("pointerup", endSpin);
      window.removeEventListener("pointercancel", endSpin);
    };
  }, []);

  return (
    <div
      className={`flow-ctl-num${value === null ? " flow-ctl-num--mixed" : ""}${
        className ? ` ${className}` : ""
      }`}
      aria-disabled={disabled || undefined}
    >
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
        onChange={(e) => {
          // Typing and spin-button stepping arrive on the same handler, and
          // only one of them defers its write to blur.
          if (isUiStep(e.nativeEvent, spinning.current)) {
            field.stepFromUi(Number(e.target.value));
            return;
          }
          field.onChange(e);
        }}
        onKeyDown={field.onKeyDown}
        onKeyUp={field.onKeyUp}
        onPointerDown={(e) => {
          // A focused field is being edited: leave the body to text selection.
          if (document.activeElement === inputRef.current) return;
          // The scrub arms itself with preventDefault (to suppress focus), and
          // that also suppresses the spin button's own stepping — measured in
          // Chromium: the press produces no step and no focus at all. So a
          // press on the buttons must be left entirely to the browser, and
          // flagged, so the steps it produces are read as steps whatever the
          // engine calls them.
          if (isSpinnerPress(e)) {
            spinning.current = true;
            return;
          }
          scrub.onPointerDown(e);
        }}
      />
      {unit && <span className="flow-ctl-num__unit">{unit}</span>}
    </div>
  );
}
