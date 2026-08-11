import { useState } from "react";
import { hexToHsv, hsvToHex, type Hsv } from "../../lib/color-convert";

interface UseColorDraftOptions {
  /** Concrete `#rrggbb` or "transparent". The caller resolves MIXED first. */
  hex: string;
  /** 0–100. */
  alpha: number;
  onCommit: (hex: string, alpha: number, transient: boolean) => void;
}

const NEUTRAL: Hsv = { h: 0, s: 0, v: 0 };

interface Draft {
  hsv: Hsv;
  alpha: number;
  /**
   * The (hex, alpha) prop pair we last looked at, whatever produced it. This
   * is what drives "did the props change at all" — it is updated on every
   * render that observes a new prop pair, independent of whether that change
   * turned out to be our own echo or a real outside write.
   */
  seenHex: string;
  seenAlpha: number;
  /**
   * The (hex, alpha) pair this draft last emitted via onCommit, or null before
   * the first emit. Used only to recognize an incoming prop change as the
   * echo of our own write rather than a change from outside.
   */
  emittedHex: string | null;
  emittedAlpha: number | null;
}

function seedHsv(hex: string, alpha: number): { hsv: Hsv; alpha: number } {
  return {
    hsv: hexToHsv(hex) ?? NEUTRAL,
    // "transparent" carries alpha 0, but a picker parked at zero opacity is a
    // dead control — the first move should produce a visible color.
    alpha: hex === "transparent" ? 100 : alpha,
  };
}

/**
 * Holds the picker's HSV while the user works, and turns it back into the hex
 * the scene stores.
 *
 * Why HSV lives here rather than being recomputed from the element's hex:
 * `#000000` has no hue and `s: 0` has no hue either, so a picker that
 * round-trips through hex forgets where you were the moment you drag into a
 * corner. Keeping HSV local means dragging value to zero and back returns the
 * hue you started on.
 *
 * The matching hazard is re-seeding from our own output. Every emit records the
 * pair it produced, and the props are only allowed to overwrite the draft when
 * they carry something *else* — a new selection, an undo, a write from the rail
 * popup. That single rule is what makes two surfaces safe to bind to one value.
 *
 * The "seen" and "emitted" pairs are tracked separately (rather than one field
 * doing both jobs) because calling onCommit inside an event handler updates
 * this draft's state before the parent has had a chance to feed the new hex
 * back in as a prop. React re-renders this hook with the *same, still-stale*
 * props right after that state update. If "what we last emitted" were also
 * used as "the prop value we last saw", that re-render would see its own
 * fresh emitted value disagree with the stale prop and misread the disagreement
 * as an outside change — re-seeding from the stale prop and destroying the hue
 * that was just set, before the real echo ever arrives. Recording "seen" only
 * when a prop is actually observed (and leaving it alone on every render in
 * between) keeps that spurious mismatch from ever appearing.
 */
export function useColorDraft({ hex, alpha, onCommit }: UseColorDraftOptions) {
  const [draft, setDraft] = useState<Draft>(() => ({
    ...seedHsv(hex, alpha),
    seenHex: hex,
    seenAlpha: alpha,
    emittedHex: null,
    emittedAlpha: null,
  }));

  // Adjusting state during render (React's documented pattern) rather than in
  // an effect: an effect would paint one frame of the stale color first.
  let current = draft;
  if (draft.seenHex !== hex || draft.seenAlpha !== alpha) {
    const isEcho = hex === draft.emittedHex && alpha === draft.emittedAlpha;
    current = isEcho
      ? { ...draft, seenHex: hex, seenAlpha: alpha }
      : { ...seedHsv(hex, alpha), seenHex: hex, seenAlpha: alpha, emittedHex: null, emittedAlpha: null };
    setDraft(current);
  }

  const emit = (hsv: Hsv, nextAlpha: number, transient: boolean) => {
    const nextHex = hsvToHex(hsv);
    // Record what we produced so the echo back through props is not treated as
    // an outside change — this is what preserves the hue. `seenHex`/`seenAlpha`
    // are deliberately left untouched here; see the doc comment above.
    setDraft({ ...current, hsv, alpha: nextAlpha, emittedHex: nextHex, emittedAlpha: nextAlpha });
    onCommit(nextHex, nextAlpha, transient);
  };

  return {
    hsv: current.hsv,
    alpha: current.alpha,
    isNone: hex === "transparent",

    setSv: (sv: { s: number; v: number }, transient: boolean) =>
      emit({ ...current.hsv, ...sv }, current.alpha, transient),

    setHue: (h: number, transient: boolean) =>
      emit({ ...current.hsv, h }, current.alpha, transient),

    setAlpha: (a: number, transient: boolean) => emit(current.hsv, a, transient),

    setHsvAlpha: (next: { hsv: Hsv; alpha: number }, transient: boolean) =>
      emit(next.hsv, next.alpha, transient),
  };
}
