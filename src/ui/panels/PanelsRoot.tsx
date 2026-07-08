import "./panels.css";
import { PanelDock } from "./dock/PanelDock";
import type { PanelDef } from "./dock/panel-types";

/** Menu-bar height the dock sits below (matches --flow-menubar-h). */
const MENUBAR_H = 36;

/**
 * Phase 1 stub content. Real controls (Style/Stroke/Text) replace these in
 * Phases 3–5; the dock, docking behavior, and persistence are exercised now
 * with placeholders so the engine can be validated independently.
 */
function Placeholder({ note }: { note: string }) {
  return <p className="flow-pnl-stub">{note}</p>;
}

const PANEL_DEFS: PanelDef[] = [
  { id: "style", label: "Style", render: () => <Placeholder note="Background · Stroke · Text color" /> },
  { id: "stroke", label: "Stroke", render: () => <Placeholder note="Width · Arrows · Dash style" /> },
  { id: "text", label: "Text", render: () => <Placeholder note="Font · Size · Align" /> },
];

/** Mounts the dockable accordion. Rendered once, near the canvas in App. */
export function PanelsRoot() {
  return <PanelDock defs={PANEL_DEFS} topOffset={MENUBAR_H} />;
}
