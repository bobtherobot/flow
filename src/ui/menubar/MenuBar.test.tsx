import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuBar } from "./MenuBar";
import type { MenuBarProps } from "./MenuBar";

const noop = () => {};

/** Fake api is a partial stand-in for ExcalidrawAPI; cast at this single
 *  boundary (mirrors the pattern in useViewToggles.test.ts). */
function fakeApi(state: Record<string, unknown> = {}): NonNullable<MenuBarProps["api"]> {
  return {
    onChange: () => () => {},
    getAppState: () => ({
      gridModeEnabled: false,
      objectsSnapModeEnabled: true,
      zenModeEnabled: false,
      activeTool: { type: "selection", locked: false },
      ...state,
    }),
    executeAction: vi.fn(),
    setActiveTool: vi.fn(),
  } as unknown as NonNullable<MenuBarProps["api"]>;
}

const props = {
  onNew: noop, onOpen: noop, onSave: noop, onExport: noop, onPreferences: noop,
  onClearCanvas: noop, onProperties: noop,
  onZoomIn: noop, onZoomOut: noop, onZoomToFit: noop,
  onResetZoom: noop, onAbout: noop, onEditAction: noop,
  onDocumentation: noop, onSubmitIssue: noop, onShowShortcuts: noop,
  isToolbarVisible: true, onToggleToolbar: noop,
  api: fakeApi(),
  isArrowBindingOn: false,
  onToggleArrowBinding: noop,
};

describe("MenuBar", () => {
  it("renders File, Edit, View, and Help triggers", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menuitem", { name: "File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Help" })).toBeInTheDocument();
  });

  it("exposes an accessible menubar", () => {
    render(<MenuBar {...props} />);
    expect(screen.getByRole("menubar", { name: "Application menu" })).toBeInTheDocument();
  });

  it("Help menu lists About, Documentation, Submit an issue, and Keyboard Shortcuts", async () => {
    const user = userEvent.setup();
    render(<MenuBar {...props} />);
    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    expect(await screen.findByRole("menuitem", { name: "About flow…" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Submit an issue" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
  });

  it("fires Help link callbacks when items are selected", async () => {
    const user = userEvent.setup();
    const onDocumentation = vi.fn();
    const onSubmitIssue = vi.fn();
    const onShowShortcuts = vi.fn();
    render(
      <MenuBar
        {...props}
        onDocumentation={onDocumentation}
        onSubmitIssue={onSubmitIssue}
        onShowShortcuts={onShowShortcuts}
      />,
    );

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(await screen.findByRole("menuitem", { name: "Documentation" }));
    expect(onDocumentation).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(await screen.findByRole("menuitem", { name: "Submit an issue" }));
    expect(onSubmitIssue).toHaveBeenCalledOnce();

    await user.click(screen.getByRole("menuitem", { name: "Help" }));
    await user.click(await screen.findByRole("menuitem", { name: "Keyboard Shortcuts" }));
    expect(onShowShortcuts).toHaveBeenCalledOnce();
  });

  it("toggles the toolbar from the View menu", async () => {
    const user = userEvent.setup();
    const onToggleToolbar = vi.fn();
    render(<MenuBar {...props} isToolbarVisible onToggleToolbar={onToggleToolbar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const item = await screen.findByRole("menuitemcheckbox", { name: "Show Toolbar" });
    expect(item).toBeInTheDocument();
    await user.click(item);
    expect(onToggleToolbar).toHaveBeenCalledOnce();
  });

  it("opens Properties from the File menu", async () => {
    const user = userEvent.setup();
    const onProperties = vi.fn();
    render(<MenuBar {...props} onProperties={onProperties} />);
    await user.click(screen.getByRole("menuitem", { name: "File" }));
    await user.click(await screen.findByRole("menuitem", { name: "Properties…" }));
    expect(onProperties).toHaveBeenCalledOnce();
  });

  it("toggles the bottom bar from the View menu", async () => {
    const user = userEvent.setup();
    const onToggleBottombar = vi.fn();
    render(<MenuBar {...props} isBottombarVisible onToggleBottombar={onToggleBottombar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const item = await screen.findByRole("menuitemcheckbox", { name: "Show Bottom Bar" });
    expect(item).toBeInTheDocument();
    await user.click(item);
    expect(onToggleBottombar).toHaveBeenCalledOnce();
  });

  it("docks a floating bar from the View menu", async () => {
    const user = userEvent.setup();
    const onDockToolbar = vi.fn();
    render(<MenuBar {...props} isToolbarFloating onDockToolbar={onDockToolbar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitem", { name: "Dock Toolbar" }));
    expect(onDockToolbar).toHaveBeenCalledOnce();
  });

  it("disables the Dock item when the bar is already docked", async () => {
    const user = userEvent.setup();
    const onDockToolbar = vi.fn();
    render(<MenuBar {...props} isToolbarFloating={false} onDockToolbar={onDockToolbar} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    const item = await screen.findByRole("menuitem", { name: "Dock Toolbar" });
    expect(item).toHaveAttribute("data-disabled");
    await user.click(item);
    expect(onDockToolbar).not.toHaveBeenCalled();
  });

  it("resets the layout from the View menu", async () => {
    const user = userEvent.setup();
    const onResetLayout = vi.fn();
    render(<MenuBar {...props} onResetLayout={onResetLayout} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reset Layout" }));
    expect(onResetLayout).toHaveBeenCalledOnce();
  });

  it("shows the five canvas toggles in the View menu", async () => {
    const user = userEvent.setup();
    render(<MenuBar {...props} api={fakeApi()} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    for (const name of ["Grid", "Snap to Objects", "Arrow Binding", "Tool Lock", "Zen Mode"]) {
      expect(await screen.findByRole("menuitemcheckbox", { name })).toBeInTheDocument();
    }
  });

  it("reflects live checked state from appState", async () => {
    const user = userEvent.setup();
    render(<MenuBar {...props} api={fakeApi({ gridModeEnabled: false, objectsSnapModeEnabled: true })} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    expect(await screen.findByRole("menuitemcheckbox", { name: "Snap to Objects" })).toBeChecked();
    expect(screen.getByRole("menuitemcheckbox", { name: "Grid" })).not.toBeChecked();
  });

  it("dispatches gridMode when Grid is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MenuBar {...props} api={api} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Grid" }));
    expect(api.executeAction).toHaveBeenCalledWith("gridMode");
  });

  it("dispatches objectsSnapMode when Snap to Objects is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MenuBar {...props} api={api} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Snap to Objects" }));
    expect(api.executeAction).toHaveBeenCalledWith("objectsSnapMode");
  });

  it("dispatches zenMode when Zen Mode is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<MenuBar {...props} api={api} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Zen Mode" }));
    expect(api.executeAction).toHaveBeenCalledWith("zenMode");
  });

  it("flips the tool lock via setActiveTool when Tool Lock is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi({ activeTool: { type: "selection", locked: false } });
    render(<MenuBar {...props} api={api} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Tool Lock" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "selection", locked: true });
  });

  it("fires onToggleArrowBinding when Arrow Binding is clicked", async () => {
    const user = userEvent.setup();
    const onToggleArrowBinding = vi.fn();
    render(<MenuBar {...props} api={fakeApi()} onToggleArrowBinding={onToggleArrowBinding} />);
    await user.click(screen.getByRole("menuitem", { name: "View" }));
    await user.click(await screen.findByRole("menuitemcheckbox", { name: "Arrow Binding" }));
    expect(onToggleArrowBinding).toHaveBeenCalledOnce();
  });
});
