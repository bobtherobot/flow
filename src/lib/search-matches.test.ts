import { describe, it, expect, vi, beforeEach } from "vitest";

// The real package runs DOM/canvas code that throws in jsdom, so stub the one
// export the wrapper uses. `vi.hoisted` lets the hoisted mock factory reference
// the fn. Return value is set per-test.
const { getSearchMatches } = vi.hoisted(() => ({ getSearchMatches: vi.fn() }));
vi.mock("@excalidraw/excalidraw", () => ({ getSearchMatches }));

import { applyMatches, clearMatches, findMatches, scrollToMatch } from "./search-matches";
import type { ExcalidrawAPI } from "./excalidraw-scene";
import type { SearchResult } from "./search-matches";

function fakeApi(elements: { id: string }[] = []) {
  return {
    getSceneElements: () => elements,
    updateScene: vi.fn(),
    scrollToContent: vi.fn(),
  } as unknown as ExcalidrawAPI;
}

const result = (id: string): SearchResult => ({
  id,
  index: 0,
  preview: { indexInSearchQuery: 0, previewText: "x", moreBefore: false, moreAfter: false },
  matchedLines: [{ offsetX: 1, offsetY: 2, width: 3, height: 4 }],
});

beforeEach(() => {
  getSearchMatches.mockReset();
});

describe("findMatches", () => {
  it("trims the query before searching", () => {
    getSearchMatches.mockReturnValue([]);
    const api = fakeApi([{ id: "a" }]);
    findMatches(api, "  hello  ");
    expect(getSearchMatches).toHaveBeenCalledWith("hello", [{ id: "a" }]);
  });
});

describe("applyMatches", () => {
  it("maps results to searchMatches and marks the focused one", () => {
    const api = fakeApi();
    applyMatches(api, [result("a"), result("b")], 1);
    expect(api.updateScene).toHaveBeenCalledWith({
      appState: {
        searchMatches: [
          { id: "a", focus: false, matchedLines: [{ offsetX: 1, offsetY: 2, width: 3, height: 4 }] },
          { id: "b", focus: true, matchedLines: [{ offsetX: 1, offsetY: 2, width: 3, height: 4 }] },
        ],
      },
    });
  });
});

describe("clearMatches", () => {
  it("empties the canvas searchMatches", () => {
    const api = fakeApi();
    clearMatches(api);
    expect(api.updateScene).toHaveBeenCalledWith({ appState: { searchMatches: [] } });
  });
});

describe("scrollToMatch", () => {
  it("scrolls to the element with the match id", () => {
    const el = { id: "b" };
    const api = fakeApi([{ id: "a" }, el]);
    scrollToMatch(api, result("b"));
    expect(api.scrollToContent).toHaveBeenCalledWith(el, expect.objectContaining({ fitToContent: true }));
  });

  it("is a no-op when the element is gone", () => {
    const api = fakeApi([{ id: "a" }]);
    scrollToMatch(api, result("zzz"));
    expect(api.scrollToContent).not.toHaveBeenCalled();
  });
});
