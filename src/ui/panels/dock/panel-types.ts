import type { ReactNode } from "react";

/**
 * A registered accordion panel. The dock owns geometry/visibility keyed by
 * `id`; the panel supplies its label, its content, and optional header action
 * controls (rendered to the right of the title).
 */
export interface PanelDef {
  id: string;
  label: string;
  render: () => ReactNode;
  actions?: ReactNode;
}
