// src/lib/palette-store.ts
import { useSyncExternalStore } from "react";
import {
  type ColorPalette,
  BUILTIN_FALLBACK,
  BUILTIN_PALETTE_NAMES,
  DEFAULT_SEED_PALETTE_NAME,
  SEED_VERSION,
  RECENT_PALETTE_ID,
  RECENT_PALETTE_NAME,
  RECENT_PALETTE_LIMIT,
  builtinColors,
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
  getPaletteSeedVersion,
  setPaletteSeedVersion,
  getRecentColors,
} from "../app/preferences";

export interface PaletteState {
  palettes: ColorPalette[];
  defaultPaletteId: string;
}

const listeners = new Set<() => void>();
let state: PaletteState = load();
let colorsCache: { forState: PaletteState; value: string[] } | null = null;
let recentCache: { forState: PaletteState; value: string[] } | null = null;

/** Stable empty result, so an absent palette doesn't hand out a fresh []. */
const NO_COLORS: string[] = [];

/**
 * Guarantee the Recent palette exists, on every load path.
 *
 * This is why the feature needs no `SEED_VERSION` bump: existence is asserted
 * on load rather than seeded once, so an install at any seed version picks it
 * up on its next boot.
 *
 * The legacy `flow.recentColors` key is read **only** on the run that creates
 * the palette. Reading it again later would resurrect colors the user has
 * since deleted, since nothing clears that key.
 */
function ensureRecentPalette(current: PaletteState): PaletteState {
  if (current.palettes.some((p) => p.id === RECENT_PALETTE_ID)) return current;
  const recent: ColorPalette = {
    id: RECENT_PALETTE_ID,
    name: RECENT_PALETTE_NAME,
    // getRecentColors() already caps its output at LEGACY_RECENT_LIMIT, which
    // is the same 20 as RECENT_PALETTE_LIMIT (see preferences.ts), so this
    // slice can't truncate anything today — it is not a live path. It stays as
    // defense in depth against those two numbers diverging, or a future seed
    // source that isn't pre-capped, so this palette can never silently exceed
    // its own limit.
    colors: getRecentColors().slice(0, RECENT_PALETTE_LIMIT),
  };
  // Appended last, and never made the default — Pastel keeps that job.
  return persist({ ...current, palettes: [...current.palettes, recent] });
}

/** Read persisted state, seeding builtins on first run, migrating them on a
 *  seed-version bump, and repairing a missing/empty default id. */
function load(): PaletteState {
  const palettes = getColorPalettes();
  if (palettes.length === 0) return ensureRecentPalette(seedFresh());
  if (getPaletteSeedVersion() < SEED_VERSION) {
    return ensureRecentPalette(migrateBuiltins(palettes));
  }

  let defaultPaletteId = getDefaultPaletteId() ?? "";
  if (!palettes.some((p) => p.id === defaultPaletteId)) {
    defaultPaletteId = palettes[0].id;
    setDefaultPaletteId(defaultPaletteId);
  }
  return ensureRecentPalette({ palettes, defaultPaletteId });
}

function persist(state: PaletteState): PaletteState {
  setColorPalettes(state.palettes);
  setDefaultPaletteId(state.defaultPaletteId);
  setPaletteSeedVersion(SEED_VERSION);
  return state;
}

/** First run: every builtin, defaulting to Pastel. */
function seedFresh(): PaletteState {
  const seeded = makeBuiltinPalettes();
  const pastel = seeded.find((p) => p.name === DEFAULT_SEED_PALETTE_NAME) ?? seeded[0];
  return persist({ palettes: seeded, defaultPaletteId: pastel.id });
}

/**
 * Bring an older install up to the current seeds: each builtin is refreshed to
 * its new colors **in place** (same id, so anything pointing at it still
 * resolves), missing builtins are added, and palettes the user made themselves
 * are carried over untouched after them. The default moves to Pastel.
 *
 * Builtins are matched by NAME — the ids are generated per install, so the name
 * is the only stable handle. A user palette that happens to be named after a
 * builtin is therefore treated as that builtin and reseeded — EXCEPT the
 * Recent palette, which is matched by its fixed id instead, precisely so a
 * rename to a builtin's name (e.g. "Pastel") can't cost it its identity or
 * its history. See the id-exemption comment below.
 */
function migrateBuiltins(stored: ColorPalette[]): PaletteState {
  // The Recent palette is exempt from name matching in both directions, even
  // though its name isn't in BUILTIN_PALETTE_NAMES. Name-based matching is
  // the whole reason its id is fixed instead of generated (see
  // RECENT_PALETTE_ID's comment) — a user can rename it to anything,
  // including one of these nine builtin names. Without this exemption, that
  // rename would let a rebuilt builtin steal id `flow-recent` on the next
  // migration (grafting the user's history onto a builtin's seed colors) and
  // drop Recent from `userMade` because its *name* now matches a builtin.
  const byName = new Map(
    stored.filter((p) => p.id !== RECENT_PALETTE_ID).map((p) => [p.name, p]),
  );

  const builtins = BUILTIN_PALETTE_NAMES.map((name) => ({
    id: byName.get(name)?.id ?? generatePaletteId(),
    name,
    colors: builtinColors(name) ?? [],
  }));

  const userMade = stored.filter(
    (p) => p.id === RECENT_PALETTE_ID || !BUILTIN_PALETTE_NAMES.includes(p.name),
  );
  const palettes = [...builtins, ...userMade];
  const pastel = palettes.find((p) => p.name === DEFAULT_SEED_PALETTE_NAME) ?? palettes[0];

  return persist({ palettes, defaultPaletteId: pastel.id });
}

function commit(next: PaletteState): void {
  state = next;
  colorsCache = null;
  recentCache = null;
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

/** The Recent palette's colors. Same stable-reference contract as
 *  `getDefaultPaletteColors` — a fresh array per call loops React forever. */
export function getRecentPaletteColors(): string[] {
  if (recentCache && recentCache.forState === state) return recentCache.value;
  const p = state.palettes.find((x) => x.id === RECENT_PALETTE_ID);
  const value = p ? p.colors : NO_COLORS;
  recentCache = { forState: state, value };
  return value;
}

export function usePaletteState(): PaletteState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDefaultPaletteColors(): string[] {
  return useSyncExternalStore(subscribe, getDefaultPaletteColors, getDefaultPaletteColors);
}

export function useRecentPaletteColors(): string[] {
  return useSyncExternalStore(subscribe, getRecentPaletteColors, getRecentPaletteColors);
}

/** Re-read persisted state (primarily a test seam / cross-tab reload). */
export function reloadPaletteStore(): void {
  state = load();
  colorsCache = null;
  recentCache = null;
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
  // The Recent palette is app-maintained and recreated on next load, so
  // "deleting" it would just discard the user's history and hand back an empty
  // one. The UI disables the button; this makes the store honest too.
  if (id === RECENT_PALETTE_ID) return;
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

/**
 * Copy colors into `targetId`, skipping any the target already has.
 *
 * A single `commit()` for the whole batch, deliberately: looping `addSwatch`
 * would fire one subscriber notification and one localStorage write per
 * swatch for what the user experiences as one action.
 *
 * Duplicates are dropped rather than appended so a target can never end up
 * with two identical tiles — the same rule `recordUsedColor` applies, for the
 * same reason (these grids are looked at, and two identical swatches are
 * indistinguishable).
 */
export function copySwatchesTo(targetId: string, colors: string[]): void {
  const target = state.palettes.find((p) => p.id === targetId);
  if (!target) return;

  const seen = new Set(target.colors);
  const additions: string[] = [];
  for (const color of colors) {
    const hex = scrubHex(color);
    if (!hex || seen.has(hex)) continue;
    seen.add(hex);
    additions.push(hex);
  }
  if (additions.length === 0) return;

  commit({
    ...state,
    palettes: mapPalette(targetId, (p) => ({ ...p, colors: [...p.colors, ...additions] })),
  });
}

/**
 * Record a color the user settled on. The **only** automatic route into the
 * Recent palette — called once per rail-popup session, when it closes.
 *
 * A color already in the list is a complete no-op, not a move-to-front: this
 * palette is a grid the user looks at and curates by hand, and re-using a
 * color must not reshuffle it under them.
 */
export function recordUsedColor(color: string): void {
  const hex = scrubHex(color);
  if (!hex) return;
  const palette = state.palettes.find((p) => p.id === RECENT_PALETTE_ID);
  if (!palette || palette.colors.includes(hex)) return;
  commit({
    ...state,
    palettes: mapPalette(RECENT_PALETTE_ID, (p) => ({
      ...p,
      colors: [hex, ...p.colors].slice(0, RECENT_PALETTE_LIMIT),
    })),
  });
}
