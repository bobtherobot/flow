// src/lib/color-store.ts
import { useSyncExternalStore } from "react";
import type { ColorPart } from "./color-parts";
import { pushRecent } from "./recent-colors";
import {
  getRecentColors,
  setRecentColors,
  getColorNumericMode,
  setColorNumericMode,
  type NumericMode,
} from "../app/preferences";

/**
 * The color UI state that has no home on the canvas.
 *
 * Note what is *not* here: the color itself. That is derived from the selection
 * (see `useColorTarget`), so the panel and the rail popup are two views of one
 * truth rather than two caches that can drift apart.
 *
 * `activePart` is intentionally session-only — which box is frontmost is a
 * property of what you are doing right now, not a preference.
 */
export interface ColorUiState {
  activePart: ColorPart;
  recents: string[];
  numericMode: NumericMode;
}

const listeners = new Set<() => void>();
let state: ColorUiState = load();

function load(): ColorUiState {
  return {
    activePart: "fill",
    recents: getRecentColors(),
    numericMode: getColorNumericMode(),
  };
}

function commit(next: ColorUiState): void {
  state = next;
  for (const l of listeners) l();
}

// --- read API (useSyncExternalStore contract) ---

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Must return a stable reference between mutations or React loops forever. */
export function getSnapshot(): ColorUiState {
  return state;
}

export function useColorUiState(): ColorUiState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Re-read persisted state (test seam / cross-tab reload). */
export function reloadColorStore(): void {
  state = load();
  for (const l of listeners) l();
}

// --- mutations ---

export function setActivePart(activePart: ColorPart): void {
  if (state.activePart === activePart) return;
  commit({ ...state, activePart });
}

export function recordRecent(color: string): void {
  const recents = pushRecent(state.recents, color);
  // pushRecent returns a fresh array even for a no-op, so compare contents.
  const unchanged =
    recents.length === state.recents.length && recents.every((c, i) => c === state.recents[i]);
  if (unchanged) return;
  setRecentColors(recents);
  commit({ ...state, recents });
}

export function setNumericMode(numericMode: NumericMode): void {
  if (state.numericMode === numericMode) return;
  setColorNumericMode(numericMode);
  commit({ ...state, numericMode });
}
