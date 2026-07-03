import { MainMenu } from "@excalidraw/excalidraw";

export type ImageFormat = "png" | "svg" | "jpg";

export interface CustomMenuProps {
  onOpen: () => void;
  onSave: () => void;
  onExport: (format: ImageFormat) => void;
}

/**
 * Replaces Excalidraw's default menu with Wimp's file operations. Open/Save
 * route through the storage dialogs; Export writes an image straight to disk.
 */
export function CustomMenu({ onOpen, onSave, onExport }: CustomMenuProps) {
  return (
    <MainMenu>
      <MainMenu.Item onSelect={onOpen}>Open…</MainMenu.Item>
      <MainMenu.Item onSelect={onSave}>Save…</MainMenu.Item>
      <MainMenu.Separator />
      <MainMenu.Group title="Export image">
        <MainMenu.Item onSelect={() => onExport("png")}>PNG</MainMenu.Item>
        <MainMenu.Item onSelect={() => onExport("svg")}>SVG</MainMenu.Item>
        <MainMenu.Item onSelect={() => onExport("jpg")}>JPG</MainMenu.Item>
      </MainMenu.Group>
      <MainMenu.Separator />
      <MainMenu.DefaultItems.ToggleTheme />
      <MainMenu.DefaultItems.ClearCanvas />
    </MainMenu>
  );
}
