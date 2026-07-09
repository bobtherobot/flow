import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolBar } from "./ToolBar";
import { DEFAULT_TOOLBAR_STATE } from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(type = "selection", locked = false, currentItemArrowType = "sharp") {
  return {
    getAppState: () => ({ activeTool: { type, locked }, currentItemArrowType }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

describe("ToolBar", () => {
  it("renders nothing when not visible", () => {
    render(
      <ToolBar api={fakeApi()} state={{ ...DEFAULT_TOOLBAR_STATE, visible: false }} onChange={() => {}} />,
    );
    expect(screen.queryByRole("toolbar", { name: "Tools" })).toBeNull();
  });

  it("renders a button for every visible tool plus lock", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep tool active" })).toBeInTheDocument();
  });

  it("omits a hidden tool", () => {
    render(
      <ToolBar api={fakeApi()} state={{ ...DEFAULT_TOOLBAR_STATE, hiddenTools: ["frame"] }} onChange={() => {}} />,
    );
    expect(screen.queryByRole("button", { name: "Frame" })).toBeNull();
  });

  it("dispatches setActiveTool when a tool is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ToolBar api={api} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Diamond" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("renders the three arrow-shape tools", () => {
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Arrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Curved arrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elbow arrow" })).toBeInTheDocument();
  });

  it("selecting the curved arrow sets the round default and activates the arrow tool", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ToolBar api={api} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Curved arrow" }));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "round" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow" });
  });

  it("highlights only the arrow variant matching the current shape", () => {
    render(
      <ToolBar api={fakeApi("arrow", false, "elbow")} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Elbow arrow" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Arrow" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Curved arrow" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("dispatches setActiveTool when the laser tool is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ToolBar api={api} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Laser pointer" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "laser" });
  });

  it("marks the active tool as pressed", () => {
    render(<ToolBar api={fakeApi("ellipse")} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Ellipse" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the laser tool as pressed when active", () => {
    render(<ToolBar api={fakeApi("laser")} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Laser pointer" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the rail via the hamburger's Hide toolbar item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    await user.click(screen.getByRole("menuitem", { name: "Hide toolbar" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("opens the config menu from the hamburger", async () => {
    const user = userEvent.setup();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
  });

  it("detaches below the main menu so the drag grip stays reachable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Docked default has y:0; detaching from (0,0) must not leave the rail (and
    // its grip) under the 36px menu bar.
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    await user.click(screen.getByRole("menuitem", { name: "Detach toolbar" }));
    const next = onChange.mock.calls[0][0];
    expect(next.floating).toBe(true);
    expect(next.y).toBeGreaterThanOrEqual(36);
  });
});
