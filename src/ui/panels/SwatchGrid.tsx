// src/ui/panels/SwatchGrid.tsx
import { useRef } from "react";

export interface SwatchGridProps {
  colors: string[];
  selected: number[];
  onAdd: () => void;
  onSelect: (index: number, shift: boolean) => void;
  onEdit: (index: number) => void;
  onReorder: (from: number, to: number) => void;
}

/**
 * The swatch grid: a pinned, non-draggable "+" tile followed by one button per
 * color. Selection/edit/reorder are reported up; the panel owns the state.
 */
export function SwatchGrid({ colors, selected, onAdd, onSelect, onEdit, onReorder }: SwatchGridProps) {
  const dragFrom = useRef<number | null>(null);
  const sel = new Set(selected);

  return (
    <div className="flow-sw-grid">
      <button
        type="button"
        className="flow-sw-add"
        aria-label="Add swatch"
        onClick={onAdd}
      >
        +
      </button>
      {colors.map((c, i) => (
        <button
          key={`${c}-${i}`}
          type="button"
          className="flow-sw-tile"
          style={{ background: c }}
          aria-label={`Swatch ${c}`}
          aria-pressed={sel.has(i)}
          title={c}
          draggable
          onClick={(e) => onSelect(i, e.shiftKey)}
          onDoubleClick={() => onEdit(i)}
          onDragStart={() => {
            dragFrom.current = i;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const from = dragFrom.current;
            dragFrom.current = null;
            if (from !== null && from !== i) onReorder(from, i);
          }}
        />
      ))}
    </div>
  );
}
