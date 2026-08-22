/**
 * Zen mode hides every flow surface except the primary Tools rail.
 *
 * These live in one file rather than scattered across each bar's own suite
 * because they are one behaviour: "what survives zen". A regression that drops
 * a single component out of the set should read as one broken group, not as an
 * orphan failure in an unrelated file. (The rail side — the zen toggle, the
 * shapebar, the gutter — is covered in toolbar/ToolRails.test.tsx.)
 */
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MenuBar, type MenuBarProps } from "./menubar/MenuBar";
import { PanelsRoot } from "./panels/PanelsRoot";
import { QuickBar } from "./quickbar/QuickBar";
import { DEFAULT_QUICKBAR_STATE } from "./quickbar/quickbar-state";
import { BottomBar } from "./bottombar/BottomBar";
import { DEFAULT_BOTTOMBAR_STATE } from "./bottombar/bottombar-state";
import type { ExcalidrawAPI } from "../lib/excalidraw-scene";

function fakeApi(zenModeEnabled: boolean) {
  return {
    getSceneElements: () => [],
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      currentItemArrowType: "sharp",
      currentItemBackgroundColor: "transparent",
      currentItemStrokeColor: "#1e1e1e",
      currentItemTextColor: "#1e1e1e",
      selectedElementIds: {},
      gridModeEnabled: false,
      objectsSnapModeEnabled: true,
      viewBackgroundColor: "#ffffff",
      zoom: { value: 1 },
      zenModeEnabled,
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    updateScene: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

const noop = () => {};

const menuProps = {
  onNew: noop, onOpen: noop, onSave: noop, onExport: noop, onPreferences: noop,
  onClearCanvas: noop, onProperties: noop,
  onZoomIn: noop, onZoomOut: noop, onZoomToFit: noop,
  onResetZoom: noop, onAbout: noop, onEditAction: noop,
  onDocumentation: noop, onSubmitIssue: noop, onShowShortcuts: noop,
  isToolbarVisible: true, onToggleToolbar: noop,
  isArrowBindingOn: false, onToggleArrowBinding: noop,
};

const renderMenuBar = (zen: boolean) =>
  render(<MenuBar {...menuProps} api={fakeApi(zen) as MenuBarProps["api"]} />);

const renderPanels = (zen: boolean) =>
  render(
    <PanelsRoot api={fakeApi(zen)} units="px" search={{ query: "", nonce: 0 }} />,
  );

const renderQuickBar = (zen: boolean) =>
  render(
    <QuickBar
      api={fakeApi(zen)}
      state={DEFAULT_QUICKBAR_STATE}
      onChange={noop}
      bindingMode="on"
      onSetBindingMode={noop}
    />,
  );

const renderBottomBar = (zen: boolean) =>
  render(
    <BottomBar
      api={fakeApi(zen)}
      state={DEFAULT_BOTTOMBAR_STATE}
      onChange={noop}
      onSearch={noop}
      toolbarReserved={44}
    />,
  );

describe("zen mode hides flow's chrome", () => {
  it("hides the main menu bar", () => {
    const { container: shown } = renderMenuBar(false);
    expect(shown.querySelector('[role="menubar"]')).toBeInTheDocument();

    const { container: hidden } = renderMenuBar(true);
    expect(hidden.querySelector('[role="menubar"]')).toBeNull();
  });

  it("hides the controls dock", () => {
    const { container: shown } = renderPanels(false);
    expect(shown.querySelector(".flow-pnl")).toBeInTheDocument();

    const { container: hidden } = renderPanels(true);
    expect(hidden.querySelector(".flow-pnl")).toBeNull();
  });

  it("hides the quick-actions bar", () => {
    const { container: shown } = renderQuickBar(false);
    expect(shown.querySelector(".flow-quickbar")).toBeInTheDocument();

    const { container: hidden } = renderQuickBar(true);
    expect(hidden.querySelector(".flow-quickbar")).toBeNull();
  });

  it("hides the bottom bar", () => {
    const { container: shown } = renderBottomBar(false);
    expect(shown.querySelector(".flow-bottombar")).toBeInTheDocument();

    const { container: hidden } = renderBottomBar(true);
    expect(hidden.querySelector(".flow-bottombar")).toBeNull();
  });

  it("no longer offers zen from the bottom bar — the toggle moved to the rail", () => {
    const { container } = renderBottomBar(false);
    expect(container.querySelector('button[aria-label="Zen mode"]')).toBeNull();
  });

  it("collapses the menu-bar height so the canvas reclaims the top strip", () => {
    // The bar unmounting is not enough on its own: App insets <Excalidraw> by
    // --flow-menubar-h, so leaving it at 36px would strand an empty band where
    // the menu used to be.
    const { unmount } = renderMenuBar(true);
    expect(document.documentElement.style.getPropertyValue("--flow-menubar-h")).toBe("0px");
    unmount();
    expect(document.documentElement.style.getPropertyValue("--flow-menubar-h")).toBe("");
  });

  it("restores the menu-bar height on leaving zen", () => {
    renderMenuBar(false);
    expect(document.documentElement.style.getPropertyValue("--flow-menubar-h")).toBe("");
  });
});
