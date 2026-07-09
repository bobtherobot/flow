import { useEffect, useRef, useState } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import {
  applyMatches,
  clearMatches,
  findMatches,
  scrollToMatch,
  type SearchResult,
} from "../../lib/search-matches";

/** External trigger to drive the panel whenever `nonce` increments (so
 *  re-triggering the same request re-fires). `query` of a string is adopted and
 *  run (bottom-bar search); `null` just opens + focuses without changing the
 *  current query (Ctrl/Cmd+F). */
export interface SearchSignal {
  query: string | null;
  nonce: number;
}

interface SearchPanelProps {
  api: ExcalidrawAPI | null;
  signal: SearchSignal;
}

/** Render a match preview with the matched substring emphasised. */
function Preview({ preview, queryLen }: { preview: SearchResult["preview"]; queryLen: number }) {
  const { previewText, indexInSearchQuery, moreBefore, moreAfter } = preview;
  const before = previewText.slice(0, indexInSearchQuery);
  const match = previewText.slice(indexInSearchQuery, indexInSearchQuery + queryLen);
  const after = previewText.slice(indexInSearchQuery + queryLen);
  return (
    <span className="flow-search-panel__preview">
      {moreBefore && "…"}
      {before}
      <mark className="flow-search-panel__hit">{match}</mark>
      {after}
      {moreAfter && "…"}
    </span>
  );
}

/**
 * flow-native canvas search, living in the CONTROLS accordion. Computes matches
 * via the fork's `getSearchMatches`, pushes them to `appState.searchMatches`
 * (so the interactive canvas highlights them), and navigates/zooms between them.
 * Running search from the bottom bar drives this via `signal`.
 */
export function SearchPanel({ api, signal }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const queryLen = query.trim().length;

  /** Run a fresh search and highlight, focusing match `focus` (clamped). */
  const run = (raw: string, focus = 0) => {
    if (!api) return;
    const trimmed = raw.trim();
    if (!trimmed) {
      setResults([]);
      setFocusIndex(null);
      clearMatches(api);
      return;
    }
    const found = findMatches(api, trimmed);
    const idx = found.length ? Math.min(Math.max(0, focus), found.length - 1) : null;
    setResults(found);
    setFocusIndex(idx);
    applyMatches(api, found, idx);
    if (idx !== null) {
      scrollToMatch(api, found[idx]);
    }
  };

  // React to an external trigger (bottom-bar search or Ctrl/Cmd+F). A string
  // query is adopted + run; null just focuses the existing search.
  useEffect(() => {
    if (signal.nonce > 0) {
      if (signal.query !== null) {
        setQuery(signal.query);
        run(signal.query);
      }
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    // run/api intentionally excluded — fire only on a new nonce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal.nonce]);

  // Clear highlights when the panel unmounts (hidden/closed).
  useEffect(() => {
    return () => {
      if (api) clearMatches(api);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const onInput = (value: string) => {
    setQuery(value);
    run(value);
  };

  /** Focus a match by (wrapping) index and reveal it. */
  const focus = (i: number) => {
    if (!api || results.length === 0) return;
    const idx = ((i % results.length) + results.length) % results.length;
    setFocusIndex(idx);
    applyMatches(api, results, idx);
    scrollToMatch(api, results[idx]);
  };

  const hasQuery = query.trim().length > 0;
  const current = focusIndex ?? 0;

  return (
    <div className="flow-search-panel">
      <form
        className="flow-search-panel__bar"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          run(query);
        }}
      >
        <input
          ref={inputRef}
          className="flow-search-panel__input"
          type="search"
          aria-label="Search canvas text"
          placeholder="Find text…"
          value={query}
          onChange={(e) => onInput(e.target.value)}
        />
      </form>

      {hasQuery && (
        <div className="flow-search-panel__meta">
          <span className="flow-search-panel__count">
            {results.length === 0 ? "No matches" : `${current + 1} / ${results.length}`}
          </span>
          <span className="flow-search-panel__nav">
            <button
              type="button"
              className="flow-search-panel__navbtn"
              aria-label="Previous match"
              disabled={results.length === 0}
              onClick={() => focus(current - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="flow-search-panel__navbtn"
              aria-label="Next match"
              disabled={results.length === 0}
              onClick={() => focus(current + 1)}
            >
              ›
            </button>
          </span>
        </div>
      )}

      {results.length > 0 && (
        <ul className="flow-search-panel__list">
          {results.map((r, i) => (
            <li key={`${r.id}-${r.index}`}>
              <button
                type="button"
                className="flow-search-panel__item"
                data-focus={i === focusIndex || undefined}
                onClick={() => focus(i)}
              >
                <Preview preview={r.preview} queryLen={queryLen} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
