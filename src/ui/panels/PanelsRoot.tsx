import "./panels.css";
import { PanelDock } from "./dock/PanelDock";
import type { PanelDef } from "./dock/panel-types";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import type { Unit } from "../../lib/units";
import { useSelectionStyle } from "./useSelectionStyle";
import { TransformPanel } from "./TransformPanel";
import { ColorPanel } from "./ColorPanel";
import { StrokePanel } from "./StrokePanel";
import { TextPanel } from "./TextPanel";
import { AlignPanel } from "./AlignPanel";
import { SearchPanel, type SearchSignal } from "./SearchPanel";

/** Menu-bar height the dock sits below (matches --flow-menubar-h). */
const MENUBAR_H = 36;

/** Placeholder for the Layers panel — the feature lands in a later phase; the
 *  slot is reserved so it drops into the accordion when ready. */
function LayersPlaceholder() {
  return <p className="flow-pnl-stub">Layers are coming in a later update.</p>;
}

interface PanelsRootProps {
  api: ExcalidrawAPI | null;
  units: Unit;
  /** Drives the Search sub-panel; bumping its nonce opens the panel. */
  search: SearchSignal;
  /** Sets the global laser-pointer color (persist + live-update). */
  onChangeLaserColor: (color: string) => void;
}

/**
 * Mounts the dockable accordion and bridges it to the live Excalidraw scene.
 * The selection-style subscription is created once here and shared by every
 * panel, so the whole dock re-renders together as the selection changes.
 */
export function PanelsRoot({ api, units, search, onChangeLaserColor }: PanelsRootProps) {
  const sel = useSelectionStyle(api);

  const defs: PanelDef[] = [
    { id: "transform", label: "Transform", render: () => <TransformPanel sel={sel} api={api} /> },
    { id: "color", label: "Color", render: () => <ColorPanel sel={sel} onChangeLaserColor={onChangeLaserColor} /> },
    { id: "stroke", label: "Stroke", render: () => <StrokePanel sel={sel} units={units} /> },
    { id: "text", label: "Text", render: () => <TextPanel sel={sel} /> },
    { id: "align", label: "Align", render: () => <AlignPanel sel={sel} /> },
    { id: "search", label: "Search", render: () => <SearchPanel api={api} signal={search} /> },
    { id: "layers", label: "Layers", render: () => <LayersPlaceholder /> },
  ];

  return <PanelDock defs={defs} topOffset={MENUBAR_H} openPanel={{ id: "search", nonce: search.nonce }} />;
}
