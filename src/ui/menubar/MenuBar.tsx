import * as Menubar from "@radix-ui/react-menubar";
import type { ImageFormat } from "../../lib/excalidraw-scene";
import "./menubar.css";

export interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: (format: ImageFormat) => void;
  onPreferences: () => void;
  onClearCanvas: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  onAbout: () => void;
}

const contentProps = { align: "start", sideOffset: 4, className: "wimp-menu" } as const;

/**
 * Traditional desktop menu bar (File / View / Help). Radix supplies the
 * WAI-ARIA menubar behavior (roving focus, arrow keys, typeahead, submenu
 * flyout); every action is delegated to a callback owned by App.
 */
export function MenuBar(props: MenuBarProps) {
  return (
    <Menubar.Root className="wimp-menubar" aria-label="Application menu">
      <Menubar.Menu>
        <Menubar.Trigger className="wimp-menubar__trigger">File</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onNew}>
              New
            </Menubar.Item>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onOpen}>
              Open…
            </Menubar.Item>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onSave}>
              Save…
            </Menubar.Item>
            <Menubar.Sub>
              <Menubar.SubTrigger className="wimp-menu__item">
                Export
                <span className="wimp-menu__chevron" aria-hidden="true">›</span>
              </Menubar.SubTrigger>
              <Menubar.Portal>
                <Menubar.SubContent className="wimp-menu">
                  <Menubar.Item className="wimp-menu__item" onSelect={() => props.onExport("png")}>
                    PNG
                  </Menubar.Item>
                  <Menubar.Item className="wimp-menu__item" onSelect={() => props.onExport("svg")}>
                    SVG
                  </Menubar.Item>
                  <Menubar.Item className="wimp-menu__item" onSelect={() => props.onExport("jpg")}>
                    JPG
                  </Menubar.Item>
                </Menubar.SubContent>
              </Menubar.Portal>
            </Menubar.Sub>
            <Menubar.Separator className="wimp-menu__sep" />
            <Menubar.Item className="wimp-menu__item" onSelect={props.onPreferences}>
              Preferences…
            </Menubar.Item>
            <Menubar.Separator className="wimp-menu__sep" />
            <Menubar.Item className="wimp-menu__item" onSelect={props.onClearCanvas}>
              Clear Canvas
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="wimp-menubar__trigger">View</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onZoomIn}>
              Zoom In
            </Menubar.Item>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onZoomOut}>
              Zoom Out
            </Menubar.Item>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onZoomToFit}>
              Zoom to Fit
            </Menubar.Item>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onResetZoom}>
              Reset Zoom
            </Menubar.Item>
            <Menubar.Separator className="wimp-menu__sep" />
            <Menubar.Item className="wimp-menu__item" onSelect={props.onToggleGrid}>
              Toggle Grid
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="wimp-menubar__trigger">Help</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="wimp-menu__item" onSelect={props.onAbout}>
              About wimp…
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
    </Menubar.Root>
  );
}
