import { useState } from "react";
import { searchIcon } from "./icons";

interface SearchControlProps {
  /** Run the search (opens the native search sidebar, pre-filled). */
  onExecute: (query: string) => void;
}

/** Inline search: a text field plus a magnify button. Submitting (Enter or the
 *  button) opens Excalidraw's native search sidebar pre-filled with the query,
 *  so all match highlighting / navigation is reused. */
export function SearchControl({ onExecute }: SearchControlProps) {
  const [query, setQuery] = useState("");

  return (
    <form
      className="flow-bottombar__search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onExecute(query);
      }}
    >
      <input
        type="search"
        className="flow-bottombar__search-input"
        aria-label="Search canvas"
        placeholder="Search…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <button
        type="submit"
        className="flow-bottombar__btn flow-bottombar__search-go"
        aria-label="Run search"
        title="Search"
      >
        {searchIcon}
      </button>
    </form>
  );
}
