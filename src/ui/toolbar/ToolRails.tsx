import { useEffect } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { useSelectionStyle } from "../panels/useSelectionStyle";
import { ToolRail } from "./ToolRail";
import { RailColorControl } from "./RailColorControl";
import { TOOLS, SHAPES } from "./tools";
import type { ToolbarState } from "./toolbar-state";
import {
  TOOL_RAIL_WIDTH,
  SHAPE_RAIL_WIDTH,
  railGutter,
  shapebarDockLeft,
} from "./rail-layout";

interface ToolRailsProps {
  api: ExcalidrawAPI | null;
  toolbar: ToolbarState;
  onToolbarChange: (next: ToolbarState) => void;
  shapebar: ToolbarState;
  onShapebarChange: (next: ToolbarState) => void;
}

/**
 * Mounts flow's two left rails and owns everything that spans them: the
 * reserved canvas gutter, the dock-slot arithmetic, and the selection-style
 * bridge the toolbar's color control needs.
 *
 * The `useSelectionStyle` call lives here rather than in App for the reason
 * documented on `useActiveTool`'s call site: an onChange-driven state bump in
 * App re-renders `<Excalidraw>`, whose `componentDidUpdate` re-fires `onChange`
 * whether or not anything changed — a tight, un-terminating loop. Every other
 * onChange bridge in this codebase lives in a sibling of `<Excalidraw>`, never
 * in App, and this one follows the same rule.
 */
export function ToolRails({
  api,
  toolbar,
  onToolbarChange,
  shapebar,
  onShapebarChange,
}: ToolRailsProps) {
  const sel = useSelectionStyle(api);
  const gutter = railGutter(toolbar, shapebar);

  // Reserve the left gutter so the canvas insets around the docked rails
  // (keeping Excalidraw's bottom-left zoom/undo controls clear). Single writer:
  // ToolRail is mounted twice and would otherwise race over this one variable.
  //
  // Depends on the computed `gutter` number, not `[toolbar, shapebar]`: a
  // floating rail's `onMove` mints a new state object on every pointermove,
  // so depending on the whole objects reran this effect's
  // removeProperty+setProperty pair every frame of a drag even though the
  // gutter (unaffected by x/y while floating) never changed.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--flow-toolbar-reserved", `${gutter}px`);
    return () => {
      root.style.removeProperty("--flow-toolbar-reserved");
    };
  }, [gutter]);

  return (
    <>
      <ToolRail
        api={api}
        tools={TOOLS}
        width={TOOL_RAIL_WIDTH}
        columns={1}
        label="Tools"
        noun="toolbar"
        dockLeft={0}
        state={toolbar}
        onChange={onToolbarChange}
        footer={
          <RailColorControl sel={sel} dockedPopupLeft={toolbar.floating ? null : gutter} />
        }
      />
      <ToolRail
        api={api}
        tools={SHAPES}
        width={SHAPE_RAIL_WIDTH}
        columns={2}
        label="Shapes"
        noun="shapebar"
        dockLeft={shapebarDockLeft(toolbar)}
        state={shapebar}
        onChange={onShapebarChange}
      />
    </>
  );
}
