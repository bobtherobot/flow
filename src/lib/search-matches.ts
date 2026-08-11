import { getSearchMatches, type SearchResult } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "./excalidraw-scene";

export type { SearchResult };

/** The `AppState.searchMatches` shape the interactive canvas renders. */
type CanvasSearchMatch = {
  id: string;
  focus: boolean;
  // Upstream's canvas renderer gained a per-line `showOnCanvas` flag; the fork's
  // getSearchMatches doesn't compute one, so every line is drawn.
  matchedLines: (SearchResult["matchedLines"][number] & {
    showOnCanvas: boolean;
  })[];
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
    matchedLines: r.matchedLines.map((line) => ({
      ...line,
      showOnCanvas: true,
    })),
  }));
  // Upstream reshaped appState.searchMatches from a flat array into
  // { focusedId, matches }; the focused match is now identified by id rather
  // than by a `focus` flag being scanned for.
  api.updateScene({
    appState: {
      searchMatches: {
        focusedId: focusIndex == null ? null : results[focusIndex]?.id ?? null,
        matches: searchMatches,
      },
    },
  });
}

/** Clear all search highlights from the canvas. */
export function clearMatches(api: ExcalidrawAPI): void {
  api.updateScene({
    appState: { searchMatches: { focusedId: null, matches: [] } },
  });
}

/** Scroll/zoom the canvas to the text element containing a match. */
export function scrollToMatch(api: ExcalidrawAPI, match: SearchResult): void {
  const target = api.getSceneElements().find((el) => el.id === match.id);
  if (target) {
    api.setViewport({
      target,
      fit: "scale-down",
      animation: { duration: 300 },
    });
  }
}
