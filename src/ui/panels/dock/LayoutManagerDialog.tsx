import { useState } from "react";
import { getNamedLayouts, setNamedLayouts } from "../../../app/preferences";
import { captureLayout, normalizeDockState, type DockState } from "./panel-dock-state";

interface NamedLayout {
  id: string;
  name: string;
  state: DockState;
}

interface LayoutManagerDialogProps {
  currentState: DockState;
  onApply: (state: DockState) => void;
  onResetDefault: () => void;
  onClose: () => void;
}

function loadLayouts(): NamedLayout[] {
  return getNamedLayouts()
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .filter((l) => typeof l.id === "string" && typeof l.name === "string")
    .map((l) => ({
      id: l.id as string,
      name: l.name as string,
      state: normalizeDockState(l.state),
    }));
}

/**
 * Named-layout manager. Capture the current dock arrangement as a reusable
 * layout, restore/rename/delete saved ones, or restore the built-in Default.
 * Layouts persist to localStorage via the preferences module.
 */
export function LayoutManagerDialog({
  currentState,
  onApply,
  onResetDefault,
  onClose,
}: LayoutManagerDialogProps) {
  const [layouts, setLayouts] = useState<NamedLayout[]>(loadLayouts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const persist = (next: NamedLayout[]) => {
    setLayouts(next);
    setNamedLayouts(next);
  };

  const saveCurrent = () => {
    const id = `layout-${Date.now()}`;
    const next = [
      ...layouts,
      { id, name: `Layout ${layouts.length + 1}`, state: captureLayout(currentState) },
    ];
    persist(next);
    setEditingId(id);
    setDraftName(`Layout ${layouts.length + 1}`);
  };

  const commitRename = () => {
    if (editingId) {
      const name = draftName.trim();
      if (name) persist(layouts.map((l) => (l.id === editingId ? { ...l, name } : l)));
    }
    setEditingId(null);
  };

  const remove = (id: string) => persist(layouts.filter((l) => l.id !== id));

  return (
    <div className="flow-dialog-backdrop" onClick={onClose}>
      <div
        className="flow-dialog flow-pnl-layouts"
        role="dialog"
        aria-label="Panel layouts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flow-dialog__header">
          <h2 className="flow-dialog__title">Panel Layouts</h2>
        </div>
        <div className="flow-dialog__body">
          <button type="button" className="flow-pnl-layouts__save" onClick={saveCurrent}>
            + Save current arrangement as a layout
          </button>
          <ul className="flow-pnl-layouts__list">
            <li className="flow-pnl-layouts__row">
              <span className="flow-pnl-layouts__name">Default</span>
              <div className="flow-pnl-layouts__actions">
                <button
                  type="button"
                  className="flow-btn flow-btn--ghost flow-pnl-layouts__mini"
                  onClick={() => {
                    onResetDefault();
                    onClose();
                  }}
                >
                  Restore
                </button>
              </div>
            </li>
            {layouts.map((layout) => (
              <li key={layout.id} className="flow-pnl-layouts__row">
                {editingId === layout.id ? (
                  <input
                    className="flow-input flow-pnl-layouts__rename"
                    value={draftName}
                    autoFocus
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                  />
                ) : (
                  <span className="flow-pnl-layouts__name">{layout.name}</span>
                )}
                <div className="flow-pnl-layouts__actions">
                  <button
                    type="button"
                    className="flow-btn flow-btn--ghost flow-pnl-layouts__mini"
                    onClick={() => {
                      onApply(layout.state);
                      onClose();
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className="flow-btn flow-btn--ghost flow-pnl-layouts__mini"
                    onClick={() => {
                      setEditingId(layout.id);
                      setDraftName(layout.name);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="flow-btn flow-btn--ghost flow-pnl-layouts__mini flow-pnl-layouts__del"
                    onClick={() => remove(layout.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
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
