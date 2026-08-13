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
  copySwatchesTo,
} from "../../lib/palette-store";
import { RECENT_PALETTE_ID, nextSetName } from "../../lib/color-palettes";
import type { MenuPoint } from "../panels/dock/menu-position";
import { PaletteMenu } from "./PaletteMenu";
import { PaletteDialog } from "./PaletteDialog";

type DialogKind = "rename" | "add" | "delete" | "copy";

/** Which dialog is open. One field, not four booleans — they are mutually
 *  exclusive by construction, and four flags admit states like "renaming and
 *  deleting at once" that have no meaning. */
type Dialog = null | { kind: DialogKind };

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
 * drag a swatch onto it, or select swatches and click it. Everything that acts
 * on the palette as a whole — rename, add, delete, copy-to — sits behind the
 * gear beside the dropdown, replacing a `+` and a `🗑` whose meaning changed
 * underneath the user depending on whether swatches happened to be selected.
 */
export function PaletteSection({ currentColor, onPick }: PaletteSectionProps) {
  const { palettes, defaultPaletteId } = usePaletteState();
  const [selected, setSelected] = useState<number[]>([]);
  const [overTrash, setOverTrash] = useState(false);
  const dragFrom = useRef<number | null>(null);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [copyTarget, setCopyTarget] = useState("");
  const gearRef = useRef<HTMLButtonElement>(null);

  // Resolve defensively: defaultPaletteId can point at a just-deleted palette
  // for one render (e.g. right after removePalette reseeds).
  const current = palettes.find((p) => p.id === defaultPaletteId) ?? palettes[0];

  // Every palette except the one being copied FROM — copying into itself is
  // a no-op the store would swallow silently, so it should not be offerable.
  const others = palettes.filter((p) => p.id !== current.id);

  const choosePalette = (id: string) => {
    setDefaultPalette(id);
    // A selection is a list of indices into THIS palette's colors, so it cannot
    // survive a switch — the same indices would point at unrelated swatches.
    setSelected([]);
  };

  /** Closes the menu and opens the dialog in one step, so no action can leave
   *  both on screen at once. */
  const openDialog = (kind: DialogKind) => {
    setMenuOpen(false);
    setDialog({ kind });
  };

  /** Mirrors RailColorControl's anchor helper: the menu hangs off the gear's
   *  bottom-left and clamps itself on-screen from there. */
  const anchorFromGear = (): MenuPoint => {
    const r = gearRef.current?.getBoundingClientRect();
    return { top: r?.bottom ?? 0, left: r?.left ?? 0 };
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
    // The menu and all four dialogs portal to <body>, but a portal only moves
    // the DOM node — React synthetic events bubble along the REACT tree, so
    // every keystroke inside them still arrives here. Without this guard,
    // Backspace on a dialog's Cancel button (or on the delete-confirm
    // dialog's own container, which is where its focus starts) deletes the
    // swatches the dialog is sitting on top of, and palettes have no undo.
    if (menuOpen || dialog) return;
    // Ignore keys typed into the palette select — only act on the grid
    // itself. Copied from SwatchGrid's/SwatchesPanel's handling. Kept as
    // defence in depth behind the guard above, and still load-bearing on its
    // own terms: INPUT fires on every keystroke in the rename and add
    // dialogs' name field, SELECT on the copy dialog's target picker and on
    // this section's own palette dropdown, which is NOT behind any guard.
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
        <select
          className="flow-clr-palette__select"
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
        <button
          type="button"
          ref={gearRef}
          // The class is load-bearing, not decoration: PaletteMenu's outside-
          // press guard looks for exactly it, and without the match a press on
          // the gear would close the menu on pointerdown and the click that
          // follows would reopen it — making this toggle's close branch
          // unreachable.
          className="flow-clr-palette__gear"
          aria-label="Palette actions"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          ⚙
        </button>
      </div>

      {menuOpen && (
        <PaletteMenu
          anchor={anchorFromGear()}
          hasSelection={selected.length > 0}
          canDeletePalette={current.id !== RECENT_PALETTE_ID}
          canCopy={palettes.length > 1}
          // The menu portals to <body>, so focus opened inside it has nowhere
          // sane to fall back to. Escape and an outside press send it here.
          returnFocusTo={gearRef}
          onRename={() => {
            setDraftName(current.name);
            openDialog("rename");
          }}
          onAdd={() => {
            setDraftName(nextSetName(palettes));
            openDialog("add");
          }}
          onDeletePalette={() => openDialog("delete")}
          // The only action that needs no dialog: it is undoable by re-adding
          // the color, and the selection itself is the confirmation. Being
          // the one path that does not go through `openDialog`, it is also the
          // one that has to return focus itself — no dialog mounts to take it,
          // and the item holding focus is about to be unmounted.
          onDeleteSwatches={() => {
            removeSwatches(current.id, selected);
            setSelected([]);
            setMenuOpen(false);
            gearRef.current?.focus();
          }}
          onCopy={() => {
            setCopyTarget(others[0]?.id ?? "");
            openDialog("copy");
          }}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* All four pass `returnFocusTo={gearRef}`. The menu item that opened the
          dialog is gone by the time it mounts — `openDialog` clears `menuOpen`
          and sets `dialog` in one batch — so the shell's default "restore
          whatever was focused" would hand focus to a detached node and drop
          the user on <body>. The gear is the durable anchor, and it is what
          they pressed to start the interaction. */}
      {dialog?.kind === "rename" && (
        <PaletteDialog
          title="Rename palette"
          confirmLabel="OK"
          returnFocusTo={gearRef}
          confirmDisabled={draftName.trim() === ""}
          onConfirm={() => {
            renamePalette(current.id, draftName.trim());
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        >
          <input
            className="flow-input flow-clr-palette__name"
            aria-label="Palette name"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
        </PaletteDialog>
      )}

      {dialog?.kind === "add" && (
        <PaletteDialog
          title="Add palette"
          confirmLabel="OK"
          returnFocusTo={gearRef}
          confirmDisabled={draftName.trim() === ""}
          // Creating AND switching is what the `+` button did; a new palette is
          // empty, so creating without switching looks like nothing happened.
          onConfirm={() => {
            choosePalette(addPalette(draftName.trim()).id);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        >
          <input
            className="flow-input flow-clr-palette__name"
            aria-label="Palette name"
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            // The prefilled "color set N" is a placeholder, not a suggestion
            // worth preserving — select it so typing replaces it outright.
            onFocus={(e) => e.target.select()}
          />
        </PaletteDialog>
      )}

      {dialog?.kind === "delete" && (
        <PaletteDialog
          title="Delete palette"
          confirmLabel="Delete"
          returnFocusTo={gearRef}
          onConfirm={() => {
            removePalette(current.id);
            setSelected([]);
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        >
          <p>Delete the &ldquo;{current.name}&rdquo; palette?</p>
        </PaletteDialog>
      )}

      {dialog?.kind === "copy" && (
        <PaletteDialog
          title="Copy swatches to"
          confirmLabel="Copy"
          returnFocusTo={gearRef}
          confirmDisabled={copyTarget === ""}
          onConfirm={() => {
            copySwatchesTo(copyTarget, selected.map((i) => current.colors[i]));
            // The selection deliberately survives: copying is non-destructive
            // and sending the same set to a second palette is a plausible
            // next action.
            setDialog(null);
          }}
          onCancel={() => setDialog(null)}
        >
          <select
            className="flow-input flow-clr-palette__select"
            aria-label="Target palette"
            autoFocus
            value={copyTarget}
            onChange={(e) => setCopyTarget(e.target.value)}
          >
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </PaletteDialog>
      )}
    </div>
  );
}
