import "./color.css";
import type { ColorPart } from "../../lib/color-parts";
import type { ColorTarget, QuickColor } from "./useColorTarget";

interface PartChooserProps {
  target: ColorTarget;
  /** Tool-rail variant: smaller boxes, same behaviour. */
  compact?: boolean;
}

const PART_LABEL: Record<ColorPart, string> = {
  fill: "Fill",
  stroke: "Stroke",
  text: "Text",
};

const QUICK: { kind: QuickColor; label: string; hex: string }[] = [
  { kind: "none", label: "None", hex: "transparent" },
  { kind: "white", label: "White", hex: "#ffffff" },
  { kind: "grey", label: "Grey", hex: "#808080" },
  { kind: "black", label: "Black", hex: "#000000" },
];

/**
 * Illustrator's fill/stroke boxes. The front box is the part every other
 * control in the picker is editing, and clicking a back box brings it forward.
 *
 * Radios rather than buttons: this is a single choice among a small set,
 * which is what a radiogroup means semantically.
 */
export function PartChooser({ target, compact = false }: PartChooserProps) {
  const { part, available, setPart, isMixed, partColor, swap, quickSet } = target;
  const canSwap = available.includes("fill") && available.includes("stroke");

  // The active part renders last so it paints over its neighbours (DOM order
  // doubles as the stacking order here, backed up by `--active`'s z-index).
  const ordered = available.includes(part)
    ? [...available.filter((p) => p !== part), part]
    : available;

  return (
    <div className={`flow-clr-chooser${compact ? " flow-clr-chooser--compact" : ""}`}>
      <div className="flow-clr-chooser__stack" role="radiogroup" aria-label="Color target">
        {ordered.map((p) => {
          const color = partColor(p);
          const none = color === "transparent";
          // isMixed describes only the currently active part's read; a back
          // box has no independent opinion on mixedness.
          const mixed = isMixed && p === part;
          const classes = [
            "flow-clr-part",
            `flow-clr-part--${p}`,
            p === part ? "flow-clr-part--active" : "",
            none ? "flow-clr-part--none" : "",
            mixed ? "flow-clr-part--mixed" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={p === part}
              aria-label={`${PART_LABEL[p]}${none ? ", none" : ""}${mixed ? ", mixed" : ""}`}
              title={PART_LABEL[p]}
              className={classes}
              style={none || mixed ? undefined : { ["--flow-clr-part-color" as string]: color }}
              onClick={() => setPart(p)}
            >
              {p === "text" && (
                <span className="flow-clr-part__glyph" aria-hidden="true">
                  T
                </span>
              )}
            </button>
          );
        })}

        {canSwap && (
          <button
            type="button"
            className="flow-clr-chooser__swap"
            aria-label="Swap fill and stroke"
            title="Swap fill and stroke"
            onClick={swap}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8h11a4 4 0 0 1 4 4v5" />
              <path d="M7 5 4 8l3 3" />
              <path d="m16 14 3 3 3-3" />
            </svg>
          </button>
        )}
      </div>

      <div className="flow-clr-quartet">
        {QUICK.map((q) => (
          <button
            key={q.kind}
            type="button"
            className={`flow-clr-chip${q.kind === "none" ? " flow-clr-chip--none" : ""}`}
            style={q.kind === "none" ? undefined : { background: q.hex }}
            aria-label={q.label}
            title={q.label}
            onClick={() => quickSet(q.kind)}
          />
        ))}
      </div>
    </div>
  );
}
