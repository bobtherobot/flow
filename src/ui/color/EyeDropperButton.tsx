import "./color.css";

interface EyeDropperButtonProps {
  /** Absent until Phase 5 wires the vendor eyedropper; the button renders
   *  disabled rather than absent so the layout does not shift when it lands. */
  onPick?: () => void;
}

export function EyeDropperButton({ onPick }: EyeDropperButtonProps) {
  return (
    <button
      type="button"
      className="flow-clr-eyedropper"
      aria-label="Pick a color from the canvas"
      title="Pick a color from the canvas"
      disabled={!onPick}
      onClick={onPick}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none"
           stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 3a2.8 2.8 0 0 1 4 4l-8 8-4 1 1-4z" />
        <path d="M9 12 4 17v3h3l5-5" />
      </svg>
    </button>
  );
}
