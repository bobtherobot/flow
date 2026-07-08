import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MenuBar } from "./MenuBar";

const noop = () => {};
const props = {
  onNew: noop, onOpen: noop, onSave: noop, onExport: noop, onPreferences: noop,
  onClearCanvas: noop, onZoomIn: noop, onZoomOut: noop, onZoomToFit: noop,
  onResetZoom: noop, onToggleGrid: noop, onAbout: noop, onEditAction: noop,
  onDocumentation: noop, onSubmitIssue: noop, onShowShortcuts: noop,
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
});
