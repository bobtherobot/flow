import type { SelectionStyle } from "../panels/useSelectionStyle";
import {
  availableParts, partSpec, normalizeActivePart, swapFillStroke, type ColorPart,
} from "../../lib/color-parts";
import { useColorUiState, setActivePart, recordRecent } from "../../lib/color-store";
import { splitColorAlpha, combineColorAlpha } from "../../lib/color-alpha";
import { MIXED, readFormValue } from "../../lib/selection-style";

export type QuickColor = "none" | "white" | "grey" | "black";

/** The baseline colors under the part chooser. */
const QUICK_HEX: Record<Exclude<QuickColor, "none">, string> = {
  white: "#ffffff",
  grey: "#808080",
  black: "#000000",
};

/** Width a stroke is revived at when a color is applied over "none". */
const REVIVED_STROKE_WIDTH = 1;

export interface ColorTarget {
  part: ColorPart;
  available: ColorPart[];
  setPart: (part: ColorPart) => void;
  /** Concrete `#rrggbb` or "transparent" — MIXED already resolved. */
  hex: string;
  /** 0–100. */
  alpha: number;
  isMixed: boolean;
  /** Color for one part, for the chooser boxes. */
  partColor: (part: ColorPart) => string;
  setColor: (hex: string, alpha: number, transient: boolean) => void;
  swap: () => void;
  quickSet: (kind: QuickColor) => void;
}

/**
 * Binds the color UI to the scene.
 *
 * The color is *read* from the selection every render rather than stored, which
 * is what lets the panel and the rail popup both be live views of the same
 * object without a sync layer between them. Only the active part comes from the
 * store, because it has nowhere else to live.
 */
export function useColorTarget(sel: SelectionStyle): ColorTarget {
  const { activePart } = useColorUiState();
  const a = sel.appState as Record<string, unknown> | null;

  const available = availableParts(sel.elements as never, sel.selectedIds);
  const part = normalizeActivePart(available, activePart);

  const fallbackFor = (p: ColorPart): string => {
    const key = partSpec(p, sel.selectedIds, sel.textTargetIds).currentItemKey;
    const value = a?.[key];
    return typeof value === "string" ? value : "transparent";
  };

  /** The raw stored color for a part, with MIXED collapsed to the first value. */
  const rawColor = (p: ColorPart): string => {
    const spec = partSpec(p, sel.selectedIds, sel.textTargetIds);
    const read = readFormValue(
      sel.elements,
      spec.ids,
      (el) => (el as unknown as Record<string, string>)[spec.prop],
      fallbackFor(p),
    );
    if (read !== MIXED) return read;
    // A mixed selection still has to show *something*; blanking the picker
    // would leave no color to nudge. First value wins.
    const first = sel.elements.find((el) => spec.ids[el.id] === true);
    return first
      ? ((first as unknown as Record<string, string>)[spec.prop] ?? fallbackFor(p))
      : fallbackFor(p);
  };

  const spec = partSpec(part, sel.selectedIds, sel.textTargetIds);
  const stored = rawColor(part);
  const { hex, alpha } = splitColorAlpha(stored);

  const isMixed =
    readFormValue(
      sel.elements,
      spec.ids,
      (el) => (el as unknown as Record<string, string>)[spec.prop],
      stored,
    ) === MIXED;

  /**
   * Write one color to the active part. Stroke carries an extra rule: a stroke
   * whose width is 0 is invisible, so applying a real color to it has to give
   * it a width back or the click appears to do nothing.
   *
   * This is why the write goes through `sel.update` rather than the simpler
   * `sel.setProp`: `setProp` only ever writes the one property it was given,
   * but stroke revival needs `strokeColor` *and* `strokeWidth` to land in the
   * same element write — otherwise the two would split into two undo steps,
   * or a first write's width bump could be clobbered by a second write that
   * only knows about color.
   *
   * `?? ` not `||` on strokeWidth — 0 is real data here, and coercing it has
   * already cost this project three fork edits (see [[drawing-defaults]]).
   */
  const setColor: ColorTarget["setColor"] = (nextHex, nextAlpha, transient) => {
    const value = combineColorAlpha(nextHex, nextAlpha);
    const revive = part === "stroke" && nextHex !== "transparent";

    sel.update(
      spec.ids,
      (el) => {
        const record = el as unknown as Record<string, unknown>;
        const width = (record.strokeWidth as number | undefined) ?? REVIVED_STROKE_WIDTH;
        const needsWidth = revive && width === 0;
        if (record[spec.prop] === value && !needsWidth) return null;
        return needsWidth
          ? { [spec.prop]: value, strokeWidth: REVIVED_STROKE_WIDTH }
          : { [spec.prop]: value };
      },
      { [spec.currentItemKey]: value },
      transient,
    );

    // Mid-drag writes are noise; only a settled color joins the recents.
    if (!transient) recordRecent(nextHex);
  };

  const swap: ColorTarget["swap"] = () => {
    sel.update(sel.selectedIds, (el) => swapFillStroke(el as never), {
      currentItemBackgroundColor: fallbackFor("stroke"),
      currentItemStrokeColor: fallbackFor("fill"),
    });
  };

  const quickSet: ColorTarget["quickSet"] = (kind) => {
    if (kind !== "none") {
      setColor(QUICK_HEX[kind], 100, false);
      return;
    }
    // Invisible text is a footgun, not a feature.
    if (part === "text") return;

    if (part === "stroke") {
      sel.update(
        spec.ids,
        () => ({ strokeColor: "transparent", strokeWidth: 0 }),
        { currentItemStrokeColor: "transparent", currentItemStrokeWidth: 0 },
      );
      return;
    }
    sel.update(spec.ids, (el) => {
      const record = el as unknown as Record<string, unknown>;
      return record.backgroundColor === "transparent" ? null : { backgroundColor: "transparent" };
    }, { currentItemBackgroundColor: "transparent" });
  };

  return {
    part,
    available,
    setPart: setActivePart,
    hex,
    alpha,
    isMixed,
    partColor: rawColor,
    setColor,
    swap,
    quickSet,
  };
}
