import { useId, useState } from "react";
import {
  SLOPPINESS_LABELS,
  SLOPPINESS_ORDER,
  type Sloppiness,
} from "../lib/roughness";
import "./dialogs.css";
import "./preferences-dialog.css";

export interface PreferencesDialogProps {
  sloppiness: Sloppiness;
  onChangeSloppiness: (value: Sloppiness) => void;
  onShowShortcuts: () => void;
  onClose: () => void;
}

type Category = "general" | "keyboard";

export function PreferencesDialog({
  sloppiness,
  onChangeSloppiness,
  onShowShortcuts,
  onClose,
}: PreferencesDialogProps) {
  const [category, setCategory] = useState<Category>("general");
  const titleId = useId();

  return (
    <div
      className="wimp-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="wimp-dialog wimp-prefs"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="wimp-dialog__header">
          <h2 className="wimp-dialog__title" id={titleId}>
            Preferences
          </h2>
        </div>

        <div className="wimp-prefs__body">
          <nav className="wimp-prefs__nav" role="tablist" aria-label="Preferences categories">
            <button
              type="button"
              role="tab"
              aria-selected={category === "general"}
              className="wimp-prefs__tab"
              onClick={() => setCategory("general")}
            >
              General
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={category === "keyboard"}
              className="wimp-prefs__tab"
              onClick={() => setCategory("keyboard")}
            >
              Keyboard
            </button>
          </nav>

          <div className="wimp-prefs__panel">
            {category === "general" && (
              <fieldset className="wimp-choice" style={{ border: 0, margin: 0, padding: 0 }}>
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
                  <label className="wimp-option" key={value}>
                    <input
                      type="radio"
                      name="sloppiness"
                      checked={sloppiness === value}
                      onChange={() => onChangeSloppiness(value)}
                    />
                    <span className="wimp-option__label">{SLOPPINESS_LABELS[value]}</span>
                  </label>
                ))}
              </fieldset>
            )}

            {category === "keyboard" && (
              <div className="wimp-prefs__keyboard">
                <p className="wimp-prefs__hint">
                  View the current keyboard shortcuts. Editing shortcuts is coming
                  in a future update.
                </p>
                <button
                  type="button"
                  className="wimp-btn wimp-btn--ghost"
                  onClick={onShowShortcuts}
                >
                  Show keyboard shortcuts
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="wimp-dialog__footer">
          <button type="button" className="wimp-btn wimp-btn--primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
