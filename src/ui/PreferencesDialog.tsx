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
  PASTE_POSITION_ORDER,
  PASTE_POSITION_LABELS,
  type PastePosition,
} from "../lib/paste-position";
import { MIN_GRID_SIZE, MAX_GRID_SIZE, GRID_SIZE_STEP } from "../lib/grid";
import { splitColorAlpha, combineColorAlpha } from "../lib/color-alpha";
import { NumberInput } from "./panels/controls/NumberInput";
import { ColorSwatch } from "./panels/controls/ColorSwatch";
import { ConfirmDialog } from "./ConfirmDialog";
import "./dialogs.css";
// ColorSwatch/NumberInput carry their .flow-ctl-* styles in panels.css; import
// it here too so the dialog doesn't depend on the panels being mounted.
import "./panels/panels.css";
import "./preferences-dialog.css";

export interface PreferencesDialogProps {
  sloppiness: Sloppiness;
  onChangeSloppiness: (value: Sloppiness) => void;
  units: Unit;
  onChangeUnits: (value: Unit) => void;
  selectionMode: SelectionMode;
  onChangeSelectionMode: (value: SelectionMode) => void;
  /** Where a clipboard paste of elements lands — a global preference read by
   *  the fork's paste path, not a per-document setting. */
  pastePosition: PastePosition;
  onChangePastePosition: (value: PastePosition) => void;
  gridSize: number;
  onChangeGridSize: (value: number) => void;
  /** Canvas grid line color as `#rrggbb` — a global preference. The bold
   *  gridlines are derived from it, so there is only ever one control. */
  gridColor: string;
  onChangeGridColor: (value: string) => void;
  /** Laser-trail color as `#rrggbb` or `#rrggbbaa` — a global preference, never
   *  a per-element property, which is why it lives here and not in the Color panel. */
  laserColor: string;
  onChangeLaserColor: (value: string) => void;
  onShowShortcuts: () => void;
  /** Wipe every stored preference and restart the app on its defaults. Owned by
   *  the caller because it ends this dialog's life along with everything else;
   *  the dialog only asks. */
  onRestoreDefaults: () => void;
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
  pastePosition,
  onChangePastePosition,
  gridSize,
  onChangeGridSize,
  gridColor,
  onChangeGridColor,
  laserColor,
  onChangeLaserColor,
  onShowShortcuts,
  onRestoreDefaults,
  onClose,
}: PreferencesDialogProps) {
  const [category, setCategory] = useState<Category>("general");
  const [confirmingReset, setConfirmingReset] = useState(false);
  const titleId = useId();
  const unitsId = useId();
  const gridSizeId = useId();
  const laser = splitColorAlpha(laserColor);

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
              <fieldset
                className="flow-choice"
                // Unlike Sloppiness (the panel's first field, flush with the top
                // padding) this one needs the same 1rem rhythm every other field
                // below carries.
                style={{ border: 0, margin: "1rem 0 0", padding: 0 }}
              >
                <legend
                  style={{
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    color: "#4a5163",
                    marginBottom: "0.375rem",
                  }}
                >
                  Paste position
                </legend>
                {PASTE_POSITION_ORDER.map((value) => (
                  <label className="flow-option" key={value}>
                    <input
                      type="radio"
                      name="paste-position"
                      checked={pastePosition === value}
                      onChange={() => onChangePastePosition(value)}
                    />
                    <span className="flow-option__label">
                      {PASTE_POSITION_LABELS[value]}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}

            {category === "general" && (
              <div className="flow-num">
                <label className="flow-num__label" htmlFor={gridSizeId}>
                  Grid size
                </label>
                <NumberInput
                  id={gridSizeId}
                  className="flow-num__control"
                  value={gridSize}
                  min={MIN_GRID_SIZE}
                  max={MAX_GRID_SIZE}
                  step={GRID_SIZE_STEP}
                  unit="px"
                  ariaLabel="Grid size"
                  // The `transient` flag is deliberately dropped: this is a
                  // preference, not a scene write, so there's no undo history to
                  // defer, and persisting every frame gives a live grid preview
                  // while dragging.
                  onChange={(n) => onChangeGridSize(n)}
                />
              </div>
            )}

            {category === "general" && (
              <div className="flow-num">
                <span className="flow-num__label">Grid color</span>
                <ColorSwatch
                  value={gridColor}
                  onChange={onChangeGridColor}
                  ariaLabel="Grid color"
                />
              </div>
            )}

            {category === "general" && (
              <div className="flow-num flow-prefs__laser">
                <span className="flow-num__label">Laser pointer</span>
                <div className="flow-prefs__laser-control">
                  <ColorSwatch
                    value={laser.hex}
                    onChange={(hex) =>
                      onChangeLaserColor(combineColorAlpha(hex, laser.alpha > 0 ? laser.alpha : 100))
                    }
                    ariaLabel="Laser color"
                  />
                  <NumberInput
                    className="flow-num__control"
                    value={laser.alpha}
                    min={0}
                    max={100}
                    unit="%"
                    ariaLabel="Laser opacity"
                    // Same reasoning as Grid size: a preference write, so the
                    // `transient` flag is dropped and every frame of a scrub
                    // recolors the trail live.
                    onChange={(n) => onChangeLaserColor(combineColorAlpha(laser.hex, n))}
                  />
                </div>
              </div>
            )}

            {category === "general" && (
              <div className="flow-prefs__reset">
                <span className="flow-prefs__reset-label">Restore factory settings</span>
                <p className="flow-prefs__hint">
                  Puts every setting back the way flow shipped. Your saved
                  drawings are not affected.
                </p>
                <button
                  type="button"
                  className="flow-btn flow-btn--ghost flow-prefs__reset-btn"
                  onClick={() => setConfirmingReset(true)}
                >
                  Restore Factory Settings
                </button>
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

      {confirmingReset && (
        <ConfirmDialog
          title="Restore factory settings?"
          confirmLabel="Restore Factory Settings"
          destructive
          onCancel={() => setConfirmingReset(false)}
          onConfirm={onRestoreDefaults}
        >
          <p className="flow-prefs__warn">
            This cannot be undone. Everything below goes back to how flow
            shipped:
          </p>
          <ul className="flow-prefs__warn-list">
            <li>Toolbars, the shape bar, the quick actions bar and the bottom bar</li>
            <li>Panel layouts, including any layouts you have saved by name</li>
            <li>Grid, units, sloppiness, selection and paste behaviour</li>
            <li>
              <strong>Every colour palette</strong> you have created or edited,
              and your recently used colours
            </li>
          </ul>
          <p className="flow-prefs__warn">
            Your saved drawings are kept. flow will reload, so the canvas starts
            empty — anything on it now has been auto-saved and can be reopened
            from <span className="flow-nowrap">File ▸ Open</span>.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
