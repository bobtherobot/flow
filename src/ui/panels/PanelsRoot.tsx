import "./panels.css";
import { PanelDock } from "./dock/PanelDock";
import type { PanelDef } from "./dock/panel-types";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { Unit } from "../../lib/units";
import { useSelectionStyle } from "./useSelectionStyle";
import { StylePanel } from "./StylePanel";
import { StrokePanel } from "./StrokePanel";

/** Menu-bar height the dock sits below (matches --flow-menubar-h). */
const MENUBAR_H = 36;

/** Placeholder content for panels not yet built (Text → P5). */
function Placeholder({ note }: { note: string }) {
  return <p className="flow-pnl-stub">{note}</p>;
}

interface PanelsRootProps {
  api: ExcalidrawAPI | null;
  units: Unit;
}

/**
 * Mounts the dockable accordion and bridges it to the live Excalidraw scene.
 * The selection-style subscription is created once here and shared by every
 * panel, so the whole dock re-renders together as the selection changes.
 */
export function PanelsRoot({ api, units }: PanelsRootProps) {
  const sel = useSelectionStyle(api);

  const defs: PanelDef[] = [
    { id: "style", label: "Style", render: () => <StylePanel sel={sel} /> },
    { id: "stroke", label: "Stroke", render: () => <StrokePanel sel={sel} units={units} /> },
    { id: "text", label: "Text", render: () => <Placeholder note="Font · Size · Align" /> },
  ];

  return <PanelDock defs={defs} topOffset={MENUBAR_H} />;
}
