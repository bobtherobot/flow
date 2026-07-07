import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AboutDialog, WIMP_REPO_URL, EXCALIDRAW_FORK_URL } from "./AboutDialog";

describe("AboutDialog", () => {
  it("names the app and explains the fork", () => {
    render(<AboutDialog appName="Wimp" onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: /about wimp/i })).toBeInTheDocument();
    expect(screen.getByText(/forked/i)).toBeInTheDocument();
  });

  it("links to both repos safely", () => {
    render(<AboutDialog appName="Wimp" onClose={() => {}} />);
    const wimpLink = screen.getByRole("link", { name: /wimp repository/i });
    const forkLink = screen.getByRole("link", { name: /excalidraw fork/i });
    expect(wimpLink).toHaveAttribute("href", WIMP_REPO_URL);
    expect(forkLink).toHaveAttribute("href", EXCALIDRAW_FORK_URL);
    for (const link of [wimpLink, forkLink]) {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("closes on the Close button", async () => {
    const onClose = vi.fn();
    render(<AboutDialog appName="Wimp" onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
