import { getSearchMatches, type SearchResult } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";

export type { SearchResult };

/** The `AppState.searchMatches` shape the interactive canvas renders. */
type CanvasSearchMatch = {
  id: string;
  focus: boolean;
  matchedLines: SearchResult["matchedLines"];
};

/** Run the scene search for `query` and return matches top-to-bottom. Empty /
 *  whitespace-only queries yield `[]`. */
export function findMatches(api: ExcalidrawAPI, query: string): SearchResult[] {
  return getSearchMatches(query.trim(), api.getSceneElements());
}

/** Map results to `AppState.searchMatches` and push them onto the canvas, with
 *  `focusIndex` marked as the focused (brighter) match. */
export function applyMatches(
  api: ExcalidrawAPI,
  results: readonly SearchResult[],
  focusIndex: number | null,
): void {
  const searchMatches: CanvasSearchMatch[] = results.map((r, i) => ({
    id: r.id,
    focus: i === focusIndex,
    matchedLines: r.matchedLines,
  }));
  api.updateScene({ appState: { searchMatches } });
}

/** Clear all search highlights from the canvas. */
export function clearMatches(api: ExcalidrawAPI): void {
  api.updateScene({ appState: { searchMatches: [] } });
}

/** Scroll/zoom the canvas to the text element containing a match. */
export function scrollToMatch(api: ExcalidrawAPI, match: SearchResult): void {
  const target = api.getSceneElements().find((el) => el.id === match.id);
  if (target) {
    api.scrollToContent(target, { fitToContent: true, animate: true, duration: 300 });
  }
}
