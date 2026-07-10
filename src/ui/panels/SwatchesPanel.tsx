// src/ui/panels/SwatchesPanel.tsx
import { useState } from "react";
import {
  usePaletteState,
  addPalette,
  removePalette,
  renamePalette,
  setDefaultPalette,
  addSwatch,
  updateSwatch,
  removeSwatches,
  reorderSwatches,
} from "../../lib/palette-store";
import { SwatchGrid } from "./SwatchGrid";
import { SwatchPicker } from "./SwatchPicker";

type PickerState = { mode: "add" } | { mode: "edit"; index: number } | null;

export function SwatchesPanel() {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selectedId, setSelectedId] = useState<string>(defaultPaletteId);
  const [selected, setSelected] = useState<number[]>([]);
  const [picker, setPicker] = useState<PickerState>(null);
  const [confirming, setConfirming] = useState(false);

  // Resolve defensively: selectedId may point at a just-deleted palette.
  const current = palettes.find((p) => p.id === selectedId) ?? palettes[0];
  const isDefault = current.id === defaultPaletteId;

  const choosePalette = (id: string) => {
    setSelectedId(id);
    setSelected([]);
    setPicker(null);
    setConfirming(false);
  };

  const onAddPalette = () => {
    const p = addPalette();
    choosePalette(p.id);
  };

  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
    } else {
      setConfirming(true);
    }
  };

  const confirmDelete = () => {
    removePalette(current.id);
    setConfirming(false);
    setSelected([]);
    // selectedId now points at a deleted palette; "" makes `current` fall back
    // to palettes[0] on the next render (store state is already fresh).
    setSelectedId("");
  };

  const onSelect = (index: number, shift: boolean) => {
    setSelected((prev) =>
      shift
        ? prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index]
        : [index],
    );
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // Ignore keys typed into the name field / palette select — only act on the grid.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      e.preventDefault();
      removeSwatches(current.id, selected);
      setSelected([]);
    }
  };

  const onPickerCommit = (color: string) => {
    if (picker?.mode === "add") addSwatch(current.id, color);
    else if (picker?.mode === "edit") updateSwatch(current.id, picker.index, color);
    setPicker(null);
  };

  const editInitial =
    picker?.mode === "edit" ? current.colors[picker.index] ?? "#000000" : "#000000";

  return (
    <div className="flow-sw" onKeyDown={onGridKeyDown}>
      {/* top row: palette selector + add + context trash */}
      <div className="flow-sw-row flow-sw-row--top">
        <select
          className="flow-sw-select"
          aria-label="Palette"
          value={current.id}
          onChange={(e) => choosePalette(e.target.value)}
        >
          {palettes.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="button" className="flow-sw-icon" aria-label="Add palette" onClick={onAddPalette}>
          +
        </button>
        <button
          type="button"
          className="flow-sw-icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          onClick={onTrash}
        >
          🗑
        </button>
      </div>

      {/* swatch grid */}
      <SwatchGrid
        colors={current.colors}
        selected={selected}
        onAdd={() => setPicker({ mode: "add" })}
        onSelect={onSelect}
        onEdit={(index) => setPicker({ mode: "edit", index })}
        onReorder={(from, to) => reorderSwatches(current.id, from, to)}
      />

      {picker && (
        <SwatchPicker initial={editInitial} onCommit={onPickerCommit} onClose={() => setPicker(null)} />
      )}

      {/* bottom row: rename + set default */}
      <div className="flow-sw-row flow-sw-row--bottom">
        <input
          key={current.id}
          className="flow-sw-name"
          aria-label="Palette name"
          defaultValue={current.name}
          onBlur={(e) => renamePalette(current.id, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
        <button
          type="button"
          className="flow-sw-default"
          aria-label="Set as default"
          disabled={isDefault}
          onClick={() => setDefaultPalette(current.id)}
        >
          {isDefault ? "★ Default" : "☆ Set as default"}
        </button>
      </div>

      {confirming && (
        <div className="flow-sw-confirm" role="alertdialog" aria-label="Delete palette">
          <p>Do you really want to delete this color palette?</p>
          <div className="flow-sw-confirm__actions">
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" aria-label="Confirm delete" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
