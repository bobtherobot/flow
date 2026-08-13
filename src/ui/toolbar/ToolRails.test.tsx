import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ToolRails } from "./ToolRails";
import { DEFAULT_TOOLBAR_STATE, DEFAULT_SHAPEBAR_STATE } from "./toolbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi() {
  return {
    getSceneElements: () => [],
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      currentItemArrowType: "sharp",
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

function renderRails(
  toolbar = DEFAULT_TOOLBAR_STATE,
  shapebar = DEFAULT_SHAPEBAR_STATE,
) {
  return render(
    <ToolRails
      api={fakeApi()}
      toolbar={toolbar}
      onToolbarChange={() => {}}
      shapebar={shapebar}
      onShapebarChange={() => {}}
    />,
  );
}

describe("ToolRails", () => {
  it("mounts the toolbar", () => {
    renderRails();
    expect(screen.getByRole("toolbar", { name: "Tools" })).toBeInTheDocument();
  });

  it("gives the toolbar the color control", () => {
    const { container } = renderRails();
    expect(container.querySelector(".flow-toolbar__color")).toBeInTheDocument();
  });

  it("reserves the gutter for the docked rails", () => {
    renderRails(DEFAULT_TOOLBAR_STATE, { ...DEFAULT_SHAPEBAR_STATE, visible: false });
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("44px");
  });

  it("reserves nothing when the toolbar is floating", () => {
    renderRails(
      { ...DEFAULT_TOOLBAR_STATE, floating: true },
      { ...DEFAULT_SHAPEBAR_STATE, visible: false },
    );
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("0px");
  });

  it("puts the color control inside the content box, after the tool grid", () => {
    // Asserting only that the radiogroup exists would pass even if it were
    // mounted above the tool grid, or outside the content box where a docked
    // rail's stretch would shove it to the foot.
    const { container } = renderRails();
    const content = container.querySelector(".flow-toolbar__content")!;
    const tools = content.querySelector(".flow-toolbar__tools")!;
    const color = content.querySelector(".flow-toolbar__color");
    expect(color).toBeInTheDocument();
    expect(tools.compareDocumentPosition(color!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("two rails", () => {
  it("mounts the shapebar with the shape tools and no color control", () => {
    renderRails();
    const shapes = screen.getByRole("toolbar", { name: "Shapes" });
    expect(shapes.querySelector(".flow-toolbar__color")).toBeNull();
    expect(
      screen.getByRole("toolbar", { name: "Shapes" }).querySelector(".flow-toolbar__tools"),
    ).toBeInTheDocument();
  });

  it("keeps the shape tools out of the toolbar", () => {
    renderRails();
    const tools = screen.getByRole("toolbar", { name: "Tools" });
    expect(tools.textContent).not.toContain("Rectangle");
  });

  it("reserves both widths when both are docked", () => {
    renderRails();
    expect(document.documentElement.style.getPropertyValue("--flow-toolbar-reserved"))
      .toBe("124px");
  });

  it("docks the shapebar clear of the toolbar", () => {
    const { container } = renderRails();
    const shapes = container.querySelectorAll<HTMLElement>(".flow-toolbar")[1];
    expect(shapes.style.left).toBe("44px");
  });

  it("slides the shapebar to the edge when the toolbar is hidden", () => {
    const { container } = renderRails({ ...DEFAULT_TOOLBAR_STATE, visible: false });
    const shapes = container.querySelector<HTMLElement>(".flow-toolbar")!;
    expect(shapes.style.left).toBe("0px");
  });
});
