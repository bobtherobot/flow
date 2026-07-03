import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OpenDialog } from "./OpenDialog";
import type { DocumentSummary } from "../storage/types";

const docs: DocumentSummary[] = [
  { id: "a", name: "flowchart", createdAt: 1, updatedAt: 1_700_000_000_000 },
  { id: "b", name: "wireframe", createdAt: 1, updatedAt: 1_700_000_000_000 },
];

function setup(overrides: Partial<Parameters<typeof OpenDialog>[0]> = {}) {
  const props = {
    isGoogleConnected: false,
    internalDocs: docs,
    onConnectGoogle: vi.fn(),
    onCancel: vi.fn(),
    onOpenInternal: vi.fn(),
    onOpenLocal: vi.fn(),
    onOpenGoogle: vi.fn(),
    ...overrides,
  };
  render(<OpenDialog {...props} />);
  return props;
}

describe("OpenDialog", () => {
  it("defaults to internal storage and lists stored drawings", () => {
    setup();
    expect(screen.getByRole("radio", { name: /internally stored/i })).toBeChecked();
    expect(screen.getByText("flowchart")).toBeInTheDocument();
    expect(screen.getByText("wireframe")).toBeInTheDocument();
  });

  it("opens an internal drawing when its list item is clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByText("wireframe"));
    expect(props.onOpenInternal).toHaveBeenCalledWith("b");
  });

  it("shows an empty state when there are no internal drawings", () => {
    setup({ internalDocs: [] });
    expect(screen.getByText(/no internally-stored drawings/i)).toBeInTheDocument();
  });

  it("triggers local open when Local system is chosen and Open clicked", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("radio", { name: /local system/i }));
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    expect(props.onOpenLocal).toHaveBeenCalledOnce();
  });

  it("triggers google open when Google Drive is chosen and Open clicked", async () => {
    const props = setup({ isGoogleConnected: true });
    await userEvent.click(screen.getByRole("radio", { name: /google drive/i }));
    await userEvent.click(screen.getByRole("button", { name: /^open$/i }));
    expect(props.onOpenGoogle).toHaveBeenCalledOnce();
  });
});
