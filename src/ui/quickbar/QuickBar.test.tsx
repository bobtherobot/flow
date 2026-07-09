import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickBar } from "./QuickBar";
import { DEFAULT_QUICKBAR_STATE } from "./quickbar-state";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

function fakeApi(appState: Record<string, unknown> = {}) {
  return {
    getAppState: () => ({
      activeTool: { type: "selection", locked: false },
      objectsSnapModeEnabled: false,
      zenModeEnabled: false,
      gridModeEnabled: false,
      ...appState,
    }),
    onChange: () => () => {},
    setActiveTool: vi.fn(),
    executeAction: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

const base = {
  bindingMode: "on" as const,
  onSetBindingMode: () => {},
};

describe("QuickBar", () => {
  it("renders nothing when not visible", () => {
    render(
      <QuickBar api={fakeApi()} state={{ ...DEFAULT_QUICKBAR_STATE, visible: false }} onChange={() => {}} {...base} />,
    );
    expect(screen.queryByRole("toolbar", { name: "Quick actions" })).toBeNull();
  });

  it("renders action + toggle buttons but hides tools by default", () => {
    render(<QuickBar api={fakeApi()} state={DEFAULT_QUICKBAR_STATE} onChange={() => {}} {...base} />);
    expect(screen.getByRole("button", { name: "Bring to front" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Snap to objects" })).toBeInTheDocument();
    // Tools are opt-in — hidden until the user adds them.
    expect(screen.queryByRole("button", { name: "Rectangle" })).toBeNull();
  });

  it("dispatches a z-order action via executeAction", async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<QuickBar api={api} state={DEFAULT_QUICKBAR_STATE} onChange={() => {}} {...base} />);
    await user.click(screen.getByRole("button", { name: "Bring to front" }));
    expect(api.executeAction).toHaveBeenCalledWith("bringToFront");
  });

  it("marks an active toggle as pressed (snap on)", () => {
    render(
      <QuickBar api={fakeApi({ objectsSnapModeEnabled: true })} state={DEFAULT_QUICKBAR_STATE} onChange={() => {}} {...base} />,
    );
    expect(screen.getByRole("button", { name: "Snap to objects" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows arrow binding as pressed when mode is on, flips it via callback", async () => {
    const user = userEvent.setup();
    const onSetBindingMode = vi.fn();
    render(
      <QuickBar api={fakeApi()} state={DEFAULT_QUICKBAR_STATE} onChange={() => {}} bindingMode="on" onSetBindingMode={onSetBindingMode} />,
    );
    const btn = screen.getByRole("button", { name: "Arrow binding" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    await user.click(btn);
    expect(onSetBindingMode).toHaveBeenCalledWith("off");
  });

  it("closes the bar via onChange when the close button is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuickBar api={fakeApi()} state={DEFAULT_QUICKBAR_STATE} onChange={onChange} {...base} />);
    await user.click(screen.getByRole("button", { name: "Close quick actions" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ visible: false }));
  });

  it("opens the config menu and can add a tool (un-hide)", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<QuickBar api={fakeApi()} state={DEFAULT_QUICKBAR_STATE} onChange={onChange} {...base} />);
    await user.click(screen.getByRole("button", { name: "Quick actions options" }));
    expect(screen.getByRole("menuitem", { name: "Detach quick actions" })).toBeInTheDocument();
    // The Rectangle tool is listed (checkbox, currently unchecked/hidden).
    const rectRow = screen.getByRole("checkbox", { name: "Rectangle" });
    expect(rectRow).not.toBeChecked();
    await user.click(rectRow);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ hiddenItems: expect.not.arrayContaining(["rectangle"]) }),
    );
  });
});
