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

/**
 * Whether applying `color` to a stroke of `width` has to restore a width too.
 *
 * A stroke whose width is 0 is invisible, so handing it a real color without a
 * width makes the click appear to do nothing. Every path that can put a color
 * on a stroke goes through here — `setColor`, `swap`, and both of their
 * `currentItem*` counterparts — because wiring it in only some of them is how
 * you get a default that stays at 0 forever.
 *
 * `??` not `||`: a width of 0 is real data. Coercing it has already cost this
 * project three fork edits (see [[drawing-defaults]]).
 */
function needsRevival(color: string, width: number | undefined): boolean {
  return color !== "transparent" && (width ?? REVIVED_STROKE_WIDTH) === 0;
}

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
  /**
   * Write a *whole colour* the user just picked: a HEX field commit, a
   * palette swatch, an eyedropper pick, or a click on an existing recent.
   * Also settles it into recents (see `recordRecent`).
   */
  setColor: (hex: string, alpha: number, transient: boolean) => void;
  /**
   * Write one *channel* of a colour still being worked on: a hue/alpha/
   * saturation drag or arrow-step, or an H/S/L, R/G/B, or A numeric field.
   * Never joins recents — the user hasn't settled on a whole colour yet, so
   * caching a mid-adjustment value would burn a slot on a colour they didn't
   * choose. `setColor` is `adjustColor` plus `recordRecent`; this is the
   * write half on its own, named so a new caller has to pick one on purpose
   * instead of inheriting recording by accident.
   */
  adjustColor: (hex: string, alpha: number, transient: boolean) => void;
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
   * Write one color to the active part, reviving a zeroed stroke width per
   * `needsRevival` — both the selected elements and, when there is no
   * selection, the `currentItem*` default that new shapes will inherit.
   *
   * This is why the write goes through `sel.update` rather than the simpler
   * `sel.setProp`: `setProp` only ever writes the one property it was given,
   * but stroke revival needs `strokeColor` *and* `strokeWidth` to land in the
   * same element write — otherwise the two would split into two undo steps,
   * or a first write's width bump could be clobbered by a second write that
   * only knows about color.
   *
   * Exposed on the hook's return as `adjustColor` — the write half with no
   * recording, for channel-level edits (hue/alpha/saturation, the numeric
   * fields). `setColor` wraps it with `recordRecent` for whole-colour picks.
   * `quickSet`'s white/grey/black chips also call this directly rather than
   * `setColor`: those three colors already have permanent dedicated chips one
   * click away, so caching them would just evict colors the user actually
   * chose.
   */
  const applyColor = (nextHex: string, nextAlpha: number, transient: boolean) => {
    const value = combineColorAlpha(nextHex, nextAlpha);
    const isStroke = part === "stroke";

    // The default needs reviving on its own terms: with an empty selection the
    // element updater never runs, so this is the ONLY path, and a default left
    // at 0 makes every shape drawn afterwards invisible.
    const defaultWidth = a?.currentItemStrokeWidth as number | undefined;
    const reviveDefault = isStroke && needsRevival(nextHex, defaultWidth);

    sel.update(
      spec.ids,
      (el) => {
        const record = el as unknown as Record<string, unknown>;
        const needsWidth =
          isStroke && needsRevival(nextHex, record.strokeWidth as number | undefined);
        if (record[spec.prop] === value && !needsWidth) return null;
        return needsWidth
          ? { [spec.prop]: value, strokeWidth: REVIVED_STROKE_WIDTH }
          : { [spec.prop]: value };
      },
      reviveDefault
        ? { [spec.currentItemKey]: value, currentItemStrokeWidth: REVIVED_STROKE_WIDTH }
        : { [spec.currentItemKey]: value },
      transient,
    );
  };

  const setColor: ColorTarget["setColor"] = (nextHex, nextAlpha, transient) => {
    applyColor(nextHex, nextAlpha, transient);
    // Mid-drag writes are noise; only a settled color joins the recents.
    if (!transient) recordRecent(nextHex);
  };

  const adjustColor: ColorTarget["adjustColor"] = applyColor;

  const swap: ColorTarget["swap"] = () => {
    // The color arriving on the stroke came from the fill, so the same revival
    // rule applies — without it, swapping a fill onto a zeroed stroke makes the
    // shape disappear with nothing in the panel to explain why.
    const nextStrokeDefault = fallbackFor("fill");
    const reviveDefault = needsRevival(
      nextStrokeDefault,
      a?.currentItemStrokeWidth as number | undefined,
    );

    sel.update(
      sel.selectedIds,
      (el) => {
        const patch = swapFillStroke(el as never);
        if (!patch) return null;
        const record = el as unknown as Record<string, unknown>;
        return needsRevival(patch.strokeColor as string, record.strokeWidth as number | undefined)
          ? { ...patch, strokeWidth: REVIVED_STROKE_WIDTH }
          : patch;
      },
      reviveDefault
        ? {
            currentItemBackgroundColor: fallbackFor("stroke"),
            currentItemStrokeColor: nextStrokeDefault,
            currentItemStrokeWidth: REVIVED_STROKE_WIDTH,
          }
        : {
            currentItemBackgroundColor: fallbackFor("stroke"),
            currentItemStrokeColor: nextStrokeDefault,
          },
    );
  };

  const quickSet: ColorTarget["quickSet"] = (kind) => {
    if (kind !== "none") {
      // Goes through `applyColor`, not `setColor`: white/grey/black already
      // have permanent dedicated chips one click away, so recording them into
      // recents would just evict colors the user actually chose.
      applyColor(QUICK_HEX[kind], 100, false);
      return;
    }
    // Invisible text is a footgun, not a feature.
    if (part === "text") return;

    if (part === "stroke") {
      sel.update(
        spec.ids,
        (el) => {
          const record = el as unknown as Record<string, unknown>;
          return record.strokeColor === "transparent"
            ? null
            : { strokeColor: "transparent", strokeWidth: 0 };
        },
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
    adjustColor,
    swap,
    quickSet,
  };
}
