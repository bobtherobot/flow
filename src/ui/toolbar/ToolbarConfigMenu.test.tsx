import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolbarConfigMenu } from "./ToolbarConfigMenu";
import { ALL_TOOLS, SHAPES } from "./tools";

const base = {
  floating: false,
  noun: "toolbar",
  tools: ALL_TOOLS,
  hiddenTools: [] as string[],
  anchor: { top: 40, left: 60 },
  onToggleFloating: () => {},
  onToggleTool: () => {},
  onHide: () => {},
};

describe("ToolbarConfigMenu", () => {
  it("shows 'Detach toolbar' when docked and 'Dock toolbar' when floating", () => {
    const { rerender } = render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
    rerender(<ToolbarConfigMenu {...base} floating />);
    expect(screen.getByRole("menuitem", { name: "Dock toolbar" })).toBeInTheDocument();
  });

  it("renders a checked row per visible tool", () => {
    render(<ToolbarConfigMenu {...base} />);
    expect(screen.getByRole("checkbox", { name: "Rectangle" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Lock" })).toBeNull();
  });

  it("unchecks a hidden tool", () => {
    render(<ToolbarConfigMenu {...base} hiddenTools={["frame"]} />);
    expect(screen.getByRole("checkbox", { name: "Frame" })).not.toBeChecked();
  });

  it("calls onToggleTool with the id when a row is toggled", async () => {
    const user = userEvent.setup();
    const onToggleTool = vi.fn();
    render(<ToolbarConfigMenu {...base} onToggleTool={onToggleTool} />);
    await user.click(screen.getByRole("checkbox", { name: "Frame" }));
    expect(onToggleTool).toHaveBeenCalledWith("frame");
  });

  it("calls onToggleFloating when the dock action is clicked", async () => {
    const user = userEvent.setup();
    const onToggleFloating = vi.fn();
    render(<ToolbarConfigMenu {...base} onToggleFloating={onToggleFloating} />);
    await user.click(screen.getByRole("menuitem", { name: "Detach toolbar" }));
    expect(onToggleFloating).toHaveBeenCalledOnce();
  });

  it("calls onHide when the Hide toolbar action is clicked", async () => {
    const user = userEvent.setup();
    const onHide = vi.fn();
    render(<ToolbarConfigMenu {...base} onHide={onHide} />);
    await user.click(screen.getByRole("menuitem", { name: "Hide toolbar" }));
    expect(onHide).toHaveBeenCalledOnce();
  });

  it("lists one checkbox per tool it is given, named from the noun", () => {
    render(
      <ToolbarConfigMenu
        floating={false}
        noun="shapebar"
        tools={SHAPES}
        hiddenTools={[]}
        anchor={{ top: 0, left: 0 }}
        onToggleFloating={() => {}}
        onToggleTool={() => {}}
        onHide={() => {}}
      />,
    );
    expect(screen.getByRole("menuitem", { name: "Detach shapebar" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Hide shapebar" })).toBeInTheDocument();
    expect(screen.getByLabelText("Diamond")).toBeInTheDocument();
    expect(screen.queryByLabelText("Laser pointer")).toBeNull();
  });
});
