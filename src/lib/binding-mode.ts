/** flow's persistent arrow-binding lock. Written into `appState.bindingMode`,
 *  which the fork's `isBindingEnabled` selector honors over Excalidraw's
 *  transient per-input flag:
 *    - "on"   → arrows always bind
 *    - "off"  → arrows never bind
 *    - "auto" → Excalidraw's default (bind, hold Ctrl to prevent)
 *  flow defaults to "on" to match Excalidraw's checked "Arrow binding" toggle. */
export type BindingMode = "on" | "off" | "auto";

export const DEFAULT_BINDING_MODE: BindingMode = "on";

const MODES: readonly BindingMode[] = ["on", "off", "auto"];

/** Type guard for an unknown persisted value. */
export function isBindingMode(value: unknown): value is BindingMode {
  return typeof value === "string" && (MODES as readonly string[]).includes(value);
}

/** Whether the bar's binding toggle should read as "on" for a given mode.
 *  "auto" counts as on (arrows bind by default). */
export function isBindingActive(mode: BindingMode): boolean {
  return mode !== "off";
}

/** The mode a click on the toggle produces from the current mode: a plain
 *  on/off flip (an "auto" default flips to "off"). */
export function toggledBindingMode(mode: BindingMode): BindingMode {
  return isBindingActive(mode) ? "off" : "on";
}
