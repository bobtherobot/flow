import "./panels.css";
import { PanelDock } from "./dock/PanelDock";
import type { PanelDef } from "./dock/panel-types";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useSelectionStyle } from "./useSelectionStyle";
import { StylePanel } from "./StylePanel";

/** Menu-bar height the dock sits below (matches --flow-menubar-h). */
const MENUBAR_H = 36;

/** Placeholder content for panels not yet built (Stroke → P4, Text → P5). */
function Placeholder({ note }: { note: string }) {
  return <p className="flow-pnl-stub">{note}</p>;
}

/**
 * Mounts the dockable accordion and bridges it to the live Excalidraw scene.
 * The selection-style subscription is created once here and shared by every
 * panel, so the whole dock re-renders together as the selection changes.
 */
export function PanelsRoot({ api }: { api: ExcalidrawAPI | null }) {
  const sel = useSelectionStyle(api);

  const defs: PanelDef[] = [
    { id: "style", label: "Style", render: () => <StylePanel sel={sel} /> },
    { id: "stroke", label: "Stroke", render: () => <Placeholder note="Width · Arrows · Dash style" /> },
    { id: "text", label: "Text", render: () => <Placeholder note="Font · Size · Align" /> },
  ];

  return <PanelDock defs={defs} topOffset={MENUBAR_H} />;
}
