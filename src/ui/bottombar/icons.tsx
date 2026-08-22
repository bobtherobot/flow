import type { ReactNode } from "react";

/** 20×20 stroked wrapper (matches toolbar/quickbar icons so buttons drive the
 *  color via `currentColor`). Hand-rolled to stay fork-independent. */
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

/** Grid: 2×2 cells (mirrors the quickbar grid glyph). */
export const gridIcon = (
  <Svg>
    <rect x="3.5" y="3.5" width="13" height="13" rx="1" />
    <path d="M10 3.5v13M3.5 10h13" />
  </Svg>
);

/** Minus for zoom out. */
export const minusIcon = (
  <Svg>
    <path d="M5 10h10" />
  </Svg>
);

/** Plus for zoom in. */
export const plusIcon = (
  <Svg>
    <path d="M10 5v10M5 10h10" />
  </Svg>
);

/** Magnifier for the search execute button. */
export const searchIcon = (
  <Svg>
    <circle cx="8.5" cy="8.5" r="5" />
    <path d="M12.5 12.5L17 17" />
  </Svg>
);

/** Icon lookup for the two `toggle` items, keyed by item id. */
export function bottomIcon(id: string): ReactNode {
  if (id === "gridMode") return gridIcon;
  return null;
}
