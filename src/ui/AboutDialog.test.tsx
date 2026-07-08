import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutDialog } from "./AboutDialog";
import { FLOW_REPO_URL, EXCALIDRAW_FORK_URL } from "../lib/links";

describe("AboutDialog", () => {
  it("names the app and explains the fork", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /about flow/i })).toBeInTheDocument();
    expect(screen.getByText(/forked/i)).toBeInTheDocument();
  });

  it("links to both repos safely", () => {
    render(<AboutDialog appName="Flow" onClose={() => {}} />);
    const flowLink = screen.getByRole("link", { name: /flow repository/i });
    const forkLink = screen.getByRole("link", { name: /excalidraw fork/i });
    expect(flowLink).toHaveAttribute("href", FLOW_REPO_URL);
    expect(forkLink).toHaveAttribute("href", EXCALIDRAW_FORK_URL);
    for (const link of [flowLink, forkLink]) {
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
