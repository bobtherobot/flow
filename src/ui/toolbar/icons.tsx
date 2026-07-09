import type { ReactNode } from "react";
import type { ToolId } from "./tools";
import { LOCK_ID } from "./tools";

/** Shared wrapper: 20×20, stroked with currentColor so the button controls color. */
function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Inline SVG icon per tool (+ lock). Hand-rolled to stay fork-independent,
 *  matching the AlignPanel/TextPanel convention. */
export const TOOL_ICONS: Record<ToolId | typeof LOCK_ID, ReactNode> = {
  selection: (
    <Svg>
      <path fill="currentColor" stroke="none" d="M5 3l0 12 3-3 2 4 2-1-2-4 4 0z" />
    </Svg>
  ),
  hand: (
    <Svg>
      <path d="M7 11V6.5a1 1 0 012 0V6a1 1 0 012 0v.5a1 1 0 012 0V11a4 4 0 01-4 4h-1a3 3 0 01-2.6-1.5L4.5 11a1 1 0 011.6-1.2L7 11z" />
    </Svg>
  ),
  rectangle: (
    <Svg>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
    </Svg>
  ),
  diamond: (
    <Svg>
      <path d="M10 3l7 7-7 7-7-7z" />
    </Svg>
  ),
  ellipse: (
    <Svg>
      <ellipse cx="10" cy="10" rx="7" ry="5.5" />
    </Svg>
  ),
  arrow: (
    <Svg>
      <path d="M4 16L16 4" />
      <path d="M16 4h-5M16 4v5" />
    </Svg>
  ),
  // Curved/elbow glyphs are Excalidraw's own arrow-type icons (Tabler, 24×24)
  // reused verbatim so the rail matches the Stroke ▸ Type control.
  "arrow-curved": (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16,12L20,9L16,6" />
      <path d="M6 20c0 -6.075 4.925 -11 11 -11h3" />
    </svg>
  ),
  "arrow-elbow": (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4,19L10,19C11.097,19 12,18.097 12,17L12,9C12,7.903 12.903,7 14,7L21,7" />
      <path d="M18 4l3 3l-3 3" />
    </svg>
  ),
  line: (
    <Svg>
      <path d="M4 16L16 4" />
    </Svg>
  ),
  freedraw: (
    <Svg>
      <path d="M3 14c2-1 3-6 4.5-6S9 13 11 13s2-7 3.5-7 1.5 4 2.5 5" />
    </Svg>
  ),
  text: (
    <Svg>
      <path d="M5 5h10M10 5v10" />
    </Svg>
  ),
  image: (
    <Svg>
      <rect x="3.5" y="5" width="13" height="10" rx="1" />
      <circle cx="7.5" cy="8.5" r="1.2" />
      <path d="M4 14l4-4 3 3 2-2 3 3" />
    </Svg>
  ),
  eraser: (
    <Svg>
      <path d="M4 13l6-6a1.5 1.5 0 012 0l2 2a1.5 1.5 0 010 2l-5 5H7z" />
      <path d="M7 16h9" />
    </Svg>
  ),
  frame: (
    <Svg>
      <path d="M6 3v14M14 3v14M3 6h14M3 14h14" />
    </Svg>
  ),
  laser: (
    <Svg>
      <path d="M13 4l3 3-7 7-3 1 1-3z" />
      <path d="M4 4l2.5 2.5M4 9h2.5M9 4v2.5" />
    </Svg>
  ),
  [LOCK_ID]: (
    <Svg>
      <rect x="5" y="9" width="10" height="7" rx="1" />
      <path d="M7 9V7a3 3 0 016 0v2" />
    </Svg>
  ),
};
