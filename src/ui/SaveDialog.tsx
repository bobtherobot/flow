import { useId, useState } from "react";
import type { SaveDestination } from "./dialog-types";
import "./dialogs.css";

export interface SaveDialogProps {
  initialName?: string;
  isGoogleConnected: boolean;
  onConnectGoogle: () => void;
  onCancel: () => void;
  onSave: (result: { name: string; destination: SaveDestination }) => void;
}

export function SaveDialog({
  initialName = "Untitled",
  isGoogleConnected,
  onConnectGoogle,
  onCancel,
  onSave,
}: SaveDialogProps) {
  const [name, setName] = useState(initialName);
  const [destination, setDestination] = useState<SaveDestination>("internal");
  const titleId = useId();

  const canSave = name.trim().length > 0;

  return (
    <div
      className="wimp-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="wimp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="wimp-dialog__header">
          <h2 className="wimp-dialog__title" id={titleId}>
            Save drawing
          </h2>
        </div>

        <div className="wimp-dialog__body">
          <div className="wimp-field">
            <label htmlFor={`${titleId}-name`}>Name</label>
            <input
              id={`${titleId}-name`}
              className="wimp-input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) onSave({ name, destination });
              }}
            />
          </div>

          <fieldset className="wimp-choice" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#4a5163",
                marginBottom: "0.375rem",
              }}
            >
              Destination
            </legend>

            <label className="wimp-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "google"}
                onChange={() => setDestination("google")}
              />
              <span className="wimp-option__label">Google Drive</span>
              {!isGoogleConnected && (
                <button
                  type="button"
                  className="wimp-connect"
                  onClick={onConnectGoogle}
                >
                  Connect
                </button>
              )}
            </label>

            <label className="wimp-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "download"}
                onChange={() => setDestination("download")}
              />
              <span className="wimp-option__label">Download (.excalidraw)</span>
            </label>

            <label className="wimp-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "internal"}
                onChange={() => setDestination("internal")}
              />
              <span className="wimp-option__label">
                Store internally
                {destination === "internal" && (
                  <span className="wimp-option__hint">
                    Clearing your browser data can delete internally-stored drawings.
                  </span>
                )}
              </span>
            </label>
          </fieldset>
        </div>

        <div className="wimp-dialog__footer">
          <button type="button" className="wimp-btn wimp-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="wimp-btn wimp-btn--primary"
            disabled={!canSave}
            onClick={() => onSave({ name, destination })}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
