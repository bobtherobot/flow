import { DEFAULT_SLOPPINESS, isSloppiness, type Sloppiness } from "../lib/roughness";

const SLOPPINESS_KEY = "flow.sloppiness";

/** Read the app-wide sloppiness preference, falling back to the default. */
export function getSloppiness(): Sloppiness {
  try {
    const raw = localStorage.getItem(SLOPPINESS_KEY);
    if (raw === null) return DEFAULT_SLOPPINESS;
    const value = Number(raw);
    return isSloppiness(value) ? value : DEFAULT_SLOPPINESS;
  } catch {
    // localStorage can throw (private mode / disabled). Degrade to default.
    return DEFAULT_SLOPPINESS;
  }
}

/** Persist the app-wide sloppiness preference. */
export function setSloppiness(value: Sloppiness): void {
  try {
    localStorage.setItem(SLOPPINESS_KEY, String(value));
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}

const PANEL_LAYOUT_KEY = "flow.panelLayout";
const PANEL_LAYOUTS_KEY = "flow.panelLayouts";

/** Read the persisted dock layout as an unknown blob (caller normalizes). */
export function getPanelLayout(): unknown {
  return readJson(PANEL_LAYOUT_KEY);
}

/** Persist the current dock layout. */
export function setPanelLayout(value: unknown): void {
  writeJson(PANEL_LAYOUT_KEY, value);
}

/** Read the saved named layouts, always an array (empty on miss/parse error). */
export function getNamedLayouts(): unknown[] {
  const raw = readJson(PANEL_LAYOUTS_KEY);
  return Array.isArray(raw) ? raw : [];
}

/** Persist the named layouts list. */
export function setNamedLayouts(value: unknown[]): void {
  writeJson(PANEL_LAYOUTS_KEY, value);
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    // Missing / disabled storage or malformed JSON: caller falls back.
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}
