import { useId } from "react";
import { FLOW_REPO_URL, EXCALIDRAW_FORK_URL } from "../lib/links";
import "./dialogs.css";

export interface AboutDialogProps {
  appName: string;
  onClose: () => void;
}

export function AboutDialog({ appName, onClose }: AboutDialogProps) {
  const titleId = useId();
  return (
    <div
      className="flow-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flow-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title" id={titleId}>
            About {appName}
          </h2>
        </div>
        <div className="flow-dialog__body">
          <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>
            {appName} is a standalone drawing app built on a <strong>forked</strong>{" "}
            build of Excalidraw.
          </p>
          <p style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <a href={FLOW_REPO_URL} target="_blank" rel="noopener noreferrer">
              flow repository
            </a>
            <a href={EXCALIDRAW_FORK_URL} target="_blank" rel="noopener noreferrer">
              Excalidraw fork
            </a>
          </p>
        </div>
        <div className="flow-dialog__footer">
          <button type="button" className="flow-btn flow-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
