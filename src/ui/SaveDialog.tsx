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
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flow-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            Save drawing
          </h2>
        </div>

        <div className="flow-dialog__body">
          <div className="flow-field">
            <label htmlFor={`${titleId}-name`}>Name</label>
            <input
              id={`${titleId}-name`}
              className="flow-input"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) onSave({ name, destination });
              }}
            />
          </div>

          <fieldset className="flow-choice" style={{ border: 0, margin: 0, padding: 0 }}>
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

            <label className="flow-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "google"}
                onChange={() => setDestination("google")}
              />
              <span className="flow-option__label">Google Drive</span>
              {!isGoogleConnected && (
                <button
                  type="button"
                  className="flow-connect"
                  onClick={onConnectGoogle}
                >
                  Connect
                </button>
              )}
            </label>

            <label className="flow-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "download"}
                onChange={() => setDestination("download")}
              />
              <span className="flow-option__label">Download (.excalidraw)</span>
            </label>

            <label className="flow-option">
              <input
                type="radio"
                name="destination"
                checked={destination === "internal"}
                onChange={() => setDestination("internal")}
              />
              <span className="flow-option__label">
                Store internally
                {destination === "internal" && (
                  <span className="flow-option__hint">
                    Clearing your browser data can delete internally-stored drawings.
                  </span>
                )}
              </span>
            </label>
          </fieldset>
        </div>

        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="flow-btn flow-btn--primary"
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
