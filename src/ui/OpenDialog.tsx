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
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flow-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            Open drawing
          </h2>
        </div>

        <div className="flow-dialog__body">
          <fieldset className="flow-choice" style={{ border: 0, margin: 0, padding: 0 }}>
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

            <label className="flow-option">
              <input
                type="radio"
                name="source"
                checked={source === "google"}
                onChange={() => setSource("google")}
              />
              <span className="flow-option__label">Google Drive</span>
              {!isGoogleConnected && (
                <button type="button" className="flow-connect" onClick={onConnectGoogle}>
                  Connect
                </button>
              )}
            </label>

            <label className="flow-option">
              <input
                type="radio"
                name="source"
                checked={source === "local"}
                onChange={() => setSource("local")}
              />
              <span className="flow-option__label">Local system</span>
            </label>

            <label className="flow-option">
              <input
                type="radio"
                name="source"
                checked={source === "internal"}
                onChange={() => setSource("internal")}
              />
              <span className="flow-option__label">Internally stored</span>
            </label>
          </fieldset>

          {source === "internal" && (
            <div className="flow-internal-list" role="listbox" aria-label="Internally stored drawings">
              {internalDocs.length === 0 ? (
                <p className="flow-internal-empty">No internally-stored drawings yet.</p>
              ) : (
                internalDocs.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="flow-internal-item"
                    onClick={() => onOpenInternal(doc.id)}
                  >
                    <span className="flow-internal-item__name">{doc.name}</span>
                    <span className="flow-internal-item__date">{formatDate(doc.updatedAt)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          {source !== "internal" && (
            <button type="button" className="flow-btn flow-btn--primary" onClick={handleOpen}>
              Open
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
