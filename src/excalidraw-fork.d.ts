/**
 * Type augmentation for flow's additive fork exports that aren't yet in the
 * vendored `.d.ts` (the dist is rebuilt with esbuild, which doesn't regenerate
 * types). Mirrors the `executeAction` approach in `lib/excalidraw-scene.ts`, but
 * for a static package export we augment the module declaration directly.
 *
 * Runtime source: `vendor/excalidraw/packages/excalidraw/searchMatches.ts`.
 */

// `export {}` makes this file a module so the `declare module` below MERGES with
// the package's existing types (augmentation) instead of shadowing them.
export {};

declare module "@excalidraw/excalidraw" {
  export type SearchMatchLine = {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  };

  export type SearchMatchPreview = {
    indexInSearchQuery: number;
    previewText: string;
    moreBefore: boolean;
    moreAfter: boolean;
  };

  export type SearchResult = {
    id: string;
    index: number;
    preview: SearchMatchPreview;
    matchedLines: SearchMatchLine[];
  };

  /** Pure canvas-search over the given elements; empty query → `[]`. */
  export function getSearchMatches(
    query: string,
    elements: readonly unknown[],
  ): SearchResult[];
}
