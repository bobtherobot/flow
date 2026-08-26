import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { resetDeferred } from "../../../lib/deferred-commit";
import { focusCanvas } from "../../../lib/focus-canvas";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface UseNumberFieldArgs {
  /** Current committed value, or null for a mixed (empty) field. */
  value: number | null;
  min: number;
  max: number;
  /** Optional step to snap the committed value to (within [min,max]). When
   *  omitted, the committed value is only range-clamped, not snapped. */
  step?: number;
  /** `transient` is true for every arrow-key step during a held key and false
   *  for the single commit that ends the hold, so a whole hold is one undo
   *  entry — matching every other control on this branch. Typed-entry commits
   *  (Enter/blur) always pass `false`. */
  onChange: (value: number, transient: boolean) => void;
}

interface NumberFieldBinding {
  /** Controlled text for the `<input value>`. */
  text: string;
  onFocus: () => void;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onKeyUp: (e: KeyboardEvent<HTMLInputElement>) => void;
  /** Applies one step the *browser UI* made (its spin buttons), writing it
   *  transiently. Not for typed text, which must not commit per keystroke. */
  stepFromUi: (raw: number) => void;
  /** Closes out a spin-button gesture with its single commit. Bind to the
   *  element's native `change` event, which fires once when the gesture ends. */
  commitStep: () => void;
}

/**
 * Behaviour for a numeric text field that only *commits* on blur or Enter — not
 * on every keystroke — so a value doesn't churn while the user is still typing.
 * Escape reverts to the current value. While the user is not editing, the field
 * reflects external value changes. Used by NumberInput's typed-entry path (its
 * drag-to-scrub gesture stays live, since that's a deliberate gesture, not typing).
 *
 * Arrow-key stepping commits immediately (screen readers need the announced
 * value to match the canvas right away), but a held key auto-repeats keydown
 * without a matching keyup per tick — so each step writes transiently and only
 * keyUp fires the single non-transient commit, batching a whole hold into one
 * undo entry. This mirrors SliderInput.tsx's `pending`-ref pattern exactly.
 *
 * The browser's own spin buttons follow the same shape, which is why they can
 * share the machinery: they step the value through `input` events and fire a
 * single `change` when the gesture ends. Each step writes transiently here and
 * `commitStep` — bound to that `change` — is the one commit. Without this the
 * spinners changed only the digits in the box: the field commits on blur/Enter,
 * and a spin gesture involves neither.
 */
export function useNumberField({ value, min, max, step, onChange }: UseNumberFieldArgs): NumberFieldBinding {
  const [text, setText] = useState(value === null ? "" : String(value));
  const focused = useRef(false);
  // Tracks the last value we know the parent holds, so re-committing an unchanged
  // value (e.g. Enter then the blur it triggers) doesn't fire a redundant change.
  const committed = useRef(value);
  // Set by Escape so the blur it triggers reverts instead of committing.
  const cancelled = useRef(false);
  // The value of an uncommitted transient arrow-key write, if any. Guards
  // against keyUp and blur both trying to close out the same held-key gesture
  // — exactly SliderInput's `pending` ref, applied to a keyboard gesture
  // instead of a pointer one.
  const pending = useRef<number | null>(null);

  const reflect = () => setText(value === null ? "" : String(value));

  useEffect(() => {
    committed.current = value;
    if (!focused.current) setText(value === null ? "" : String(value));
    // reflect intentionally excluded: it closes over this render's `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // A held arrow key that never reaches its keyUp/blur commit — this field
  // unmounting mid-hold (a panel collapsing, a layout applied, the selection
  // changing) — would leave the deferred-commit bit set, and the next
  // unrelated panel write would inherit authority to skip the vendor's
  // uncommitted-element filter. Same release, same gating on this instance's
  // own pending ref, as SliderInput.tsx's unmount cleanup and NumberInput.tsx's
  // isDragging-keyed cleanup for its scrub gesture — this is the third site of
  // the same pattern, not a new one.
  useEffect(
    () => () => {
      if (pending.current !== null) resetDeferred();
    },
    [],
  );

  // Clamp + step-snap a raw number. Shared by the typed-entry commit path and
  // arrow-key stepping, so both apply identical float-noise rounding.
  const clampSnap = (n: number) => {
    const clamped = clamp(n, min, max);
    return typeof step === "number" && Number.isFinite(step) && step > 0
      ? Math.min(max, Math.max(min, Math.round(clamped / step) * step))
      : clamped;
  };

  // Push a snapped number through as the committed value — updating the
  // displayed text and firing a non-transient onChange, unless it's unchanged
  // from what the parent already holds. Used by the typed-entry commit path
  // (Enter/blur) and by the single commit that closes out a held arrow key.
  const commitValue = (n: number) => {
    const snapped = clampSnap(n);
    setText(String(snapped));
    // A typed/blur commit supersedes any in-flight arrow-key hold.
    pending.current = null;
    if (snapped !== committed.current) {
      committed.current = snapped;
      onChange(snapped, false);
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

  // Apply one discrete step: show it, record it as the outstanding write, and
  // push it transiently so the canvas tracks the gesture live. The single
  // non-transient commit that closes the gesture comes later — keyUp for a held
  // arrow key, the native `change` event for the spin buttons.
  const stepTo = (snapped: number) => {
    setText(String(snapped));
    pending.current = snapped;
    onChange(snapped, true);
  };

  // Close out a held arrow key: fire the single non-transient commit for
  // whatever step is outstanding. Guarded on `pending` so keyUp and blur —
  // whichever ends the hold first — can't both commit the same value.
  const commitPending = () => {
    if (pending.current === null) return;
    const next = pending.current;
    pending.current = null;
    // Unconditional, unlike the typed-entry commit above, and SliderInput.tsx's
    // `commit` is unconditional for the same reason: this write's job is the
    // *capture*, not the number. The transient writes already put the value on
    // the scene, and each one echoed straight back as a new `value` prop — so
    // `committed` always already equals `next` here, and a guard on that would
    // skip every gesture's closing commit. That leaves the scene advanced past
    // a stale store snapshot with nothing in history, which is precisely the
    // failure mode the deferred-commit machinery exists to prevent.
    committed.current = next;
    onChange(next, false);
  };

  return {
    text,
    onFocus: () => {
      focused.current = true;
    },
    onChange: (e) => setText(e.target.value),
    stepFromUi: (raw) => {
      // Stepping an empty field can hand back "" rather than a number.
      if (Number.isFinite(raw)) stepTo(clampSnap(raw));
    },
    onBlur: () => {
      focused.current = false;
      // The canvas already reflects any in-flight transient step (that's the
      // accessibility fix), so a blur mid-hold must close it out with a real
      // commit — never silently drop it, which would leave the deferred-commit
      // bit leaked (see src/lib/deferred-commit.ts). This also covers Escape,
      // which forces a blur through this same path.
      commitPending();
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
        // Enter means "I'm done" — hand focus back to the canvas so the
        // user's very next keystroke (undo, Escape, Delete, a nudge) reaches
        // it instead of landing on this now-inert field. Blur alone (Tab, or
        // clicking elsewhere) must NOT do this: focus there is already headed
        // somewhere the user chose, and stealing it back would break
        // Tab-between-fields. Called after blur() so the field's own blur
        // handling (commitPending/reflect) runs first and doesn't fight this.
        focusCanvas();
      } else if (e.key === "Escape") {
        cancelled.current = true;
        e.currentTarget.blur(); // blur handler reverts (commit is skipped)
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Replace the browser's native number-input stepping outright — letting
        // it run alongside ours would double-increment, and its own commit
        // (`change`) doesn't arrive until blur, unlike the spin buttons'.
        // Arrow keys are a discrete gesture like the scrub drag, not free-form
        // typing, so the deferred-until-blur behaviour that protects typing
        // doesn't apply — each tick writes transiently right away so the announced
        // value and the canvas never disagree (the screen-reader regression
        // this fixes). But a held key auto-repeats keydown with no keyup in
        // between, so committing non-transiently on every tick would split one
        // hold into N undo entries — the single commit is deferred to keyUp,
        // batching the whole hold into one, exactly like SliderInput's drag.
        e.preventDefault();
        const delta = typeof step === "number" && Number.isFinite(step) && step > 0 ? step : 1;
        const typed = Number(text);
        const base = text.trim() !== "" && Number.isFinite(typed) ? typed : committed.current;
        if (base === null) return; // nothing usable to step from (empty field, mixed selection)
        stepTo(clampSnap(base + (e.key === "ArrowUp" ? delta : -delta)));
      }
    },
    onKeyUp: commitPending,
    commitStep: commitPending,
  };
}
