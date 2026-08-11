// src/ui/color/PaletteSection.tsx
import { useRef, useState } from "react";
import "./color.css";
import {
  usePaletteState,
  addPalette,
  removePalette,
  renamePalette,
  setDefaultPalette,
  addSwatch,
  removeSwatches,
  reorderSwatches,
} from "../../lib/palette-store";

interface PaletteSectionProps {
  /** The picker's live color, added by the grid's [+] tile. */
  currentColor: string;
  /** Applying a swatch to the active part. */
  onPick: (hex: string) => void;
}

/**
 * Palette management, folded into the Color panel — picking a color and
 * curating the set you pick from are one activity, and they used to live in
 * two panels (`SwatchesPanel` + `SwatchGrid`, both retired by this).
 *
 * The dropdown selection *is* the active palette: there is no separate
 * "default" concept anymore, so choosing a palette here is what
 * `useDefaultPaletteColors` elsewhere resolves to. A plain click applies a
 * swatch via `onPick`; ⌘/Ctrl-click selects it for the trash instead. That
 * split keeps the common action (apply a color) one click, and the
 * destructive one (queue for deletion) deliberate.
 */
export function PaletteSection({ currentColor, onPick }: PaletteSectionProps) {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const dragFrom = useRef<number | null>(null);

  // Resolve defensively: defaultPaletteId can point at a just-deleted palette
  // for one render (e.g. right after removePalette reseeds).
  const current = palettes.find((p) => p.id === defaultPaletteId) ?? palettes[0];

  const choosePalette = (id: string) => {
    setDefaultPalette(id);
    setSelected([]);
    setConfirming(false);
  };

  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
      return;
    }
    setConfirming(true);
  };

  const onSwatchClick = (index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelected((prev) =>
        prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
      );
      return;
    }
    setSelected([]);
    onPick(current.colors[index]);
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    // Ignore keys typed into the name field / palette select — only act on
    // the grid itself. Copied from SwatchGrid's/SwatchesPanel's handling.
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if ((e.key === "Delete" || e.key === "Backspace") && selected.length > 0) {
      e.preventDefault();
      removeSwatches(current.id, selected);
      setSelected([]);
    }
  };

  const sel = new Set(selected);

  return (
    <div className="flow-clr-palette" onKeyDown={onGridKeyDown}>
      <div className="flow-clr-palette__grid">
        <button
          type="button"
          className="flow-clr-palette__add"
          aria-label="Add current color to palette"
          title="Add current color to palette"
          onClick={() => addSwatch(current.id, currentColor)}
        >
          +
        </button>
        {current.colors.map((c, i) => (
          <button
            key={`${c}-${i}`}
            type="button"
            className="flow-clr-palette__tile"
            style={{ background: c }}
            aria-label={`Swatch ${c}`}
            aria-pressed={sel.has(i)}
            title={c}
            draggable
            onClick={(e) => onSwatchClick(i, e)}
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from !== null && from !== i) reorderSwatches(current.id, from, i);
              setSelected([]);
            }}
          />
        ))}
      </div>

      <div className="flow-clr-palette__row">
        {renaming ? (
          <input
            className="flow-clr-palette__name"
            aria-label="Palette name"
            autoFocus
            defaultValue={current.name}
            onBlur={(e) => {
              renamePalette(current.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setRenaming(false);
            }}
          />
        ) : (
          <select
            className="flow-clr-palette__select"
            aria-label="Palette"
            value={current.id}
            title="Double-click to rename"
            onChange={(e) => choosePalette(e.target.value)}
            onDoubleClick={() => setRenaming(true)}
          >
            {palettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label="Add palette"
          onClick={() => choosePalette(addPalette().id)}
        >
          +
        </button>
        <button
          type="button"
          className="flow-clr-palette__icon"
          aria-label={selected.length > 0 ? "Remove selected swatches" : "Delete palette"}
          onClick={onTrash}
        >
          🗑
        </button>
      </div>

      {confirming && (
        <div className="flow-clr-palette__confirm" role="alertdialog" aria-label="Delete palette">
          <p>Delete the &ldquo;{current.name}&rdquo; palette?</p>
          <div className="flow-clr-palette__confirm-actions">
            <button type="button" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              type="button"
              aria-label="Confirm delete"
              onClick={() => {
                removePalette(current.id);
                setConfirming(false);
                setSelected([]);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
