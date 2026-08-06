import { useState } from "react";
import { FONT_FAMILY } from "@excalidraw/excalidraw";
import { FontDropdown, type FontOption } from "./controls/FontDropdown";
import { IconToggleGroup, type IconOption } from "./controls/IconToggleGroup";
import { NumberInput } from "./controls/NumberInput";
import { MIXED, readFormValue } from "../../lib/selection-style";
import { paddingTargetIds, effectivePadding, type PaddingElement } from "../../lib/padding";
import { setContainerPadding } from "../../lib/transform";
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
 * Text panel: font family, size (S/M/L/XL), alignment, and the padding a
 * container leaves around its bound text. The first three target the selected
 * text (and bound container text) and are disabled when the selection has none;
 * with no selection they edit the text tool defaults.
 *
 * Padding is narrower: it needs a selected shape container that actually holds
 * bound text, so it carries its own gate and has no tool default to fall back
 * on. Within a selection it pads every labelled container and skips the rest.
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
            onChange={(id) => sel.executeAction("changeFontFamily", { currentItemFontFamily: id })}
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
