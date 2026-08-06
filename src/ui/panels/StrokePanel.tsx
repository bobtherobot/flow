import { IconToggleGroup, type IconOption } from "./controls/IconToggleGroup";
import { NumberInput } from "./controls/NumberInput";
import { SliderInput } from "./controls/SliderInput";
import { MIXED, readFormValue, type SelectedElementIds } from "../../lib/selection-style";
import {
  radiusTargetIds,
  effectiveCornerRadius,
  cornerRadiusUpdate,
  type RadiusElement,
} from "../../lib/corner-radius";
import { displayValue, toPx, unitStep, type Unit } from "../../lib/units";
import type { SelectionStyle } from "./useSelectionStyle";

/** Stroke width bounds, in canvas pixels. 0 means "no outline" — the fork's
 *  generateRoughOptions maps a 0 width to a transparent stroke and floors the
 *  fill maths at 1px so hachure fills can't degenerate. */
const MIN_STROKE_PX = 0;
const MAX_STROKE_PX = 10;
/** Matches DEFAULT_ELEMENT_PROPS.strokeWidth, the value appState seeds into
 *  currentItemStrokeWidth. Only shown before the Excalidraw API is ready. */
const DEFAULT_STROKE_PX = 2;

/** Arrowhead size is a multiple of stroke width (a relative factor, no absolute
 *  value shown). Bounds keep it from getting silly; the default MUST match the
 *  fork's DEFAULT_ARROWHEAD_SIZE_FACTOR so unset heads and the slider agree. */
const ARROWHEAD_SIZE_MIN = 3;
const ARROWHEAD_SIZE_MAX = 10;
const ARROWHEAD_SIZE_DEFAULT = 6;
const ARROWHEAD_SIZE_STEP = 0.5;

/** Upper bound for the corner-radius field. The fork caps a rectangle/diamond at
 *  half its short side when rendering, so this only stops absurd typed values;
 *  elbow arrows are uncapped. */
const MAX_RADIUS = 1e5;

const roundTo2 = (n: number) => Math.round(n * 100) / 100;

// ── Icons ───────────────────────────────────────────────────────────────────
const svg = (children: React.ReactNode) => (
  <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
    {children}
  </svg>
);
const line = (dash?: string) => (
  <path d="M2 7 H18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray={dash} />
);

const STROKE_STYLES: IconOption<"solid" | "dashed" | "dotted">[] = [
  { value: "solid", label: "Solid", icon: svg(line()) },
  { value: "dashed", label: "Dashed", icon: svg(line("4 3")) },
  { value: "dotted", label: "Dotted", icon: svg(line("0.5 3")) },
];

/** Excalidraw's own arrow-type glyphs (Tabler icons, 24×24, 2px stroke). */
const arrowTypeIcon = (children: React.ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const ARROW_TYPES: IconOption<"sharp" | "round" | "elbow">[] = [
  {
    value: "sharp",
    label: "Sharp",
    icon: arrowTypeIcon(
      <>
        <path d="M6 18l12 -12" />
        <path d="M18 10v-4h-4" />
      </>,
    ),
  },
  {
    value: "round",
    label: "Curved",
    icon: arrowTypeIcon(
      <>
        <path d="M16,12L20,9L16,6" />
        <path d="M6 20c0 -6.075 4.925 -11 11 -11h3" />
      </>,
    ),
  },
  {
    value: "elbow",
    label: "Elbow",
    icon: arrowTypeIcon(
      <>
        <path d="M4,19L10,19C11.097,19 12,18.097 12,17L12,9C12,7.903 12.903,7 14,7L21,7" />
        <path d="M18 4l3 3l-3 3" />
      </>,
    ),
  },
];

/** Arrowhead glyph at the right end of a short line. */
function headIcon(kind: string) {
  const tail = <path d="M2 7 H13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />;
  const heads: Record<string, React.ReactNode> = {
    none: null,
    arrow: <path d="M12 3 L18 7 L12 11" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    triangle: <path d="M12 3 L18 7 L12 11 Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />,
    circle: <circle cx="15" cy="7" r="3" fill="currentColor" />,
    bar: <path d="M15 3 V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
    diamond: <path d="M15 4 L18 7 L15 10 L12 7 Z" fill="currentColor" />,
  };
  return svg(<>{tail}{heads[kind]}</>);
}

const ARROWHEADS: IconOption<string>[] = ["none", "arrow", "triangle", "circle", "bar", "diamond"].map(
  (k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1), icon: headIcon(k) }),
);

// ── Helpers ───────────────────────────────────────────────────────────────────
type El = SelectionStyle["elements"][number];
const isLinear = (el: El): el is Extract<El, { type: "arrow" | "line" }> =>
  el.type === "arrow" || el.type === "line";
const ahToValue = (a: string | null | undefined) => a ?? "none";
const valueToAh = (v: string) => (v === "none" ? null : v);

/**
 * Stroke panel: width (in the preferred unit), dash style, corner radius, arrow
 * type, and start/end arrowheads. Arrow controls apply to linear elements
 * (arrows/lines) and are disabled when the selection has none. Elbow arrow type
 * is omitted — it needs Excalidraw's routing/binding logic that isn't
 * reimplementable here.
 *
 * Radius rounds rectangles/diamonds and softens an elbow arrow's bends. Unlike
 * the rest of the panel it has no tool default to fall back on, so it needs a
 * selection; within one it edits every element it applies to and skips the rest.
 */
export function StrokePanel({ sel, units }: { sel: SelectionStyle; units: Unit }) {
  const a = sel.appState;

  const linearIds: SelectedElementIds = {};
  for (const el of sel.elements) {
    if (sel.selectedIds[el.id] === true && isLinear(el)) linearIds[el.id] = true;
  }
  const arrowsDisabled = !sel.hasLinear;
  // Arrow-head type + size act as tool defaults: editable with an empty selection
  // (setting the "new arrow" defaults) or a linear selection; only a non-linear
  // selection disables them. Arrow *type* (below) still needs a linear selection
  // since it dispatches through executeAction.
  const arrowDefaultsDisabled = sel.hasSelection && !sel.hasLinear;

  // Stroke width (stored px → shown in the preferred unit).
  const widthPx = readFormValue(
    sel.elements,
    sel.selectedIds,
    (el) => el.strokeWidth,
    a?.currentItemStrokeWidth ?? DEFAULT_STROKE_PX,
  );
  const widthDisplay = widthPx === MIXED ? null : displayValue(widthPx, units);

  const strokeStyle = readFormValue(
    sel.elements,
    sel.selectedIds,
    (el) => el.strokeStyle,
    a?.currentItemStrokeStyle ?? "solid",
  );

  const arrowType = readFormValue(
    sel.elements,
    linearIds,
    (el) => ("elbowed" in el && el.elbowed ? "elbow" : el.roundness ? "round" : "sharp"),
    a?.currentItemArrowType ?? "sharp",
  );

  const startArrow = readFormValue(
    sel.elements,
    linearIds,
    (el) => (isLinear(el) ? ahToValue(el.startArrowhead) : "none"),
    ahToValue(a?.currentItemStartArrowhead),
  );
  const endArrow = readFormValue(
    sel.elements,
    linearIds,
    (el) => (isLinear(el) ? ahToValue(el.endArrowhead) : "none"),
    ahToValue(a?.currentItemEndArrowhead),
  );

  // Per-end arrowhead size factor (× stroke width). Falls back to the tool
  // default in appState (so it edits the "new arrow" default with no selection),
  // then the constant. Neither field is in the vendor's built .d.ts yet, so both
  // are read through a small cast; MIXED → null (empty slider).
  const sizeOf = (
    which: "startArrowheadSize" | "endArrowheadSize",
    currentItemKey: "currentItemStartArrowheadSize" | "currentItemEndArrowheadSize",
  ) => {
    const fallback =
      (a as Partial<Record<typeof currentItemKey, number>> | null)?.[currentItemKey] ??
      ARROWHEAD_SIZE_DEFAULT;
    return readFormValue(
      sel.elements,
      linearIds,
      (el) => (el as Partial<Record<typeof which, number>>)[which] ?? fallback,
      fallback,
    );
  };
  const startSize = sizeOf("startArrowheadSize", "currentItemStartArrowheadSize");
  const endSize = sizeOf("endArrowheadSize", "currentItemEndArrowheadSize");

  // Corner radius. Targets every selected element it applies to (rectangle,
  // diamond, elbow arrow); a selection with none disables the row. The shown
  // value is the shared effective radius, blank when the targets disagree.
  const radiusElements = sel.elements as readonly RadiusElement[];
  const radiusIds = radiusTargetIds(radiusElements, sel.selectedIds);
  const radiusDisabled = Object.keys(radiusIds).length === 0;
  const radiusCommon = readFormValue(
    radiusElements,
    radiusIds,
    (el) => roundTo2(effectiveCornerRadius(el)),
    0,
  );
  const radiusValue = radiusDisabled || radiusCommon === MIXED ? null : radiusCommon;

  // Reuse Excalidraw's own action — it handles round/sharp plus elbow routing and
  // binding, which can't be reimplemented from element props alone.
  const setArrowType = (value: "sharp" | "round" | "elbow") =>
    sel.executeAction("changeArrowType", value);

  const setArrowhead = (which: "startArrowhead" | "endArrowhead", currentItemKey: string) =>
    (value: string) =>
      sel.setProp({ prop: which, value: valueToAh(value), currentItemKey, ids: linearIds });

  const setArrowheadSize = (
    which: "startArrowheadSize" | "endArrowheadSize",
    currentItemKey: string,
  ) =>
    (value: number, transient: boolean) =>
      sel.setProp({ prop: which, value, currentItemKey, ids: linearIds, transient });

  // Each target computes its own update: rectangles/diamonds need the companion
  // `roundness` write for the rounded render path, elbow arrows take the radius
  // straight. One `update` call, so a multi-selection is one undo step. The
  // `currentItemCornerRadius` default rides along in the same call so the next
  // new shape inherits it without requiring a reselect (style-memory's drift
  // capture only sees appState writes, not raw element edits).
  const setRadius = (value: number, transient: boolean) =>
    sel.update(
      radiusIds,
      (el) => cornerRadiusUpdate(el as unknown as RadiusElement, value),
      { currentItemCornerRadius: value },
      transient,
    );

  return (
    <div className="flow-stroke-panel">
      <div className="flow-ctl-row">
        <span className="flow-ctl-row__label">Width</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={widthDisplay}
            min={displayValue(MIN_STROKE_PX, units)}
            max={displayValue(MAX_STROKE_PX, units)}
            // `unitStep` is the step that matches each unit's display precision
            // — for px that is 1, because `displayValue` rounds px to 0
            // decimals. The old px-only override of 0.5 predates that rounding
            // and contradicted it: a half-step landed on a width the field
            // could not render, so 2.5px displayed as "3" while the element
            // held 2.5, and a spin-button click looked like it did nothing.
            // (Same rounding that retired the old 0.5px minimum — see
            // .claude/memory/drawing-defaults.md.)
            step={unitStep(units)}
            unit={units}
            ariaLabel="Stroke width"
            onChange={(v, transient) =>
              sel.setProp({
                prop: "strokeWidth",
                value: toPx(v, units),
                currentItemKey: "currentItemStrokeWidth",
                transient,
              })
            }
          />
        </div>
      </div>

      <div className="flow-ctl-row">
        <span className="flow-ctl-row__label">Dash</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={STROKE_STYLES}
            value={strokeStyle}
            ariaLabel="Stroke style"
            onChange={(v) =>
              sel.setProp({ prop: "strokeStyle", value: v, currentItemKey: "currentItemStrokeStyle" })
            }
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={radiusDisabled || undefined}>
        <span className="flow-ctl-row__label">Radius</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={radiusValue}
            min={0}
            max={MAX_RADIUS}
            scrubSpan={200}
            unit="px"
            ariaLabel="Corner radius"
            disabled={radiusDisabled}
            onChange={setRadius}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={arrowsDisabled || undefined}>
        <span className="flow-ctl-row__label">Type</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={ARROW_TYPES}
            value={arrowType}
            ariaLabel="Arrow type"
            disabled={arrowsDisabled}
            onChange={setArrowType}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={arrowDefaultsDisabled || undefined}>
        {/* Cosmetic label only — the accessible names stay "Start/End arrowhead". */}
        <span className="flow-ctl-row__label">Tail</span>
        <div className="flow-ctl-row__control flow-ctl-row__control--stack">
          <IconToggleGroup
            options={ARROWHEADS}
            value={startArrow}
            ariaLabel="Start arrowhead"
            disabled={arrowDefaultsDisabled}
            onChange={setArrowhead("startArrowhead", "currentItemStartArrowhead")}
          />
          <SliderInput
            value={startSize === MIXED ? null : startSize}
            min={ARROWHEAD_SIZE_MIN}
            max={ARROWHEAD_SIZE_MAX}
            step={ARROWHEAD_SIZE_STEP}
            ariaLabel="Start arrowhead size"
            disabled={arrowDefaultsDisabled || startArrow === "none"}
            onChange={setArrowheadSize("startArrowheadSize", "currentItemStartArrowheadSize")}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={arrowDefaultsDisabled || undefined}>
        <span className="flow-ctl-row__label">Head</span>
        <div className="flow-ctl-row__control flow-ctl-row__control--stack">
          <IconToggleGroup
            options={ARROWHEADS}
            value={endArrow}
            ariaLabel="End arrowhead"
            disabled={arrowDefaultsDisabled}
            onChange={setArrowhead("endArrowhead", "currentItemEndArrowhead")}
          />
          <SliderInput
            value={endSize === MIXED ? null : endSize}
            min={ARROWHEAD_SIZE_MIN}
            max={ARROWHEAD_SIZE_MAX}
            step={ARROWHEAD_SIZE_STEP}
            ariaLabel="End arrowhead size"
            disabled={arrowDefaultsDisabled || endArrow === "none"}
            onChange={setArrowheadSize("endArrowheadSize", "currentItemEndArrowheadSize")}
          />
        </div>
      </div>
    </div>
  );
}
