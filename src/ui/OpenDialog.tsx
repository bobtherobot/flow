import { useId, useState } from "react";
import type { DocumentSummary } from "../storage/types";
import type { OpenSource } from "./dialog-types";
import "./dialogs.css";

export interface OpenDialogProps {
  isGoogleConnected: boolean;
  internalDocs: DocumentSummary[];
  onConnectGoogle: () => void;
  onCancel: () => void;
  onOpenInternal: (id: string) => void;
  onOpenLocal: () => void;
  onOpenGoogle: () => void;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function OpenDialog({
  isGoogleConnected,
  internalDocs,
  onConnectGoogle,
  onCancel,
  onOpenInternal,
  onOpenLocal,
  onOpenGoogle,
}: OpenDialogProps) {
  const [source, setSource] = useState<OpenSource>("internal");
  const titleId = useId();

  function handleOpen() {
    if (source === "local") onOpenLocal();
    else if (source === "google") onOpenGoogle();
    // "internal" opens by clicking a list item directly.
  }

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
            Open drawing
          </h2>
        </div>

        <div className="wimp-dialog__body">
          <fieldset className="wimp-choice" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend
              style={{
                fontSize: "0.8125rem",
                fontWeight: 600,
                color: "#4a5163",
                marginBottom: "0.375rem",
              }}
            >
              Source
            </legend>

            <label className="wimp-option">
              <input
                type="radio"
                name="source"
                checked={source === "google"}
                onChange={() => setSource("google")}
              />
              <span className="wimp-option__label">Google Drive</span>
              {!isGoogleConnected && (
                <button type="button" className="wimp-connect" onClick={onConnectGoogle}>
                  Connect
                </button>
              )}
            </label>

            <label className="wimp-option">
              <input
                type="radio"
                name="source"
                checked={source === "local"}
                onChange={() => setSource("local")}
              />
              <span className="wimp-option__label">Local system</span>
            </label>

            <label className="wimp-option">
              <input
                type="radio"
                name="source"
                checked={source === "internal"}
                onChange={() => setSource("internal")}
              />
              <span className="wimp-option__label">Internally stored</span>
            </label>
          </fieldset>

          {source === "internal" && (
            <div className="wimp-internal-list" role="listbox" aria-label="Internally stored drawings">
              {internalDocs.length === 0 ? (
                <p className="wimp-internal-empty">No internally-stored drawings yet.</p>
              ) : (
                internalDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="wimp-internal-item"
                    onClick={() => onOpenInternal(doc.id)}
                  >
                    <span className="wimp-internal-item__name">{doc.name}</span>
                    <span className="wimp-internal-item__date">{formatDate(doc.updatedAt)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="wimp-dialog__footer">
          <button type="button" className="wimp-btn wimp-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          {source !== "internal" && (
            <button type="button" className="wimp-btn wimp-btn--primary" onClick={handleOpen}>
              Open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
