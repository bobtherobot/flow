import { NumberInput } from "./controls/NumberInput";
import { resizeElementDimension, setContainerPadding, MIN_ELEMENT_SIZE } from "../../lib/transform";
import {
  cornerRadiusApplies,
  effectiveCornerRadius,
  cornerRadiusUpdate,
  type RadiusElement,
} from "../../lib/corner-radius";
import { paddingApplies, effectivePadding, type PaddingElement } from "../../lib/padding";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { SelectionStyle } from "./useSelectionStyle";

type SceneElement = SelectionStyle["elements"][number];

const MAX_SIZE = 1e5;
const MAX_COORD = 1e6;

const radToDeg = (rad: number) => (rad * 180) / Math.PI;
const degToRad = (deg: number) => (deg * Math.PI) / 180;
const round = (n: number) => Math.round(n * 100) / 100;
/** Normalise degrees to [0, 360). */
const normDeg = (deg: number) => ((round(deg) % 360) + 360) % 360;

/** The single selected element, or null for an empty or multi-selection. */
function soleSelected(sel: SelectionStyle): SceneElement | null {
  const selected = sel.elements.filter((el) => sel.selectedIds[el.id]);
  return selected.length === 1 ? selected[0] : null;
}

/**
 * Transform panel: numeric width, height, x, y and rotation for a single
 * selected element (empty/mixed selections grey the fields out). W/H reuse
 * Excalidraw's resize routine; x/y/rotation write immutably through the shared
 * selection bridge. Corner radius and padding are placeholders wired up in a
 * later phase — always disabled for now.
 */
export function TransformPanel({ sel, api }: { sel: SelectionStyle; api: ExcalidrawAPI | null }) {
  const el = soleSelected(sel);
  const disabled = el === null || api === null;

  // Text elements have no independent width/height; frames can't be rotated.
  const sizeDisabled = disabled || el?.type === "text";
  const angleDisabled = disabled || el?.type === "frame";

  // Corner radius applies to rectangles, diamonds and elbow arrows.
  const radiusEl = el as RadiusElement | null;
  const radiusApplies = cornerRadiusApplies(radiusEl);
  const radiusDisabled = disabled || !radiusApplies;
  const radiusValue = radiusEl && radiusApplies ? round(effectiveCornerRadius(radiusEl)) : null;

  // Padding applies to shape containers (rect/ellipse/diamond) holding bound text.
  const paddingEl = el as PaddingElement | null;
  const padApplies = paddingApplies(paddingEl, sel.elements);
  const paddingDisabled = disabled || !padApplies;
  const paddingValue = paddingEl && padApplies ? round(effectivePadding(paddingEl)) : null;

  const num = (v: number | undefined) => (el ? round(v ?? 0) : null);

  const setDimension = (dimension: "width" | "height", value: number) => {
    if (el && api) resizeElementDimension(api, el.id, dimension, value);
  };
  const setCoord = (prop: "x" | "y", value: number) => {
    if (el) sel.update({ [el.id]: true }, () => ({ [prop]: value }));
  };
  const setAngle = (deg: number) => {
    if (!el) return;
    // The bound text (if any) carries its own angle, so rotate it in lockstep.
    const boundTextId = sel.elements.find(
      (e) => e.type === "text" && (e as { containerId?: string }).containerId === el.id,
    )?.id;
    const ids = boundTextId ? { [el.id]: true, [boundTextId]: true } : { [el.id]: true };
    sel.update(ids, () => ({ angle: degToRad(deg) }));
  };
  const setRadius = (value: number) => {
    if (radiusEl) sel.update({ [radiusEl.id]: true }, () => cornerRadiusUpdate(radiusEl, value));
  };
  const setPadding = (value: number) => {
    if (el && api) setContainerPadding(api, el.id, value);
  };

  return (
    <div className="flow-transform-panel">
      <div className="flow-ctl-row" aria-disabled={sizeDisabled || undefined}>
        <span className="flow-ctl-row__label">Size</span>
        <div className="flow-ctl-row__control">
          <span className="flow-ctl-axis">
            <span aria-hidden="true">W</span>
            <NumberInput
              value={num(el?.width)}
              min={MIN_ELEMENT_SIZE}
              max={MAX_SIZE}
              ariaLabel="Width"
              disabled={sizeDisabled}
              onChange={(n) => setDimension("width", n)}
            />
          </span>
          <span className="flow-ctl-axis">
            <span aria-hidden="true">H</span>
            <NumberInput
              value={num(el?.height)}
              min={MIN_ELEMENT_SIZE}
              max={MAX_SIZE}
              ariaLabel="Height"
              disabled={sizeDisabled}
              onChange={(n) => setDimension("height", n)}
            />
          </span>
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={disabled || undefined}>
        <span className="flow-ctl-row__label">Position</span>
        <div className="flow-ctl-row__control">
          <span className="flow-ctl-axis">
            <span aria-hidden="true">X</span>
            <NumberInput
              value={num(el?.x)}
              min={-MAX_COORD}
              max={MAX_COORD}
              ariaLabel="X position"
              disabled={disabled}
              onChange={(n) => setCoord("x", n)}
            />
          </span>
          <span className="flow-ctl-axis">
            <span aria-hidden="true">Y</span>
            <NumberInput
              value={num(el?.y)}
              min={-MAX_COORD}
              max={MAX_COORD}
              ariaLabel="Y position"
              disabled={disabled}
              onChange={(n) => setCoord("y", n)}
            />
          </span>
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={angleDisabled || undefined}>
        <span className="flow-ctl-row__label">Rotation</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={el ? normDeg(radToDeg(el.angle)) : null}
            min={0}
            max={360}
            unit="°"
            ariaLabel="Rotation"
            disabled={angleDisabled}
            onChange={setAngle}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={radiusDisabled || undefined}>
        <span className="flow-ctl-row__label">Radius</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={radiusValue}
            min={0}
            max={MAX_SIZE}
            unit="px"
            ariaLabel="Corner radius"
            disabled={radiusDisabled}
            onChange={setRadius}
          />
        </div>
      </div>

      <div className="flow-ctl-row" aria-disabled={paddingDisabled || undefined}>
        <span className="flow-ctl-row__label">Padding</span>
        <div className="flow-ctl-row__control">
          <NumberInput
            value={paddingValue}
            min={0}
            max={MAX_SIZE}
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
