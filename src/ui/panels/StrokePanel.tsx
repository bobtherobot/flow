import { IconToggleGroup, type IconOption } from "./controls/IconToggleGroup";
import { SliderInput } from "./controls/SliderInput";
import { MIXED, readFormValue, type SelectedElementIds } from "../../lib/selection-style";
import { displayValue, toPx, unitStep, type Unit } from "../../lib/units";
import type { SelectionStyle } from "./useSelectionStyle";

/** Stroke width bounds, in canvas pixels. */
const MIN_STROKE_PX = 0.5;
const MAX_STROKE_PX = 32;

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
 * Stroke panel: width (in the preferred unit), dash style, arrow type, and
 * start/end arrowheads. Arrow controls apply to linear elements (arrows/lines)
 * and are disabled when the selection has none. Elbow arrow type is omitted —
 * it needs Excalidraw's routing/binding logic that isn't reimplementable here.
 */
export function StrokePanel({ sel, units }: { sel: SelectionStyle; units: Unit }) {
  const a = sel.appState;

  const linearIds: SelectedElementIds = {};
  for (const el of sel.elements) {
    if (sel.selectedIds[el.id] === true && isLinear(el)) linearIds[el.id] = true;
  }
  const arrowsDisabled = !sel.hasLinear;

  // Stroke width (stored px → shown in the preferred unit).
  const widthPx = readFormValue(
    sel.elements,
    sel.selectedIds,
    (el) => el.strokeWidth,
    a?.currentItemStrokeWidth ?? 1,
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

  // Reuse Excalidraw's own action — it handles round/sharp plus elbow routing and
  // binding, which can't be reimplemented from element props alone.
  const setArrowType = (value: "sharp" | "round" | "elbow") =>
    sel.executeAction("changeArrowType", value);

  const setArrowhead = (which: "startArrowhead" | "endArrowhead", currentItemKey: string) =>
    (value: string) =>
      sel.setProp({ prop: which, value: valueToAh(value), currentItemKey, ids: linearIds });

  return (
    <div className="flow-stroke-panel">
      <div className="flow-ctl-row">
        <span className="flow-ctl-row__label">Width</span>
        <div className="flow-ctl-row__control">
          <SliderInput
            value={widthDisplay}
            min={displayValue(MIN_STROKE_PX, units)}
            max={displayValue(MAX_STROKE_PX, units)}
            step={units === "px" ? 0.5 : unitStep(units)}
            unit={units}
            ariaLabel="Stroke width"
            onChange={(v) =>
              sel.setProp({ prop: "strokeWidth", value: toPx(v, units), currentItemKey: "currentItemStrokeWidth" })
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

      <div className="flow-ctl-row" aria-disabled={arrowsDisabled || undefined}>
        <span className="flow-ctl-row__label">Start</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={ARROWHEADS}
            value={startArrow}
            ariaLabel="Start arrowhead"
            disabled={arrowsDisabled}
            onChange={setArrowhead("startArrowhead", "currentItemStartArrowhead")}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={arrowsDisabled || undefined}>
        <span className="flow-ctl-row__label">End</span>
        <div className="flow-ctl-row__control">
          <IconToggleGroup
            options={ARROWHEADS}
            value={endArrow}
            ariaLabel="End arrowhead"
            disabled={arrowsDisabled}
            onChange={setArrowhead("endArrowhead", "currentItemEndArrowhead")}
          />
        </div>
      </div>
    </div>
  );
}
