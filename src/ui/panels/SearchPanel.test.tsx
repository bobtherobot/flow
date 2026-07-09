import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Stub the search lib (it imports the real package, which throws in jsdom).
const { findMatches, applyMatches, clearMatches, scrollToMatch } = vi.hoisted(() => ({
  findMatches: vi.fn(),
  applyMatches: vi.fn(),
  clearMatches: vi.fn(),
  scrollToMatch: vi.fn(),
}));
vi.mock("../../lib/search-matches", () => ({ findMatches, applyMatches, clearMatches, scrollToMatch }));

import { SearchPanel } from "./SearchPanel";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

const api = {} as ExcalidrawAPI;

const match = (id: string, text: string) => ({
  id,
  index: 0,
  preview: { indexInSearchQuery: 0, previewText: text, moreBefore: false, moreAfter: false },
  matchedLines: [{ offsetX: 0, offsetY: 0, width: 1, height: 1 }],
});

beforeEach(() => {
  findMatches.mockReset();
  applyMatches.mockReset();
  clearMatches.mockReset();
  scrollToMatch.mockReset();
});

describe("SearchPanel", () => {
  it("searches on input and lists matches with a count", async () => {
    const user = userEvent.setup();
    findMatches.mockReturnValue([match("a", "foo"), match("b", "food")]);
    render(<SearchPanel api={api} signal={{ query: "", nonce: 0 }} />);

    await user.type(screen.getByLabelText("Search canvas text"), "foo");
    expect(findMatches).toHaveBeenCalledWith(api, "foo");
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    // applyMatches highlighted the first match (focus index 0).
    expect(applyMatches).toHaveBeenLastCalledWith(api, expect.any(Array), 0);
  });

  it("shows 'No matches' when empty", async () => {
    const user = userEvent.setup();
    findMatches.mockReturnValue([]);
    render(<SearchPanel api={api} signal={{ query: "", nonce: 0 }} />);
    await user.type(screen.getByLabelText("Search canvas text"), "zzz");
    expect(screen.getByText("No matches")).toBeInTheDocument();
  });

  it("next/prev navigation wraps and re-highlights", async () => {
    const user = userEvent.setup();
    findMatches.mockReturnValue([match("a", "foo"), match("b", "food")]);
    render(<SearchPanel api={api} signal={{ query: "", nonce: 0 }} />);
    await user.type(screen.getByLabelText("Search canvas text"), "foo");

    await user.click(screen.getByLabelText("Next match"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
    // wrap forward from last → first
    await user.click(screen.getByLabelText("Next match"));
    expect(screen.getByText("1 / 2")).toBeInTheDocument();
    // wrap backward from first → last
    await user.click(screen.getByLabelText("Previous match"));
    expect(screen.getByText("2 / 2")).toBeInTheDocument();
  });

  it("adopts and runs a query pushed from the bottom bar (signal nonce)", () => {
    findMatches.mockReturnValue([match("a", "widget")]);
    const { rerender } = render(<SearchPanel api={api} signal={{ query: "", nonce: 0 }} />);
    rerender(<SearchPanel api={api} signal={{ query: "widget", nonce: 1 }} />);
    expect(findMatches).toHaveBeenCalledWith(api, "widget");
    expect(screen.getByDisplayValue("widget")).toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("clears highlights on unmount", () => {
    findMatches.mockReturnValue([]);
    const { unmount } = render(<SearchPanel api={api} signal={{ query: "", nonce: 0 }} />);
    unmount();
    expect(clearMatches).toHaveBeenCalledWith(api);
  });
});
