import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToolRail } from "./ToolRail";
import { ALL_TOOLS, TOOLS, SHAPES } from "./tools";
import { TOOL_RAIL_WIDTH } from "./rail-layout";
import {
  DEFAULT_TOOLBAR_STATE,
  DEFAULT_SHAPEBAR_STATE,
  type ToolbarState,
} from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(type = "selection", locked = false, currentItemArrowType = "sharp") {
  return {
    // Task 16's RailColorControl derives its own selection-style bridge from
    // this same api (useSelectionStyle), so the fake needs the scene/appState
    // reads that hook makes, not just the tool-activation surface above.
    getSceneElements: () => [],
    getAppState: () => ({
      activeTool: { type, locked },
      currentItemArrowType,
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      selectedElementIds: {},
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

function renderRail(
  state = DEFAULT_TOOLBAR_STATE,
  api = fakeApi(),
  onChange: (next: ToolbarState) => void = () => {},
  tools = ALL_TOOLS,
) {
  return render(
    <ToolRail
      api={api}
      tools={tools}
      width={TOOL_RAIL_WIDTH}
      columns={1}
      label="Tools"
      noun="toolbar"
      dockLeft={0}
      state={state}
      onChange={onChange}
    />,
  );
}

describe("ToolRail", () => {
  it("renders nothing when not visible", () => {
    renderRail({ ...DEFAULT_TOOLBAR_STATE, visible: false });
    expect(screen.queryByRole("toolbar", { name: "Tools" })).toBeNull();
  });

  it("renders a button for every visible tool", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "Rectangle" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep tool active" })).toBeNull();
  });

  it("omits a hidden tool", () => {
    renderRail({ ...DEFAULT_TOOLBAR_STATE, hiddenTools: ["frame"] });
    expect(screen.queryByRole("button", { name: "Frame" })).toBeNull();
  });

  it("dispatches setActiveTool when a tool is clicked", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderRail(DEFAULT_TOOLBAR_STATE, api);
    await user.click(screen.getByRole("button", { name: "Diamond" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "diamond" });
  });

  it("renders the three arrow-shape tools", () => {
    renderRail();
    expect(screen.getByRole("button", { name: "Arrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Curved arrow" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Elbow arrow" })).toBeInTheDocument();
  });

  it("selecting the curved arrow sets the round default and activates the arrow tool", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    renderRail(DEFAULT_TOOLBAR_STATE, api);
    await user.click(screen.getByRole("button", { name: "Curved arrow" }));
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: { currentItemArrowType: "round" },
    });
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "arrow" });
  });

  it("highlights only the arrow variant matching the current shape", () => {
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi("arrow", false, "elbow"));
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
    renderRail(DEFAULT_TOOLBAR_STATE, api);
    await user.click(screen.getByRole("button", { name: "Laser pointer" }));
    expect(api.setActiveTool).toHaveBeenCalledWith({ type: "laser" });
  });

  it("marks the active tool as pressed", () => {
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi("ellipse"));
    expect(screen.getByRole("button", { name: "Ellipse" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the laser tool as pressed when active", () => {
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi("laser"));
    expect(screen.getByRole("button", { name: "Laser pointer" })).toHaveAttribute("aria-pressed", "true");
  });

  it("hides the rail via the hamburger's Hide toolbar item", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi(), onChange);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    await user.click(screen.getByRole("menuitem", { name: "Hide toolbar" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("opens the config menu from the hamburger", async () => {
    const user = userEvent.setup();
    renderRail();
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    expect(screen.getByRole("menuitem", { name: "Detach toolbar" })).toBeInTheDocument();
  });

  it("detaches below the main menu so the drag grip stays reachable", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // Docked default has y:0; detaching from (0,0) must not leave the rail (and
    // its grip) under the 36px menu bar.
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi(), onChange);
    await user.click(screen.getByRole("button", { name: "Toolbar options" }));
    await user.click(screen.getByRole("menuitem", { name: "Detach toolbar" }));
    const next = onChange.mock.calls[0][0];
    expect(next.floating).toBe(true);
    expect(next.y).toBeGreaterThanOrEqual(36);
  });

  it("renders only the tools it is handed", () => {
    renderRail(DEFAULT_TOOLBAR_STATE, fakeApi(), () => {}, TOOLS);
    expect(screen.getByRole("button", { name: "Laser pointer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rectangle" })).toBeNull();
  });

  it("labels its hamburger and menu from the noun", () => {
    render(
      <ToolRail
        api={fakeApi()}
        tools={SHAPES}
        width={80}
        columns={2}
        label="Shapes"
        noun="shapebar"
        dockLeft={44}
        state={DEFAULT_SHAPEBAR_STATE}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("toolbar", { name: "Shapes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Shapebar options" })).toBeInTheDocument();
  });

  it("renders a footer only when given one", () => {
    const { container } = renderRail();
    expect(container.querySelector(".flow-toolbar__color")).toBeNull();
  });
});
