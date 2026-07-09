import type { ReactNode } from "react";
import { TOOL_ICONS } from "../toolbar/icons";
import { LOCK_ID, BINDING_ID } from "./actions";

/** 20×20 stroked wrapper (matches toolbar/icons.tsx so buttons control color). */
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

const fill = (node: ReactNode) => node;

/** Align/distribute glyphs: an 18×14 wrapper matching AlignPanel's style. */
function AlignSvg({ children }: { children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 18 14" aria-hidden="true">
      {children}
    </svg>
  );
}
const guide = (d: string) => (
  <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
);
const align = (children: ReactNode) => <AlignSvg>{children}</AlignSvg>;

/** Icons for the non-tool quick items, keyed by item id. Tool ids fall through
 *  to the rail's TOOL_ICONS (see QUICK_ICONS below). Hand-rolled to stay
 *  fork-independent, matching the AlignPanel/TextPanel convention. */
const ACTION_ICONS: Record<string, ReactNode> = {
  // Z-order: a filled "selected" square + an outlined neighbor + a chevron.
  bringToFront: (
    <Svg>
      <rect x="7" y="7" width="9" height="9" rx="1" fill="currentColor" stroke="none" />
      <rect x="4" y="4" width="9" height="9" rx="1" />
      <path d="M10 3.5l2 2M10 3.5l-2 2M10 3.5v4" />
    </Svg>
  ),
  bringForward: (
    <Svg>
      <rect x="4" y="4" width="9" height="9" rx="1" fill="currentColor" stroke="none" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </Svg>
  ),
  sendBackward: (
    <Svg>
      <rect x="4" y="4" width="8" height="8" rx="1" />
      <rect x="8" y="8" width="9" height="9" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  sendToBack: (
    <Svg>
      <rect x="7" y="7" width="9" height="9" rx="1" />
      <rect x="4" y="4" width="9" height="9" rx="1" fill="currentColor" stroke="none" />
      <path d="M10 16.5l2-2M10 16.5l-2-2M10 16.5v-4" />
    </Svg>
  ),
  // Grouping: dashed frame around two squares (group) / broken frame (ungroup).
  group: (
    <Svg>
      <rect x="3" y="3" width="14" height="14" rx="1.5" strokeDasharray="2 2" />
      <rect x="5.5" y="5.5" width="4.5" height="4.5" fill="currentColor" stroke="none" />
      <rect x="10" y="10" width="4.5" height="4.5" fill="currentColor" stroke="none" />
    </Svg>
  ),
  ungroup: (
    <Svg>
      <path d="M3 6V3h3M17 6V3h-3M3 14v3h3M17 14v3h-3" />
      <rect x="5" y="5" width="5" height="5" fill="currentColor" stroke="none" />
      <rect x="10" y="10" width="5" height="5" fill="currentColor" stroke="none" />
    </Svg>
  ),
  // Snap to objects: two boxes with a shared alignment guide.
  objectsSnapMode: (
    <Svg>
      <path d="M10 2v16" strokeDasharray="2 2" />
      <rect x="3.5" y="5" width="6" height="4" rx="1" fill="currentColor" stroke="none" />
      <rect x="10.5" y="11" width="6" height="4" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  ),
  // Grid: 2×2 cells.
  gridMode: (
    <Svg>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1" />
      <path d="M10 3.5v13M3.5 10h13" />
    </Svg>
  ),
  // Arrow binding: an arrow anchored into a node.
  [BINDING_ID]: (
    <Svg>
      <circle cx="14.5" cy="14.5" r="2.5" fill="currentColor" stroke="none" />
      <path d="M3 3l9.5 9.5" />
      <path d="M3 7V3h4" />
    </Svg>
  ),
  // Tool lock: reuse the rail's padlock glyph.
  [LOCK_ID]: TOOL_ICONS[LOCK_ID],
  // Zen mode: focus frame with a center dot.
  zenMode: (
    <Svg>
      <path d="M4 7V4h3M16 7V4h-3M4 13v3h3M16 13v3h-3" />
      <circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  ),
  // Align + distribute: guide line at the target edge + bars (from AlignPanel).
  alignLeft: align(<>{guide("M2 1 V13")}<rect x="3.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>),
  alignHorizontallyCentered: align(<>{guide("M9 1 V13")}<rect x="5.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>),
  alignRight: align(<>{guide("M16 1 V13")}<rect x="7.5" y="3" width="7" height="3" fill="currentColor" /><rect x="3.5" y="8" width="11" height="3" fill="currentColor" /></>),
  alignTop: align(<>{guide("M1 2 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="3.5" width="3" height="9" fill="currentColor" /></>),
  alignVerticallyCentered: align(<>{guide("M1 7 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="2.5" width="3" height="9" fill="currentColor" /></>),
  alignBottom: align(<>{guide("M1 12 H17")}<rect x="4" y="3.5" width="3" height="7" fill="currentColor" /><rect x="11" y="1.5" width="3" height="9" fill="currentColor" /></>),
  distributeHorizontally: align(<><rect x="2" y="3" width="2.5" height="8" fill="currentColor" /><rect x="7.75" y="3" width="2.5" height="8" fill="currentColor" /><rect x="13.5" y="3" width="2.5" height="8" fill="currentColor" /></>),
  distributeVertically: align(<><rect x="4" y="2" width="10" height="2.5" fill="currentColor" /><rect x="4" y="5.75" width="10" height="2.5" fill="currentColor" /><rect x="4" y="9.5" width="10" height="2.5" fill="currentColor" /></>),
  // History: curved arrows.
  undo: (
    <Svg>
      <path d="M6 8H12a4 4 0 010 8H8" />
      <path d="M6 8l3-3M6 8l3 3" />
    </Svg>
  ),
  redo: (
    <Svg>
      <path d="M14 8H8a4 4 0 000 8h4" />
      <path d="M14 8l-3-3M14 8l-3 3" />
    </Svg>
  ),
};

/** Icon lookup for any quick item id: hand-rolled action/toggle glyphs, with
 *  tool ids falling through to the shared TOOL_ICONS. */
export function quickIcon(id: string): ReactNode {
  return ACTION_ICONS[id] ?? (TOOL_ICONS as Record<string, ReactNode>)[id] ?? fill(null);
}
