import { useEffect, useId, useState } from "react";
import { version as FLOW_VERSION } from "../../package.json";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";
import type { LibraryProvider } from "../storage/types";
import "./dialogs.css";

/** Version of the vendored (forked) Excalidraw build flow is pinned to. */
const EXCALIDRAW_VERSION = "0.18.1";

export interface PropertiesDialogProps {
  appName: string;
  /** Name of the current working document. */
  sceneName: string;
  api: ExcalidrawAPI | null;
  /** Document library backing the "storage" figures. */
  provider: LibraryProvider;
  onClose: () => void;
}

/** Format a byte count as a short human string (e.g. "1.4 MB"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flow-props__row">
      <span className="flow-props__key">{label}</span>
      <span className="flow-props__val">{value}</span>
    </div>
  );
}

/**
 * File / document properties: version, storage usage, and scene totals. Shows
 * only document-level info — nothing about the current selection (no width /
 * height), which belongs in the controls panels.
 */
export function PropertiesDialog({ appName, sceneName, api, provider, onClose }: PropertiesDialogProps) {
  const titleId = useId();

  // Scene totals — a snapshot when the dialog opens (document-level, not selection).
  const elementCount = api?.getSceneElements().length ?? 0;
  const imageCount = api ? Object.keys(api.getFiles()).length : 0;

  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [storage, setStorage] = useState<{ usage?: number; quota?: number } | null>(null);

  useEffect(() => {
    let alive = true;
    provider.list().then((docs) => {
      if (alive) setDocumentCount(docs.length);
    });
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        if (alive) setStorage({ usage: est.usage, quota: est.quota });
      });
    } else {
      setStorage({});
    }
    return () => {
      alive = false;
    };
  }, [provider]);

  const storageValue =
    storage === null
      ? "…"
      : storage.usage === undefined
        ? "Unavailable"
        : storage.quota
          ? `${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`
          : formatBytes(storage.usage);

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
            Properties
          </h2>
        </div>
        <div className="flow-dialog__body">
          <section className="flow-props__section">
            <h3 className="flow-props__heading">Version</h3>
            <Row label={appName} value={FLOW_VERSION} />
            <Row label="Excalidraw (fork)" value={EXCALIDRAW_VERSION} />
          </section>

          <section className="flow-props__section">
            <h3 className="flow-props__heading">Scene</h3>
            <Row label="Document" value={sceneName} />
            <Row label="Elements" value={elementCount} />
            <Row label="Images" value={imageCount} />
          </section>

          <section className="flow-props__section">
            <h3 className="flow-props__heading">Storage</h3>
            <Row label="Saved documents" value={documentCount ?? "…"} />
            <Row label="Browser usage" value={storageValue} />
          </section>
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
