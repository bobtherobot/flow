import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutDialog } from "./AboutDialog";
import { FLOW_REPO_URL, EXCALIDRAW_URL } from "../lib/links";
import { APP_VERSION } from "../lib/app-version";

describe("AboutDialog", () => {
  it("names the app and explains the fork", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByText(/forked/i)).toBeInTheDocument();
  });

  it("shows the app version", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    expect(screen.getByText(new RegExp(`version ${APP_VERSION}`, "i"))).toBeInTheDocument();
  });

  it("links to the flow repo and the upstream Excalidraw project safely", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    const flowLink = screen.getByRole("link", { name: /flow repository/i });
    const excalidrawLink = screen.getByRole("link", { name: /^excalidraw$/i });
    expect(flowLink).toHaveAttribute("href", FLOW_REPO_URL);
    expect(excalidrawLink).toHaveAttribute("href", EXCALIDRAW_URL);
    expect(EXCALIDRAW_URL).toBe("https://github.com/excalidraw/excalidraw");
    for (const link of [flowLink, excalidrawLink]) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("closes on the Close button", async () => {
    const onClose = vi.fn();
    render(<AboutDialog appName="Flow" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
