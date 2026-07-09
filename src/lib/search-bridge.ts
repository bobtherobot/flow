import type { ExcalidrawAPI } from "./excalidraw-scene";

/** Vendor-stable class Excalidraw puts around the search sidebar's input
 *  (CLASSES.SEARCH_MENU_INPUT_WRAPPER in packages/excalidraw/constants.ts). */
const SEARCH_INPUT_SELECTOR = ".layer-ui__search-inputWrapper input";
/** Vendor-stable sidebar tab id for canvas search (CANVAS_SEARCH_TAB). */
const SEARCH_TAB = "search";
/** How many animation frames to wait for the sidebar input to mount. */
const MAX_FRAMES = 30;

/** Whether Excalidraw's search sidebar is already open. */
function isSearchOpen(api: ExcalidrawAPI): boolean {
  return api.getAppState().openSidebar?.tab === SEARCH_TAB;
}

/**
 * Push a query string into Excalidraw's (React-controlled) native search input
 * so its search engine runs. Setting `.value` directly won't notify React, so
 * we go through the prototype value setter and dispatch a bubbling `input`
 * event — the standard trick for driving a controlled input from the outside.
 * Returns whether the input was found.
 */
export function pushQueryIntoSearchInput(
  query: string,
  root: ParentNode = document,
): boolean {
  const input = root.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR);
  if (!input) return false;

  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, query);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  input.select();
  return true;
}

/**
 * Open Excalidraw's native search sidebar and, when a query is given, type it
 * into the sidebar's input once it mounts. Reuses the vendor's match
 * highlighting / navigation wholesale (flow adds no search engine of its own).
 *
 * The sidebar mounts a frame or two after the action dispatches, so the fill is
 * retried across a bounded number of animation frames.
 */
export function openSearch(api: ExcalidrawAPI, query: string): void {
  // `searchMenu` toggles; only dispatch when the panel isn't already open, so
  // executing a search never closes an open panel.
  if (!isSearchOpen(api)) api.executeAction("searchMenu");

  const trimmed = query.trim();
  if (!trimmed) return;

  let frames = 0;
  const tryFill = () => {
    if (pushQueryIntoSearchInput(trimmed)) return;
    if (++frames >= MAX_FRAMES) return;
    requestAnimationFrame(tryFill);
  };
  requestAnimationFrame(tryFill);
}
