import { useId } from "react";
import "./dialogs.css";

/** Placeholder — replace with the real wimp repository URL once it is public. */
export const WIMP_REPO_URL = "https://github.com/REPLACE-ME/wimp";
export const EXCALIDRAW_FORK_URL = "https://github.com/bobtherobot/excalidraw";

export interface AboutDialogProps {
  appName: string;
  onClose: () => void;
}

export function AboutDialog({ appName, onClose }: AboutDialogProps) {
  const titleId = useId();
  return (
    <div
      className="wimp-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="wimp-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="wimp-dialog__header">
          <h2 className="wimp-dialog__title" id={titleId}>
            About {appName}
          </h2>
        </div>
        <div className="wimp-dialog__body">
          <p style={{ margin: 0, fontSize: "0.9375rem", lineHeight: 1.5 }}>
            {appName} is a standalone drawing app built on a <strong>forked</strong>{" "}
            build of Excalidraw.
          </p>
          <p style={{ margin: 0, display: "flex", flexDirection: "column", gap: "0.375rem" }}>
            <a href={WIMP_REPO_URL} target="_blank" rel="noopener noreferrer">
              wimp repository
            </a>
            <a href={EXCALIDRAW_FORK_URL} target="_blank" rel="noopener noreferrer">
              Excalidraw fork
            </a>
          </p>
        </div>
        <div className="wimp-dialog__footer">
          <button type="button" className="wimp-btn wimp-btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
