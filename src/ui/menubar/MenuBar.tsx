import * as Menubar from "@radix-ui/react-menubar";
import type { ImageFormat } from "../../lib/excalidraw-scene";
import "./menubar.css";

export interface MenuBarProps {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: (format: ImageFormat) => void;
  onPreferences: () => void;
  onProperties: () => void;
  onClearCanvas: () => void;
  /** Dispatch an Excalidraw action by name (z-order, group, align, etc.). */
  onEditAction: (name: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomToFit: () => void;
  onResetZoom: () => void;
  onToggleGrid: () => void;
  /** Whether the tool rail is currently shown (drives the View checkbox).
   *  Optional so the tree builds before App wires it (Task 11); App always sets it. */
  isToolbarVisible?: boolean;
  /** Toggle the tool rail's visibility. */
  onToggleToolbar?: () => void;
  /** Whether the tool rail is floating (drives the Dock item's enabled state). */
  isToolbarFloating?: boolean;
  /** Re-dock the tool rail to the left edge. */
  onDockToolbar?: () => void;
  /** Whether the quick-actions bar is currently shown (drives the View checkbox). */
  isQuickbarVisible?: boolean;
  /** Toggle the quick-actions bar's visibility. */
  onToggleQuickbar?: () => void;
  /** Whether the quick-actions bar is floating (drives the Dock item's enabled state). */
  isQuickbarFloating?: boolean;
  /** Re-dock the quick-actions bar into the top strip. */
  onDockQuickbar?: () => void;
  /** Whether the bottom bar is currently shown (drives the View checkbox). */
  isBottombarVisible?: boolean;
  /** Toggle the bottom bar's visibility. */
  onToggleBottombar?: () => void;
  /** Whether the bottom bar is floating (drives the Dock item's enabled state). */
  isBottombarFloating?: boolean;
  /** Re-dock the bottom bar into the lower-left corner. */
  onDockBottombar?: () => void;
  /** Restore the factory layout: every bar shown, docked, and its drag
   *  position/config memory reset. */
  onResetLayout?: () => void;
  onAbout: () => void;
  onDocumentation: () => void;
  onSubmitIssue: () => void;
  onShowShortcuts: () => void;
}

const contentProps = { align: "start", sideOffset: 4, className: "flow-menu" } as const;

/**
 * Traditional desktop menu bar (File / View / Help). Radix supplies the
 * WAI-ARIA menubar behavior (roving focus, arrow keys, typeahead, submenu
 * flyout); every action is delegated to a callback owned by App.
 */
export function MenuBar(props: MenuBarProps) {
  return (
    <Menubar.Root className="flow-menubar" aria-label="Application menu">
      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">File</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onNew}>
              New
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onOpen}>
              Open…
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onSave}>
              Save…
            </Menubar.Item>
            <Menubar.Sub>
              <Menubar.SubTrigger className="flow-menu__item">
                Export
                <span className="flow-menu__chevron" aria-hidden="true">›</span>
              </Menubar.SubTrigger>
              <Menubar.Portal>
                <Menubar.SubContent className="flow-menu">
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("png")}>
                    PNG
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("svg")}>
                    SVG
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onExport("jpg")}>
                    JPG
                  </Menubar.Item>
                </Menubar.SubContent>
              </Menubar.Portal>
            </Menubar.Sub>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onProperties}>
              Properties…
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onPreferences}>
              Preferences…
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onClearCanvas}>
              Clear Canvas
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">Edit</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("duplicateSelection")}>
              Duplicate
              <span className="flow-menu__shortcut">⌘D</span>
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("deleteSelectedElements")}>
              Delete
              <span className="flow-menu__shortcut">⌫</span>
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("group")}>
              Group
              <span className="flow-menu__shortcut">⌘G</span>
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("ungroup")}>
              Ungroup
              <span className="flow-menu__shortcut">⇧⌘G</span>
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("bringToFront")}>
              Bring to Front
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("bringForward")}>
              Bring Forward
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("sendBackward")}>
              Send Backward
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("sendToBack")}>
              Send to Back
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Sub>
              <Menubar.SubTrigger className="flow-menu__item">
                Align
                <span className="flow-menu__chevron" aria-hidden="true">›</span>
              </Menubar.SubTrigger>
              <Menubar.Portal>
                <Menubar.SubContent className="flow-menu">
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignLeft")}>
                    Align Left
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignHorizontallyCentered")}>
                    Align Center
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignRight")}>
                    Align Right
                  </Menubar.Item>
                  <Menubar.Separator className="flow-menu__sep" />
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignTop")}>
                    Align Top
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignVerticallyCentered")}>
                    Align Middle
                  </Menubar.Item>
                  <Menubar.Item className="flow-menu__item" onSelect={() => props.onEditAction("alignBottom")}>
                    Align Bottom
                  </Menubar.Item>
                </Menubar.SubContent>
              </Menubar.Portal>
            </Menubar.Sub>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">View</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomIn}>
              Zoom In
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomOut}>
              Zoom Out
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onZoomToFit}>
              Zoom to Fit
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onResetZoom}>
              Reset Zoom
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onToggleGrid}>
              Toggle Grid
            </Menubar.Item>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isToolbarVisible ?? true}
              onCheckedChange={() => props.onToggleToolbar?.()}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">
                ✓
              </Menubar.ItemIndicator>
              Show Toolbar
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isQuickbarVisible ?? true}
              onCheckedChange={() => props.onToggleQuickbar?.()}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">
                ✓
              </Menubar.ItemIndicator>
              Show Quick Actions
            </Menubar.CheckboxItem>
            <Menubar.CheckboxItem
              className="flow-menu__item flow-menu__item--check"
              checked={props.isBottombarVisible ?? true}
              onCheckedChange={() => props.onToggleBottombar?.()}
            >
              <Menubar.ItemIndicator className="flow-menu__check" aria-hidden="true">
                ✓
              </Menubar.ItemIndicator>
              Show Bottom Bar
            </Menubar.CheckboxItem>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item
              className="flow-menu__item"
              disabled={!props.isToolbarFloating}
              onSelect={() => props.onDockToolbar?.()}
            >
              Dock Toolbar
            </Menubar.Item>
            <Menubar.Item
              className="flow-menu__item"
              disabled={!props.isQuickbarFloating}
              onSelect={() => props.onDockQuickbar?.()}
            >
              Dock Quick Actions
            </Menubar.Item>
            <Menubar.Item
              className="flow-menu__item"
              disabled={!props.isBottombarFloating}
              onSelect={() => props.onDockBottombar?.()}
            >
              Dock Bottom Bar
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={() => props.onResetLayout?.()}>
              Reset Layout
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>

      <Menubar.Menu>
        <Menubar.Trigger className="flow-menubar__trigger">Help</Menubar.Trigger>
        <Menubar.Portal>
          <Menubar.Content {...contentProps}>
            <Menubar.Item className="flow-menu__item" onSelect={props.onAbout}>
              About flow…
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onDocumentation}>
              Documentation
            </Menubar.Item>
            <Menubar.Item className="flow-menu__item" onSelect={props.onSubmitIssue}>
              Submit an issue
            </Menubar.Item>
            <Menubar.Separator className="flow-menu__sep" />
            <Menubar.Item className="flow-menu__item" onSelect={props.onShowShortcuts}>
              Keyboard Shortcuts
            </Menubar.Item>
          </Menubar.Content>
        </Menubar.Portal>
      </Menubar.Menu>
    </Menubar.Root>
  );
}
