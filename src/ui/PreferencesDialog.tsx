import { useId, useState } from "react";
import {
  SLOPPINESS_LABELS,
  SLOPPINESS_ORDER,
  type Sloppiness,
} from "../lib/roughness";
import { UNITS, type Unit } from "../lib/units";
import {
  SELECTION_MODE_ORDER,
  SELECTION_MODE_LABELS,
  type SelectionMode,
} from "../lib/selection-mode";
import {
  MIN_GRID_SIZE,
  MAX_GRID_SIZE,
  GRID_SIZE_STEP,
  clampGridSize,
} from "../lib/grid";
import "./dialogs.css";
import "./preferences-dialog.css";

export interface PreferencesDialogProps {
  sloppiness: Sloppiness;
  onChangeSloppiness: (value: Sloppiness) => void;
  units: Unit;
  onChangeUnits: (value: Unit) => void;
  selectionMode: SelectionMode;
  onChangeSelectionMode: (value: SelectionMode) => void;
  gridSize: number;
  onChangeGridSize: (value: number) => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}

const UNIT_NAMES: Record<Unit, string> = {
  px: "Pixels (px)",
  pt: "Points (pt)",
  mm: "Millimetres (mm)",
  cm: "Centimetres (cm)",
  in: "Inches (in)",
};

type Category = "general" | "keyboard";

export function PreferencesDialog({
  sloppiness,
  onChangeSloppiness,
  units,
  onChangeUnits,
  selectionMode,
  onChangeSelectionMode,
  gridSize,
  onChangeGridSize,
  onShowShortcuts,
  onClose,
}: PreferencesDialogProps) {
  const [category, setCategory] = useState<Category>("general");
  const titleId = useId();
  const unitsId = useId();
  const gridSizeId = useId();

  return (
    <div
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flow-dialog flow-prefs"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            Preferences
          </h2>
        </div>

        <div className="flow-prefs__body">
          <nav className="flow-prefs__nav" role="tablist" aria-label="Preferences categories">
            <button
              type="button"
              role="tab"
              aria-selected={category === "general"}
              className="flow-prefs__tab"
              onClick={() => setCategory("general")}
            >
              General
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={category === "keyboard"}
              className="flow-prefs__tab"
              onClick={() => setCategory("keyboard")}
            >
              Keyboard
            </button>
          </nav>

          <div className="flow-prefs__panel">
            {category === "general" && (
              <fieldset className="flow-choice" style={{ border: 0, margin: 0, padding: 0 }}>
                <legend
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#4a5163",
                    marginBottom: "0.375rem",
                  }}
                >
                  Sloppiness
                </legend>
                {SLOPPINESS_ORDER.map((value) => (
                  <label className="flow-option" key={value}>
                    <input
                      type="radio"
                      name="sloppiness"
                      checked={sloppiness === value}
                      onChange={() => onChangeSloppiness(value)}
                    />
                    <span className="flow-option__label">{SLOPPINESS_LABELS[value]}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {category === "general" && (
              <div className="flow-field flow-prefs__units">
                <label htmlFor={unitsId}>Units</label>
                <select
                  id={unitsId}
                  className="flow-input"
                  value={units}
                  onChange={(e) => onChangeUnits(e.target.value as Unit)}
                >
                  {UNITS.map((u) => (
                    <option key={u} value={u}>
                      {UNIT_NAMES[u]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {category === "general" && (
              <div className="flow-seg-field">
                <span className="flow-seg-field__label">Select</span>
                <div
                  className="flow-seg"
                  role="radiogroup"
                  aria-label="Marquee selection mode"
                >
                  {SELECTION_MODE_ORDER.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={selectionMode === mode}
                      className="flow-seg__btn"
                      onClick={() => onChangeSelectionMode(mode)}
                    >
                      {SELECTION_MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {category === "general" && (
              <div className="flow-num">
                <label className="flow-num__label" htmlFor={gridSizeId}>
                  Grid size
                </label>
                <div className="flow-num__control">
                  <input
                    id={gridSizeId}
                    className="flow-num__input"
                    type="number"
                    min={MIN_GRID_SIZE}
                    max={MAX_GRID_SIZE}
                    step={GRID_SIZE_STEP}
                    value={gridSize}
                    onChange={(e) => onChangeGridSize(clampGridSize(Number(e.target.value)))}
                  />
                  <span className="flow-num__suffix">px</span>
                </div>
              </div>
            )}

            {category === "keyboard" && (
              <div className="flow-prefs__keyboard">
                <p className="flow-prefs__hint">
                  View the current keyboard shortcuts. Editing shortcuts is coming
                  in a future update.
                </p>
                <button
                  type="button"
                  className="flow-btn flow-btn--ghost"
                  onClick={onShowShortcuts}
                >
                  Show keyboard shortcuts
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
