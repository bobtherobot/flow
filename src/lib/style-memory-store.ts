/**
 * The four style buckets, held for the session only.
 *
 * Module-level singleton (same shape as palette-store) so the panels, the tool
 * rail and the onChange bridge all see one memory without prop-drilling through
 * App. Deliberately not persisted: nothing lands in localStorage and nothing is
 * added to FLOW_GLOBAL_APP_STATE_KEYS, so a saved document can neither restore
 * nor clobber it.
 *
 * Buckets hold contended keys only. Resident keys (font size, arrowheads,
 * padding, arrow type) live authoritatively in Excalidraw's appState — nothing
 * contends for them, so there is nothing to swap.
 */

import {
  applicableKeys,
  contendedOnly,
  RESET_WHEN_UNRECORDED,
  type LoadTarget,
  type StyleBucket,
  type StyleCategory,
} from "./style-memory";

const emptyBuckets = (): Record<StyleCategory, StyleBucket> => ({
  shape: {},
  linear: {},
  text: {},
  freedraw: {},
});

let buckets = emptyBuckets();
let activeCategory: StyleCategory = "shape";

/**
 * Take on a whole element's style. The caller passes the full snapshot — resident
 * keys included, since it writes those straight to appState — and only the
 * contended subset is stored. Adopting also makes the category active.
 */
export function adopt(category: StyleCategory, snapshot: StyleBucket): void {
  buckets = { ...buckets, [category]: { ...buckets[category], ...contendedOnly(snapshot) } };
  activeCategory = category;
}

/** Fold an edit into each given category's bucket. */
export function record(categories: readonly StyleCategory[], patch: StyleBucket): void {
  const contended = contendedOnly(patch);
  for (const category of categories) {
    buckets = { ...buckets, [category]: { ...buckets[category], ...contended } };
  }
}

/**
 * The appState patch to apply before creating `target`. Keys actually
 * recorded are returned as-is, so an untouched bucket normally yields `{}`
 * and Excalidraw's own defaults stand — except for
 * `RESET_WHEN_UNRECORDED` members (see style-memory.ts for why), which are
 * explicitly reset to `undefined` instead of silently omitted.
 */
export function resolveLoad(target: LoadTarget): StyleBucket {
  const bucket = buckets[target.category];
  const patch: StyleBucket = {};
  for (const key of applicableKeys(target)) {
    if (key in bucket) {
      patch[key] = bucket[key];
    } else if (RESET_WHEN_UNRECORDED.has(key)) {
      patch[key] = undefined;
    }
  }
  return patch;
}

/** The bucket an edit lands in when nothing is selected. */
export function getActiveCategory(): StyleCategory {
  return activeCategory;
}

export function setActiveCategory(category: StyleCategory): void {
  activeCategory = category;
}

/** Clear every bucket. Exported for tests — the app never resets mid-session. */
export function resetStyleMemory(): void {
  buckets = emptyBuckets();
  activeCategory = "shape";
}
