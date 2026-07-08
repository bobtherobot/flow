/** A fixed-position top-left anchor, in viewport pixels. */
export interface MenuPoint {
  top: number;
  left: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Clamp a menu's ideal top-left so the whole menu stays inside the viewport,
 * keeping a small margin from every edge. Used for the panel config dropdown,
 * which anchors under the hamburger button — that button can sit near any edge
 * depending on where the panel is docked, so the naive anchor can overflow.
 *
 * If the menu is larger than the viewport on an axis, the top/left edge wins
 * (so the menu's start is always reachable rather than its end).
 */
export function clampMenuPosition(
  anchor: MenuPoint,
  size: MenuSize,
  viewport: ViewportSize,
  margin = 8,
): MenuPoint {
  const maxLeft = viewport.width - size.width - margin;
  const maxTop = viewport.height - size.height - margin;
  return {
    left: Math.max(margin, Math.min(anchor.left, maxLeft)),
    top: Math.max(margin, Math.min(anchor.top, maxTop)),
  };
}
