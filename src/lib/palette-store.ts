// src/lib/palette-store.ts
import { useSyncExternalStore } from "react";
import {
  type ColorPalette,
  BUILTIN_FALLBACK,
  makeBuiltinPalettes,
  makeDefaultPalette,
  nextSetName,
  generatePaletteId,
  scrubHex,
} from "./color-palettes";
import {
  getColorPalettes,
  setColorPalettes,
  getDefaultPaletteId,
  setDefaultPaletteId,
} from "../app/preferences";

export interface PaletteState {
  palettes: ColorPalette[];
  defaultPaletteId: string;
}

const listeners = new Set<() => void>();
let state: PaletteState = load();
let colorsCache: { forState: PaletteState; value: string[] } | null = null;

/** Read persisted state, seeding builtins on first run and repairing a
 *  missing/empty default id. */
function load(): PaletteState {
  const palettes = getColorPalettes();
  if (palettes.length === 0) {
    const seeded = makeBuiltinPalettes();
    setColorPalettes(seeded);
    setDefaultPaletteId(seeded[0].id);
    return { palettes: seeded, defaultPaletteId: seeded[0].id };
  }
  let defaultPaletteId = getDefaultPaletteId() ?? "";
  if (!palettes.some((p) => p.id === defaultPaletteId)) {
    defaultPaletteId = palettes[0].id;
    setDefaultPaletteId(defaultPaletteId);
  }
  return { palettes, defaultPaletteId };
}

function commit(next: PaletteState): void {
  state = next;
  colorsCache = null;
  setColorPalettes(next.palettes);
  setDefaultPaletteId(next.defaultPaletteId);
  for (const l of listeners) l();
}

function mapPalette(id: string, fn: (p: ColorPalette) => ColorPalette): ColorPalette[] {
  return state.palettes.map((p) => (p.id === id ? fn(p) : p));
}

function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const copy = arr.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

// --- read API (useSyncExternalStore contract) ---

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PaletteState {
  return state;
}

export function getDefaultPaletteColors(): string[] {
  if (colorsCache && colorsCache.forState === state) return colorsCache.value;
  const p = state.palettes.find((x) => x.id === state.defaultPaletteId);
  const value = p && p.colors.length > 0 ? p.colors : BUILTIN_FALLBACK;
  colorsCache = { forState: state, value };
  return value;
}

export function usePaletteState(): PaletteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDefaultPaletteColors(): string[] {
  return useSyncExternalStore(subscribe, getDefaultPaletteColors, getDefaultPaletteColors);
}

/** Re-read persisted state (primarily a test seam / cross-tab reload). */
export function reloadPaletteStore(): void {
  state = load();
  colorsCache = null;
  for (const l of listeners) l();
}

// --- mutations ---

export function addPalette(name?: string): ColorPalette {
  const palette: ColorPalette = {
    id: generatePaletteId(),
    name: name ?? nextSetName(state.palettes),
    colors: [],
  };
  commit({ ...state, palettes: [...state.palettes, palette] });
  return palette;
}

export function removePalette(id: string): void {
  const remaining = state.palettes.filter((p) => p.id !== id);
  if (remaining.length === 0) {
    const seed = makeDefaultPalette();
    commit({ palettes: [seed], defaultPaletteId: seed.id });
    return;
  }
  const defaultPaletteId =
    state.defaultPaletteId === id ? remaining[0].id : state.defaultPaletteId;
  commit({ palettes: remaining, defaultPaletteId });
}

export function renamePalette(id: string, name: string): void {
  commit({ ...state, palettes: mapPalette(id, (p) => ({ ...p, name })) });
}

export function setDefaultPalette(id: string): void {
  if (!state.palettes.some((p) => p.id === id)) return;
  commit({ ...state, defaultPaletteId: id });
}

export function addSwatch(paletteId: string, color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({ ...p, colors: [...p.colors, hex] })),
  });
}

export function updateSwatch(paletteId: string, index: number, color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({
      ...p,
      colors: p.colors.map((c, i) => (i === index ? hex : c)),
    })),
  });
}

export function removeSwatches(paletteId: string, indices: number[]): void {
  const drop = new Set(indices);
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({
      ...p,
      colors: p.colors.filter((_, i) => !drop.has(i)),
    })),
  });
}

export function reorderSwatches(paletteId: string, from: number, to: number): void {
  commit({
    ...state,
    palettes: mapPalette(paletteId, (p) => ({ ...p, colors: moveItem(p.colors, from, to) })),
  });
}
