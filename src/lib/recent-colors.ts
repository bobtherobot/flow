// src/lib/recent-colors.ts
import { scrubHex } from "./color-palettes";

/** How many colors the recents strip holds. */
export const RECENT_LIMIT = 6;

/**
 * The user's running set of colors, most-recently-applied first. Deliberately
 * cross-document and independent of any scene: this is a cache of the colors
 * this person reaches for, not a summary of the file that happens to be open.
 *
 * Entries are opaque `#rrggbb`. `scrubHex` strips any alpha byte, so nudging
 * opacity on a color already in the list is a no-op rather than a slot burned
 * on a near-duplicate, and "transparent" (which `scrubHex` rejects) never
 * enters — that is what the quartet's *none* chip is for.
 */
export function pushRecent(list: readonly string[], color: string): string[] {
  const hex = scrubHex(color);
  if (!hex) return [...list];
  return [hex, ...list.filter((c) => c !== hex)].slice(0, RECENT_LIMIT);
}

/** Forgiving reader for the persisted list — same job `normalizePalettes` does. */
export function normalizeRecents(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const hex = scrubHex(item);
    if (hex && !out.includes(hex)) out.push(hex);
    if (out.length === RECENT_LIMIT) break;
  }
  return out;
}
