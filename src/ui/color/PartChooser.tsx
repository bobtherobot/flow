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
 *  independent of render order, which moves the active part last. Every part
 *  is always on screen, so this is also the full set of boxes rendered. */
const CANONICAL_ORDER: ColorPart[] = ["fill", "stroke", "text"];

/**
 * Where each part sits, in units of `--flow-clr-part-size`. Fill and stroke
 * step down a diagonal; text drops below fill and left-aligned with it, so it
 * reads as "the two edges" plus "the label".
 *
 * These three are distinct by construction, which is what makes fixed
 * positions safe — an earlier attempt gave stroke and text the same spot,
 * burying whichever sat behind. Because every part now renders unconditionally,
 * a part's position no longer depends on what else is on screen at all.
 */
const POSITION: Record<ColorPart, { top: number; left: number }> = {
  fill: { top: 0, left: 0 },
  stroke: { top: 0.5, left: 0.5 },
  text: { top: 1.25, left: 0 },
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
 * Radios rather than buttons: this is a single choice among a small set, which
 * is what a radiogroup means semantically. A custom radiogroup does NOT get
 * keyboard navigation for free the way native grouped inputs do, so the roving
 * tabindex and arrow handling below are required, not decorative.
 */
export function PartChooser({ target, compact = false }: PartChooserProps) {
  const { part, available, setPart, isMixed, partColor, swap, quickSet } = target;
  const canSwap = available.includes("fill") && available.includes("stroke");
  const boxRefs = useRef<Partial<Record<ColorPart, HTMLButtonElement | null>>>({});

  // Every part is always on screen; `available` decides which are live, not
  // which exist. A stack that grew and shrank with the selection resized the
  // saturation box beside it on every click.
  const isLive = (p: ColorPart) => available.includes(p);

  // DOM order doubles as the stacking order here (backed up by `--active`'s
  // z-index). Two rules decide it:
  //
  //  1. The active part renders last, so it paints over its neighbours.
  //  2. Text sinks to the bottom whenever it is NOT the active part. The T
  //     overlaps stroke's bottom-left corner, and painted on top of stroke
  //     while an edge is active it reads as though the picker were aimed at
  //     the text — nothing else on screen contradicts that.
  const back = CANONICAL_ORDER.filter((p) => p !== part);
  const ordered = [
    ...back.filter((p) => p === "text"),
    ...back.filter((p) => p !== "text"),
    part,
  ];

  /** The parts arrow-key cycling steps through — dimmed boxes are not stops,
   *  or the cycle would land the picker on a write that goes nowhere. */
  const stops = CANONICAL_ORDER.filter(isLive);

  const onStackKeyDown = (e: React.KeyboardEvent) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    if (stops.length === 0) return;
    const i = stops.indexOf(part);
    const next = stops[(i + (forward ? 1 : -1) + stops.length) % stops.length];
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
          const live = isLive(p);
          const color = partColor(p);
          const none = color === "transparent";
          // isMixed describes only the currently active part's read; a back
          // box has no independent opinion on mixedness.
          const mixed = isMixed && p === part;
          const classes = [
            "flow-clr-part",
            p === part ? "flow-clr-part--active" : "",
            live ? "" : "flow-clr-part--off",
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
              // `aria-disabled`, not `disabled`: the box stays in the
              // radiogroup and keeps its accessible name, so the control reads
              // as one stable object whose parts light up and dim rather than
              // one that gains and loses members.
              aria-disabled={!live}
              aria-label={`${PART_LABEL[p]}${live ? "" : ", unavailable"}${none ? ", none" : ""}${mixed ? ", mixed" : ""}`}
              title={live ? PART_LABEL[p] : `${PART_LABEL[p]} — not available for this selection`}
              className={classes}
              tabIndex={p === part ? 0 : -1}
              style={{
                ["--flow-clr-part-top" as string]: POSITION[p].top,
                ["--flow-clr-part-left" as string]: POSITION[p].left,
              }}
              onClick={() => live && setPart(p)}
            >
              <PartArt part={p} color={color} isMixed={mixed} />
            </button>
          );
        })}

        {/* Absolutely positioned, so unmounting it shifts nothing — but
            flickering it in and out is the same jitter the dimmed boxes
            exist to avoid, so it dims in place instead. */}
        <button
          type="button"
          className={`flow-clr-chooser__swap${canSwap ? "" : " flow-clr-chooser__swap--off"}`}
          aria-label="Swap fill and stroke"
          aria-disabled={!canSwap}
          title={
            canSwap
              ? "Swap fill and stroke"
              : "Swap fill and stroke — not available for this selection"
          }
          onClick={() => canSwap && swap()}
        >
          <svg
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
