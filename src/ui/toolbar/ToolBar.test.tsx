import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolBar } from "./ToolBar";
import { DEFAULT_TOOLBAR_STATE } from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(type = "selection", locked = false) {
  return {
    getAppState: () => ({ activeTool: { type, locked } }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
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

  it("hides the rail via onChange when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Close toolbar" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("opens the config menu from the hamburger", async () => {
    const user = userEvent.setup();
    render(<ToolBar api={fakeApi()} state={DEFAULT_TOOLBAR_STATE} onChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
  });
});
