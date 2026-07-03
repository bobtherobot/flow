import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SaveDialog } from "./SaveDialog";

function setup(overrides: Partial<Parameters<typeof SaveDialog>[0]> = {}) {
  const props = {
    isGoogleConnected: false,
    onConnectGoogle: vi.fn(),
    onCancel: vi.fn(),
    onSave: vi.fn(),
    ...overrides,
  };
  render(<SaveDialog {...props} />);
  return props;
}

describe("SaveDialog", () => {
  it("defaults to 'Store internally' and shows the data-loss disclaimer", () => {
    setup();
    expect(screen.getByRole("radio", { name: /store internally/i })).toBeChecked();
    expect(screen.getByText(/clearing your browser data/i)).toBeInTheDocument();
  });

  it("shows a Connect button on Google Drive when not connected", () => {
    setup({ isGoogleConnected: false });
    expect(screen.getByRole("button", { name: /connect/i })).toBeInTheDocument();
  });

  it("hides the Connect button once connected", () => {
    setup({ isGoogleConnected: true });
    expect(screen.queryByRole("button", { name: /connect/i })).not.toBeInTheDocument();
  });

  it("calls onConnectGoogle when Connect is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: /connect/i }));
    expect(props.onConnectGoogle).toHaveBeenCalledOnce();
  });

  it("saves with the typed name and chosen destination", async () => {
    const props = setup({ initialName: "" });
    await userEvent.type(screen.getByLabelText(/name/i), "flowchart");
    await userEvent.click(screen.getByRole("radio", { name: /download/i }));
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(props.onSave).toHaveBeenCalledWith({ name: "flowchart", destination: "download" });
  });

  it("disables Save when the name is empty", async () => {
    setup({ initialName: "   " });
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
