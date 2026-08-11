import "./color.css";

interface ColorPreviewProps {
  /** `#rrggbb` or "transparent". */
  hex: string;
  /** 0–100. */
  alpha: number;
}

/** The round well showing the live draft color over a checkerboard. */
export function ColorPreview({ hex, alpha }: ColorPreviewProps) {
  const isNone = hex === "transparent";
  const label = isNone
    ? "No color"
    : `Current color ${hex}, ${Math.round(alpha)}% opacity`;

  return (
    <div
      className={`flow-clr-preview${isNone ? " flow-clr-preview--none" : ""}`}
      aria-label={label}
      title={label}
    >
      {!isNone && (
        <span
          className="flow-clr-preview__fill"
          style={{ backgroundColor: hex, opacity: alpha / 100 }}
        />
      )}
    </div>
  );
}
