import { useId } from "react";
import type { ColorPart } from "../../lib/color-parts";

/**
 * Everything is drawn in this square and scaled by the <svg> element's own
 * size, so ONE set of stroke widths serves both the docked chooser (46px) and
 * the rail's compact one (32px). The CSS version this replaces needed a
 * parallel set of thicknesses per size, which is exactly the kind of thing
 * that drifts.
 */
const VIEW = 46;

/** The dark rule separates a part from whatever it overlaps; the light rule
 *  holds the swatch color off the dark rule. */
const INK = "var(--flow-ink)";
const SURFACE = "var(--flow-panel-bg)";

/** One definition of "no color", shared by a part's none state and the
 *  quartet's none chip. */
const SLASH = "#e03131";
const SLASH_WIDTH = 4;

/**
 * Path insets are set by the widest stroke each shape carries, so the artwork's
 * outer edge lands exactly on the viewBox: 4 for the w8 shapes, 7.5 for the
 * ring's w15. Change a stroke width and you must change the inset with it.
 */
const SQUARE_D = "M4 4H42V42H4Z";
const RING_D = "M7.5 7.5H38.5V38.5H7.5Z";
const T_D = "M4 4H42V16H29V42H17V16H4Z";

interface Layer {
  stroke: string;
  width: number;
  fill: string;
}

interface PartArtProps {
  part: ColorPart;
  /** `#rrggbb`, or the literal "transparent" for none. */
  color: string;
  isMixed?: boolean;
}

/** Shared <svg> shell: fills its button, invisible to the a11y tree (the
 *  button carries the name). */
function Canvas({ children }: { children: React.ReactNode }) {
  return (
    <svg
      className="flow-clr-art"
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width="100%"
      height="100%"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/**
 * One part's artwork: concentric stroked copies of that part's own path,
 * widest first. An SVG stroke of width W straddles the path line by W/2 each
 * side, so painting back-to-front in descending width produces even bands —
 * see the table in the design spec (§2).
 *
 * Reversed, the ring collapses to a solid dark square and the filled parts
 * lose their light rule. Both look deliberate; `PartArt.test.tsx` is what
 * catches it.
 */
export function PartArt({ part, color, isMixed = false }: PartArtProps) {
  // React's useId yields ":r0:". Colons resolve fine through getElementById,
  // which is how an SVG url(#id) attribute reference works, but they break any
  // CSS selector built from the same id — strip them rather than leave a trap.
  const uid = useId().replace(/:/g, "");
  const checkerId = `${uid}-checker`;
  const clipId = `${uid}-clip`;

  const isNone = color === "transparent";
  // A ring only means something with a real color in it, so none and mixed
  // fall back to the plain square. Same intent as the CSS this replaces
  // (`.flow-clr-part--none::after { content: none }`).
  const isRing = part === "stroke" && !isNone && !isMixed;

  const d = isRing ? RING_D : part === "text" ? T_D : SQUARE_D;
  const paint = isMixed ? `url(#${checkerId})` : isNone ? SURFACE : color;

  const layers: Layer[] = isRing
    ? [
        { stroke: INK, width: 15, fill: "none" },
        { stroke: SURFACE, width: 11, fill: "none" },
        { stroke: paint, width: 7, fill: "none" },
      ]
    : [
        { stroke: INK, width: 8, fill: "none" },
        { stroke: SURFACE, width: 4, fill: paint },
      ];

  return (
    <Canvas>
      {layers.map((l, i) => (
        <path
          key={i}
          d={d}
          fill={l.fill}
          stroke={l.stroke}
          strokeWidth={l.width}
          // Load-bearing: the fill paints over the inner half of its own
          // stroke, which is what makes the light rule read 2 units and not 4.
          // Only on the fill layer (the one with fill !== 'none').
          paintOrder={l.fill !== "none" ? "stroke fill" : undefined}
        />
      ))}

      {(isMixed || (isNone && part !== "stroke")) && (
        <defs>
          {isMixed && (
            <pattern id={checkerId} width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#fff" />
              <rect width="4" height="4" fill="#c8c8c8" />
              <rect x="4" y="4" width="4" height="4" fill="#c8c8c8" />
            </pattern>
          )}
          {isNone && part !== "stroke" && (
            <clipPath id={clipId}>
              <path d={d} />
            </clipPath>
          )}
        </defs>
      )}

      {isNone && part !== "stroke" && (
        <line
          x1="4"
          y1="4"
          x2={VIEW - 4}
          y2={VIEW - 4}
          stroke={SLASH}
          strokeWidth={SLASH_WIDTH}
          clipPath={`url(#${clipId})`}
        />
      )}
    </Canvas>
  );
}

/** The quartet's "none" chip. Same red slash as a part's none state, without
 *  the double rule — the chips carry a single hairline border in CSS. */
export function NoneSwatch() {
  return (
    <Canvas>
      <rect width={VIEW} height={VIEW} fill="#fff" />
      <line x1="0" y1="0" x2={VIEW} y2={VIEW} stroke={SLASH} strokeWidth={SLASH_WIDTH} />
    </Canvas>
  );
}
