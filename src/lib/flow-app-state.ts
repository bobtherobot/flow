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
  "gridSize",
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
