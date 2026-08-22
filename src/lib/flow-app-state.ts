import { FONT_FAMILY } from "@excalidraw/excalidraw";
import type { Sloppiness } from "./roughness";
import type { BindingMode } from "./binding-mode";
import type { SelectionMode } from "./selection-mode";
import type { PastePosition } from "./paste-position";
import { boldGridColor } from "./grid";

export interface FlowAppStatePrefs {
  sloppiness: Sloppiness;
  bindingMode: BindingMode;
  laserColor: string;
  selectionMode: SelectionMode;
  pastePosition: PastePosition;
  gridSize: number;
  gridColor: string;
}

/**
 * Every `appState` value flow seeds into the canvas at startup.
 *
 * This is the single source of truth for two callers: `initialData.appState` on
 * mount, and File ▸ New. Excalidraw's `resetScene()` replaces the whole appState
 * with `getDefaultAppState()`, so New must re-seed — otherwise the canvas silently
 * reverts to Excalidraw's defaults for all of it. That is not a cosmetic loss:
 * `currentItemRoughness` falling back to 1 while flow's sloppiness preference
 * stays 0 makes App's onChange normalizer rewrite the element array on the first
 * change of a drag, orphaning the in-progress element (it comes back a clone,
 * while `appState.newElement` still points at the original) — so a box drawn
 * after New stayed 0x0. Keep this in sync with anything added to the seed.
 */
export function flowSeedAppState({
  sloppiness,
  bindingMode,
  laserColor,
  selectionMode,
  pastePosition,
  gridSize,
  gridColor,
}: FlowAppStatePrefs) {
  return {
    currentItemRoughness: sloppiness,
    currentItemFontFamily: FONT_FAMILY.Nunito,
    // Seed the arrow-binding lock at init so the fork's selector honors it
    // immediately (an effect-driven apply races initialData restore).
    // bindingMode is a fork addition not yet in the vendor .d.ts.
    bindingMode,
    // Seed the laser color at init too (same fork-field/race rationale as
    // bindingMode above); flow owns its persistence.
    laserColor,
    // Seed the marquee selection mode at init (same fork-field rationale).
    selectionMode,
    // Seed where pasted elements land (same fork-field rationale) — a paste can
    // happen before any effect has run, e.g. straight after File ▸ New.
    pastePosition,
    // flow: no shape tool armed at startup. Seeded (not merely defaulted) for
    // the same reason as the fields above — File ▸ New replaces the whole
    // appState, and an unseeded field there means a stale shape could survive
    // into a brand new document.
    currentItemFlowShape: null,
    // Seed the grid size at init so the grid renders at the preferred cell size
    // on first paint (native field; no cast needed).
    gridSize,
    // Seed the grid colors at init (fork fields; same race rationale as
    // bindingMode). Only gridColor is a stored preference — the bold shade is
    // always derived here so the pair can never drift.
    gridColor,
    gridColorBold: boldGridColor(gridColor),
    // flow defaults object-snapping ON (Excalidraw ships it off). Users can
    // still toggle it off in-canvas (Alt+S); saved docs restore their own
    // value. Native field; no cast needed.
    objectsSnapModeEnabled: true,
    // flow draws new shapes with square corners. Excalidraw ships "round",
    // whose adaptive algorithm sizes the radius from the shape's own dimensions
    // (a rectangle measured 32px, a diamond 35px) and reads as enormous on
    // small boxes. Per-object rounding still lives in the Transform panel.
    currentItemRoundness: "sharp" as const,
    // flow is a modal-tool app: the chosen tool stays chosen and Cmd/Ctrl-hold
    // gives a momentary selection tool. Seed the lock on so the first tool use
    // is already sticky — useToolOverride's normalizer would otherwise correct
    // it a frame later. Shape matches the vendor default (appState.ts:59).
    activeTool: {
      type: "selection" as const,
      customType: null,
      locked: true,
      lastActiveTool: null,
    },
  };
}

/** Excalidraw `appState` fields flow owns **app-wide** rather than per-document:
 *  each is persisted in flow's preferences (localStorage) and pushed into the
 *  canvas from `App`. A saved `.excalidraw` carries its author's values for
 *  them, so anything that restores a scene's appState wholesale must drop these
 *  first — otherwise opening a doc silently overrides the user's preference.
 *
 *  Deliberately NOT listed: `objectsSnapModeEnabled`, `gridModeEnabled`,
 *  `zenModeEnabled`. flow does not persist those — they are session/document
 *  state, so a saved doc restoring its own value is the intended behavior.
 *  `currentItemRoughness` is also absent: it is re-asserted from the sloppiness
 *  preference at the call site, alongside the element normalization it drives. */
export const FLOW_GLOBAL_APP_STATE_KEYS = [
  "bindingMode",
  "laserColor",
  "selectionMode",
  "pastePosition",
  "gridSize",
  "gridColor",
  "gridColorBold",
  "currentItemFlowShape",
] as const;

type FlowGlobalAppStateKey = (typeof FLOW_GLOBAL_APP_STATE_KEYS)[number];

/** Copy of `appState` without the flow-owned globals. `updateScene` merges the
 *  partial it is handed, so omitting a key leaves the live (preference-driven)
 *  value in place. Returns `Omit` rather than `Partial` so the surviving fields
 *  stay required — `updateScene` rejects `T | undefined` on known fields. */
export function withoutFlowGlobals<T extends object>(
  appState: T,
): Omit<T, FlowGlobalAppStateKey> {
  const rest = { ...appState };
  for (const key of FLOW_GLOBAL_APP_STATE_KEYS) {
    delete (rest as Record<string, unknown>)[key];
  }
  return rest;
}
