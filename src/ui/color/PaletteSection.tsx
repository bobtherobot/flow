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
import { RECENT_PALETTE_ID } from "../../lib/color-palettes";

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
 * swatch via `onPick`; ⌘/Ctrl/Shift-click selects it for the trash instead
 * (shift is `SwatchGrid`'s original multi-select gesture for this exact grid,
 * carried forward rather than dropped — a habitual shift-click falling
 * through to "apply" would silently overwrite the live color instead of
 * just doing nothing). That split keeps the common action (apply a color)
 * one click, and the destructive one (queue for deletion) deliberate.
 *
 * The grid's leading trash tile is the discoverable route to the same thing:
 * drag a swatch onto it, or select swatches and click it. The footer trash
 * keeps both of its jobs (remove the selected swatches / delete the whole
 * palette) and now says which one it will do via `title`.
 */
export function PaletteSection({ currentColor, onPick }: PaletteSectionProps) {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selected, setSelected] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const dragFrom = useRef<number | null>(null);
  /** Set by Escape so the input's blur-on-unmount does not commit the edit. */
  const abandonRename = useRef(false);

  // Resolve defensively: defaultPaletteId can point at a just-deleted palette
  // for one render (e.g. right after removePalette reseeds).
  const current = palettes.find((p) => p.id === defaultPaletteId) ?? palettes[0];
  const isRecent = current.id === RECENT_PALETTE_ID;

  const choosePalette = (id: string) => {
    setDefaultPalette(id);
    // Every piece of transient state tied to "which palette is current" resets
    // together — leaving `renaming` set would edit the new palette's name in an
    // input seeded from the old one's.
    setSelected([]);
    setConfirming(false);
    setRenaming(false);
  };

  const onTrash = () => {
    if (selected.length > 0) {
      removeSwatches(current.id, selected);
      setSelected([]);
      return;
    }
    if (isRecent) return;
    setConfirming(true);
  };

  const onSwatchClick = (index: number, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
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
          className={`flow-clr-palette__trash${overTrash ? " flow-clr-palette__trash--over" : ""}`}
          aria-label="Delete swatches"
          title="Delete swatches — drag one here, or ⌘/Ctrl-click swatches to select them first"
          // NOT `disabled`: Chrome delivers no mouse events to a disabled form
          // control, and HTML5 drop targets run on mouse events — a disabled
          // trash would refuse drops in exactly the common case (nothing
          // selected, user drags a swatch onto it). aria-disabled announces
          // the same thing and keeps the element live.
          aria-disabled={selected.length === 0}
          onClick={() => {
            if (selected.length === 0) return;
            removeSwatches(current.id, selected);
            setSelected([]);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOverTrash(true);
          }}
          onDragLeave={() => setOverTrash(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOverTrash(false);
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null) removeSwatches(current.id, [from]);
            setSelected([]);
          }}
        >
          🗑
        </button>
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
            // dragend fires on the source element whether the drag succeeded
            // or was cancelled (dropped over the canvas, Escape). Without
            // this, a cancelled drag leaves dragFrom.current pointing at a
            // real index indefinitely, and the next unrelated drop on the
            // trash would silently delete that stranded swatch.
            onDragEnd={() => {
              dragFrom.current = null;
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
            // Keyed so switching palettes rebuilds the field from the new name
            // instead of carrying the old one's text across.
            key={current.id}
            className="flow-clr-palette__name"
            aria-label="Palette name"
            autoFocus
            defaultValue={current.name}
            // Cleared on the input's OWN mount rather than by whichever handler
            // happens to open rename mode: a ref callback can't be skipped by a
            // future second entry point the way a reset tucked into
            // onDoubleClick could be, so the flag can never strand at `true`.
            ref={(el) => {
              if (el) abandonRename.current = false;
            }}
            onBlur={(e) => {
              // Escape sets this first. Unmounting a focused input can fire a
              // blur on the way out, which would commit the very edit Escape
              // was meant to discard — so abandonment is an explicit flag, not
              // an assumption about event ordering.
              if (abandonRename.current) {
                abandonRename.current = false;
                setRenaming(false);
                return;
              }
              renamePalette(current.id, e.target.value);
              setRenaming(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                abandonRename.current = true;
                setRenaming(false);
              }
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
          // NOT `disabled`: Chrome delivers no mouse events to a disabled form
          // control and this grid's tiles are HTML5 drop targets that run on
          // them — the same trap documented on the trash tile above.
          aria-disabled={selected.length === 0 && isRecent}
          title={
            selected.length > 0
              ? "Remove the selected swatches"
              : isRecent
                ? `“${current.name}” updates itself as you pick colors, so it can’t be deleted`
                : `Delete the “${current.name}” palette`
          }
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
