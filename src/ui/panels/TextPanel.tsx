import { useState } from "react";
import { FONT_FAMILY, getLineHeight } from "@excalidraw/excalidraw";
import { FontDropdown, type FontOption } from "./controls/FontDropdown";
import { IconToggleGroup, type IconOption } from "./controls/IconToggleGroup";
import { NumberInput } from "./controls/NumberInput";
import { MIXED, readFormValue, resolveBoundTextIds } from "../../lib/selection-style";
import { paddingTargetIds, effectivePadding, type PaddingElement } from "../../lib/padding";
import {
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  LINE_HEIGHT_STEP,
  customLineHeights,
  type LineHeightPreset,
} from "../../lib/line-height";
import {
  restoreTextLineHeights,
  setContainerPadding,
  setTextLineHeight,
} from "../../lib/transform";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SelectionStyle } from "./useSelectionStyle";

/** Bounds for the manual font-size field (px). */
const FONT_SIZE_MIN = 1;
const FONT_SIZE_MAX = 999;

/** Upper bound for the padding field — a sanity cap on typed values. */
const MAX_PADDING = 1e5;

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

/** Excalidraw's original hand-drawn/normal/code families — hidden per spec. */
const DEPRECATED = new Set(["Virgil", "Helvetica", "Cascadia"]);

const FONT_OPTIONS: FontOption[] = Object.entries(FONT_FAMILY)
  .filter(([name]) => !DEPRECATED.has(name))
  .map(([name, id]) => ({ value: id as number, label: name, css: name }));

const DEFAULT_FAMILY = FONT_FAMILY.Nunito;

/** Excalidraw font-size steps S/M/L/XL = 16/20/28/36. */
const FONT_SIZES: IconOption<"16" | "20" | "28" | "36">[] = [
  { value: "16", label: "Small", icon: <span className="flow-ctl-size">S</span> },
  { value: "20", label: "Medium", icon: <span className="flow-ctl-size">M</span> },
  { value: "28", label: "Large", icon: <span className="flow-ctl-size">L</span> },
  { value: "36", label: "Extra large", icon: <span className="flow-ctl-size flow-ctl-size--xl">XL</span> },
];

/** Word-processor line spacing. The numerals stand in for icons here for the
 *  same reason S/M/L/XL do: the value IS the label. */
const LINE_HEIGHTS: IconOption<LineHeightPreset>[] = [
  { value: "1", label: "Single spacing", icon: <span className="flow-ctl-size">1</span> },
  {
    value: "1.5",
    label: "One and a half spacing",
    icon: <span className="flow-ctl-size flow-ctl-size--wide">1.5</span>,
  },
  { value: "2", label: "Double spacing", icon: <span className="flow-ctl-size">2</span> },
];

/** How much line height a full-length scrub traverses — the 0.25–10 bounds are
 *  a sanity clamp, not a designed range, so the drag gets its own span. */
const LINE_HEIGHT_SCRUB_SPAN = 1.5;

const alignIcon = (a: "left" | "center" | "right") => {
  const mid = a === "left" ? "M2 7 H11" : a === "right" ? "M7 7 H16" : "M4 7 H14";
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      <path d="M2 4 H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d={mid} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M2 10 H16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
};

const TEXT_ALIGNS: IconOption<"left" | "center" | "right">[] = [
  { value: "left", label: "Align left", icon: alignIcon("left") },
  { value: "center", label: "Align center", icon: alignIcon("center") },
  { value: "right", label: "Align right", icon: alignIcon("right") },
];

/**
 * Vertical align: the container's box with its text block pushed to one edge.
 * Deliberately *not* the guide-line-plus-bars language the Align panel uses for
 * aligning elements to each other — the box is what makes this one read as
 * "text inside a shape" rather than a second copy of that control.
 */
const vAlignIcon = (a: "top" | "middle" | "bottom") => {
  const y = a === "top" ? 2.8 : a === "middle" ? 4.7 : 6.6;
  return (
    <svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true">
      <rect
        x="1.6"
        y="1.6"
        width="14.8"
        height="10.8"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.45"
      />
      <rect x="4" y={y} width="10" height="1.8" rx="0.9" fill="currentColor" />
      <rect x="5.75" y={y + 2.8} width="6.5" height="1.8" rx="0.9" fill="currentColor" />
    </svg>
  );
};

const VERTICAL_ALIGNS: IconOption<"top" | "middle" | "bottom">[] = [
  { value: "top", label: "Align text top", icon: vAlignIcon("top") },
  { value: "middle", label: "Align text middle", icon: vAlignIcon("middle") },
  { value: "bottom", label: "Align text bottom", icon: vAlignIcon("bottom") },
];

/**
 * Text panel: font family, size (S/M/L/XL), line height, horizontal alignment,
 * vertical alignment within a shape, and the padding a container leaves around
 * its bound text. All of them target the selected text (and bound container
 * text) and are disabled when the selection has none.
 *
 * Line height differs from font size in one way worth knowing: Excalidraw has no
 * `currentItemLineHeight`, because a new text element takes its line height from
 * the font (`getLineHeight`, 1.15–1.25 depending on family). So this field shows
 * nothing rather than a tool default when there is no text to read, and changing
 * the font family resets it — that reset is vendor's own `changeFontFamily`.
 *
 * Vertical align and padding are narrower still: both need text that actually
 * sits inside a shape, so each carries its own gate. Within a selection they act
 * on every labelled container and skip the rest.
 */
export function TextPanel({ sel, api }: { sel: SelectionStyle; api: ExcalidrawAPI | null }) {
  const a = sel.appState;
  const ids = sel.textTargetIds;
  const disabled = !sel.hasText;

  // Font size can't defer its history (Excalidraw's changeFontSize action always
  // captures), so a scrub previews in the field only and writes once on release.
  const [scrubSize, setScrubSize] = useState<number | null>(null);

  const fallbackFamily = a?.currentItemFontFamily ?? DEFAULT_FAMILY;
  const fallbackSize = a?.currentItemFontSize ?? 20;
  const fallbackAlign = a?.currentItemTextAlign ?? "left";

  const fontFamily = readFormValue(
    sel.elements,
    ids,
    (el) => (el.type === "text" ? el.fontFamily : fallbackFamily),
    fallbackFamily,
  );
  const fontSizeNum = readFormValue(
    sel.elements,
    ids,
    (el) => (el.type === "text" ? el.fontSize : fallbackSize),
    fallbackSize,
  );
  const fontSizeValue = fontSizeNum === MIXED ? MIXED : (String(fontSizeNum) as "16" | "20" | "28" | "36");
  const textAlign = readFormValue(
    sel.elements,
    ids,
    (el) => (el.type === "text" ? el.textAlign : fallbackAlign),
    fallbackAlign,
  ) as "left" | "center" | "right" | typeof MIXED;

  // No `currentItemLineHeight` exists to fall back on (see the note above), so
  // an empty gate reads as an empty field rather than a fabricated default.
  const lineHeightDisabled = disabled || api === null;
  const lineHeightNum = readFormValue(
    sel.elements,
    ids,
    (el) => (el.type === "text" ? el.lineHeight : null),
    null,
  );
  const lineHeightPreset =
    lineHeightNum === MIXED || lineHeightNum === null
      ? MIXED
      : (String(lineHeightNum) as LineHeightPreset);
  const lineHeightValue =
    lineHeightDisabled || lineHeightNum === MIXED ? null : lineHeightNum;

  const setLineHeight = (value: number, transient: boolean) => {
    if (api) setTextLineHeight(api, Object.keys(ids), value, transient);
  };

  // Vendor's `changeFontFamily` overwrites every selected text element's
  // lineHeight with the incoming font's own metric. That is right for text
  // still carrying the old font's metric and wrong for a line height the user
  // picked, so the chosen ones are noted first and written back straight after
  // the action — never before, which the action would simply undo.
  const changeFontFamily = (family: number) => {
    const chosen = customLineHeights(sel.elements, ids, getLineHeight);
    sel.executeAction("changeFontFamily", { currentItemFontFamily: family });
    if (api && chosen.size > 0) restoreTextLineHeights(api, chosen);
  };

  // Vertical align only means something for text laid out inside a box, so it
  // is gated on the bound labels in the selection rather than on `hasText`.
  const verticalIds = resolveBoundTextIds(sel.elements, sel.selectedIds);
  const verticalDisabled = Object.keys(verticalIds).length === 0;
  const verticalAlign = readFormValue(
    sel.elements,
    verticalIds,
    (el) => (el.type === "text" ? el.verticalAlign : "middle"),
    "middle",
  ) as "top" | "middle" | "bottom" | typeof MIXED;

  const paddingElements = sel.elements as readonly PaddingElement[];
  const paddingIds = paddingTargetIds(paddingElements, sel.selectedIds);
  const paddingDisabled = api === null || Object.keys(paddingIds).length === 0;
  const paddingCommon = readFormValue(
    paddingElements,
    paddingIds,
    (el) => roundTo2(effectivePadding(el)),
    0,
  );
  const paddingValue = paddingDisabled || paddingCommon === MIXED ? null : paddingCommon;

  const setPadding = (value: number, transient: boolean) => {
    if (api) setContainerPadding(api, Object.keys(paddingIds), value, transient);
  };

  return (
    <div className="flow-text-panel">
      <div className="flow-ctl-row" aria-disabled={disabled || undefined}>
        <span className="flow-ctl-row__label">Font</span>
        <div className="flow-ctl-row__control">
          <FontDropdown
            options={FONT_OPTIONS}
            value={fontFamily}
            ariaLabel="Font family"
            disabled={disabled}
            onChange={changeFontFamily}
          />
        </div>
      </div>

      <div className="flow-ctl-row flow-ctl-row--top" aria-disabled={disabled || undefined}>
        <span className="flow-ctl-row__label">Size</span>
        <div className="flow-ctl-row__control flow-ctl-row__control--stack">
          <IconToggleGroup
            options={FONT_SIZES}
            value={fontSizeValue}
            ariaLabel="Font size"
            disabled={disabled}
            onChange={(v) => sel.executeAction("changeFontSize", Number(v))}
          />
          {/* Manual size. Reflects the current value (incl. a preset click); a
              custom value simply won't match any S/M/L/XL, so none stays lit.
              Dragging previews in the field and commits on release. */}
          <NumberInput
            value={scrubSize ?? (fontSizeNum === MIXED ? null : fontSizeNum)}
            min={FONT_SIZE_MIN}
            max={FONT_SIZE_MAX}
            scrubSpan={150}
            unit="px"
            ariaLabel="Font size value"
            disabled={disabled}
            onChange={(n, transient) => {
              if (transient) {
                setScrubSize(n);
                return;
              }
              // Write first, so the field reads the committed value on the very
              // next render rather than flashing the pre-drag one.
              sel.executeAction("changeFontSize", n);
              setScrubSize(null);
            }}
          />
        </div>
      </div>

      <div className="flow-ctl-row flow-ctl-row--top" aria-disabled={lineHeightDisabled || undefined}>
        <span className="flow-ctl-row__label">Line height</span>
        <div className="flow-ctl-row__control flow-ctl-row__control--stack">
          <IconToggleGroup
            options={LINE_HEIGHTS}
            value={lineHeightPreset}
            ariaLabel="Line spacing"
            disabled={lineHeightDisabled}
            onChange={(v) => setLineHeight(Number(v), false)}
          />
          {/* Off-preset values are the norm, not the exception: fonts default to
              1.15–1.25, so this field usually carries the real value and no
              preset is lit — exactly how the font-size field behaves. */}
          <NumberInput
            value={lineHeightValue}
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            scrubSpan={LINE_HEIGHT_SCRUB_SPAN}
            ariaLabel="Line height value"
            disabled={lineHeightDisabled}
            onChange={setLineHeight}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={disabled || undefined}>
        <span className="flow-ctl-row__label">Align</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={TEXT_ALIGNS}
            value={textAlign}
            ariaLabel="Text align"
            disabled={disabled}
            onChange={(v) => sel.executeAction("changeTextAlign", v)}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={verticalDisabled || undefined}>
        <span className="flow-ctl-row__label">Vertical</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={VERTICAL_ALIGNS}
            value={verticalAlign}
            ariaLabel="Vertical align"
            disabled={verticalDisabled}
            onChange={(v) => sel.executeAction("changeVerticalAlign", v)}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={paddingDisabled || undefined}>
        <span className="flow-ctl-row__label">Padding</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={paddingValue}
            min={0}
            max={MAX_PADDING}
            scrubSpan={200}
            unit="px"
            ariaLabel="Padding"
            disabled={paddingDisabled}
            onChange={setPadding}
          />
        </div>
      </div>
    </div>
  );
}
