import { DEFAULT_SLOPPINESS, isSloppiness, type Sloppiness } from "../lib/roughness";
import { DEFAULT_UNIT, isUnit, type Unit } from "../lib/units";
import { normalizeToolbarState, type ToolbarState } from "../ui/toolbar/toolbar-state";
import { normalizeQuickbarState, type QuickbarState } from "../ui/quickbar/quickbar-state";
import { normalizeBottombarState, type BottombarState } from "../ui/bottombar/bottombar-state";
import { DEFAULT_BINDING_MODE, isBindingMode, type BindingMode } from "../lib/binding-mode";
import { DEFAULT_LASER_HEX, isLaserColor } from "../lib/laser-color";
import {
  DEFAULT_SELECTION_MODE,
  isSelectionMode,
  type SelectionMode,
} from "../lib/selection-mode";
import { clampGridSize, isGridSize, DEFAULT_GRID_SIZE } from "../lib/grid";

const SLOPPINESS_KEY = "flow.sloppiness";
const UNITS_KEY = "flow.units";

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

/** Read the preferred display unit for length controls (default px). */
export function getUnits(): Unit {
  try {
    const raw = localStorage.getItem(UNITS_KEY);
    return isUnit(raw) ? raw : DEFAULT_UNIT;
  } catch {
    return DEFAULT_UNIT;
  }
}

/** Persist the preferred display unit. */
export function setUnits(value: Unit): void {
  try {
    localStorage.setItem(UNITS_KEY, value);
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

const TOOLBAR_KEY = "flow.toolbar";

/** Read the persisted tool-rail state, normalized (default on miss/parse error). */
export function getToolbarState(): ToolbarState {
  return normalizeToolbarState(readJson(TOOLBAR_KEY));
}

/** Persist the tool-rail state. */
export function setToolbarState(value: ToolbarState): void {
  writeJson(TOOLBAR_KEY, value);
}

const QUICKBAR_KEY = "flow.quickbar";

/** Read the persisted quick-actions-bar state, normalized (default on miss). */
export function getQuickbarState(): QuickbarState {
  return normalizeQuickbarState(readJson(QUICKBAR_KEY));
}

/** Persist the quick-actions-bar state. */
export function setQuickbarState(value: QuickbarState): void {
  writeJson(QUICKBAR_KEY, value);
}

const BOTTOMBAR_KEY = "flow.bottombar";

/** Read the persisted bottom-bar state, normalized (default on miss/parse error). */
export function getBottombarState(): BottombarState {
  return normalizeBottombarState(readJson(BOTTOMBAR_KEY));
}

/** Persist the bottom-bar state. */
export function setBottombarState(value: BottombarState): void {
  writeJson(BOTTOMBAR_KEY, value);
}

const BINDING_MODE_KEY = "flow.bindingMode";

/** Read the persisted arrow-binding lock mode (default on miss/corrupt). */
export function getBindingMode(): BindingMode {
  try {
    const raw = localStorage.getItem(BINDING_MODE_KEY);
    return isBindingMode(raw) ? raw : DEFAULT_BINDING_MODE;
  } catch {
    return DEFAULT_BINDING_MODE;
  }
}

/** Persist the arrow-binding lock mode. */
export function setBindingMode(value: BindingMode): void {
  try {
    localStorage.setItem(BINDING_MODE_KEY, value);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}

const SELECTION_MODE_KEY = "flow.selectionMode";

/** Read the persisted marquee selection mode (default on miss/corrupt). */
export function getSelectionMode(): SelectionMode {
  try {
    const raw = localStorage.getItem(SELECTION_MODE_KEY);
    return isSelectionMode(raw) ? raw : DEFAULT_SELECTION_MODE;
  } catch {
    return DEFAULT_SELECTION_MODE;
  }
}

/** Persist the marquee selection mode. */
export function setSelectionMode(value: SelectionMode): void {
  try {
    localStorage.setItem(SELECTION_MODE_KEY, value);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}

const GRID_SIZE_KEY = "flow.gridSize";

/** Read the app-wide grid-size preference (default on miss/corrupt). */
export function getGridSize(): number {
  try {
    const raw = localStorage.getItem(GRID_SIZE_KEY);
    if (raw === null) return DEFAULT_GRID_SIZE;
    const parsed = Number(raw);
    return isGridSize(parsed) ? clampGridSize(parsed) : DEFAULT_GRID_SIZE;
  } catch {
    return DEFAULT_GRID_SIZE;
  }
}

/** Persist the app-wide grid-size preference (clamped before write). */
export function setGridSize(value: number): void {
  try {
    localStorage.setItem(GRID_SIZE_KEY, String(clampGridSize(value)));
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
}

const LASER_COLOR_KEY = "flow.laserColor";

/** Read the global laser-pointer color (default opaque red on miss/corrupt). */
export function getLaserColor(): string {
  try {
    const raw = localStorage.getItem(LASER_COLOR_KEY);
    return isLaserColor(raw) ? raw : DEFAULT_LASER_HEX;
  } catch {
    return DEFAULT_LASER_HEX;
  }
}

/** Persist the global laser-pointer color. */
export function setLaserColor(color: string): void {
  try {
    localStorage.setItem(LASER_COLOR_KEY, color);
  } catch {
    // Quota / disabled storage: preference simply won't persist this session.
  }
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
