import { useRef } from "react";
import "./color.css";
import type { ColorPart } from "../../lib/color-parts";
import type { ColorTarget, QuickColor } from "./useColorTarget";
import { PartArt, NoneSwatch } from "./PartArt";

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

/** Canonical left-to-right/top-to-bottom order the diagonal steps through —
 *  independent of render order, which moves the active part last. */
const CANONICAL_ORDER: ColorPart[] = ["fill", "stroke", "text"];

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
 * Radios rather than buttons: this is a single choice among a small set, which
 * is what a radiogroup means semantically. A custom radiogroup does NOT get
 * keyboard navigation for free the way native grouped inputs do, so the roving
 * tabindex and arrow handling below are required, not decorative.
 */
export function PartChooser({ target, compact = false }: PartChooserProps) {
  const { part, available, setPart, isMixed, partColor, swap, quickSet } = target;
  const canSwap = available.includes("fill") && available.includes("stroke");
  const boxRefs = useRef<Partial<Record<ColorPart, HTMLButtonElement | null>>>({});

  // The active part renders last so it paints over its neighbours (DOM order
  // doubles as the stacking order here, backed up by `--active`'s z-index).
  const ordered = available.includes(part)
    ? [...available.filter((p) => p !== part), part]
    : available;

  // Diagonal position is driven by index among the parts actually on screen,
  // in canonical (not render) order — two parts land on the corners, three
  // spread evenly between them.
  const visible = CANONICAL_ORDER.filter((p) => available.includes(p));
  const offsetOf = (p: ColorPart) => (visible.length > 1 ? visible.indexOf(p) / (visible.length - 1) : 0);

  const onStackKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    const i = visible.indexOf(part);
    const next = visible[(i + (forward ? 1 : -1) + visible.length) % visible.length];
    setPart(next);
    boxRefs.current[next]?.focus();
  };

  return (
    <div className={`flow-clr-chooser${compact ? " flow-clr-chooser--compact" : ""}`}>
      <div
        className="flow-clr-chooser__stack"
        role="radiogroup"
        aria-label="Color target"
        onKeyDown={onStackKeyDown}
      >
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
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={p}
              ref={(el) => {
                boxRefs.current[p] = el;
              }}
              type="button"
              role="radio"
              aria-checked={p === part}
              aria-label={`${PART_LABEL[p]}${none ? ", none" : ""}${mixed ? ", mixed" : ""}`}
              title={PART_LABEL[p]}
              className={classes}
              tabIndex={p === part ? 0 : -1}
              style={{ ["--flow-clr-part-offset" as string]: offsetOf(p) }}
              onClick={() => setPart(p)}
            >
              <PartArt part={p} color={color} isMixed={mixed} />
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
            className="flow-clr-chip"
            style={q.kind === "none" ? undefined : { background: q.hex }}
            aria-label={q.label}
            title={q.label}
            onClick={() => quickSet(q.kind)}
          >
            {q.kind === "none" && <NoneSwatch />}
          </button>
        ))}
      </div>
    </div>
  );
}
