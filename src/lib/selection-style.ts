/**
 * Selection-style layer. Pure helpers that read the "form value" of a style
 * property across the current selection (the common value, or MIXED when
 * selected elements disagree) and apply a new value immutably.
 *
 * Kept free of Excalidraw imports so it unit-tests in isolation, mirroring
 * roughness.ts. The Illustrator-style panels consume these: with an empty
 * selection a panel edits the `currentItem*` tool defaults (the `fallback`
 * here); with a selection it shows the shared value and writes to those
 * elements. The thin React hook that wires this to `updateScene` lives with the
 * panels; this module stays pure.
 */

/** Marker returned when selected elements disagree on a property's value. */
export const MIXED = Symbol("mixed");
export type Mixed = typeof MIXED;

/**
 * The selection map Excalidraw keeps on `appState.selectedElementIds`
 * (`{ [id]: true }`). Values are optional/boolean to tolerate stale `false`s.
 */
export type SelectedElementIds = Record<string, boolean | undefined>;

/** Anything with a stable id; the minimum this module needs from an element. */
type Identified = { id: string };

/** The shape needed to resolve text-color targets. */
type TextResolvable = Identified & {
  type: string;
  boundElements?: readonly { id: string; type: string }[] | null;
};

/**
 * The ids that a "text color" edit should touch: selected text elements, plus
 * the bound text of any selected container (e.g. a rectangle with a caption).
 * Returned as a selection-map so it can drive `applyToSelection`/`readFormValue`.
 */
export function resolveTextTargetIds(
  elements: readonly TextResolvable[],
  selectedElementIds: SelectedElementIds,
): SelectedElementIds {
  const targets: Record<string, true> = {};
  for (const el of elements) {
    if (selectedElementIds[el.id] !== true) continue;
    if (el.type === "text") targets[el.id] = true;
    for (const bound of el.boundElements ?? []) {
      if (bound.type === "text") targets[bound.id] = true;
    }
  }
  return targets;
}

/** The subset of `elements` whose id is marked selected, order preserved. */
export function getSelectedElements<T extends Identified>(
  elements: readonly T[],
  selectedElementIds: SelectedElementIds,
): T[] {
  return elements.filter((el) => selectedElementIds[el.id] === true);
}

/**
 * The common value of `read` across `items`: the shared value, MIXED if they
 * differ, or `undefined` when `items` is empty. Uses `Object.is` so NaN and
 * -0/+0 compare intuitively.
 */
export function getCommonValue<T, V>(
  items: readonly T[],
  read: (item: T) => V,
): V | Mixed | undefined {
  if (items.length === 0) return undefined;
  const first = read(items[0]);
  for (let i = 1; i < items.length; i += 1) {
    if (!Object.is(read(items[i]), first)) return MIXED;
  }
  return first;
}

/**
 * Form value for a property: the common value across the selection, falling
 * back to `fallback` (the matching `currentItem*` default) when nothing is
 * selected. Returns MIXED when selected elements disagree.
 */
export function readFormValue<T extends Identified, V>(
  elements: readonly T[],
  selectedElementIds: SelectedElementIds,
  read: (el: T) => V,
  fallback: V,
): V | Mixed {
  const selected = getSelectedElements(elements, selectedElementIds);
  if (selected.length === 0) return fallback;
  const common = getCommonValue(selected, read);
  return common === undefined ? fallback : common;
}

/** Property changes to apply to one element (a partial), or null to skip it. */
export type ElementUpdate = Record<string, unknown> | null;

/**
 * Immutably apply `updater` to every targeted element. The updater returns the
 * props to change (supporting multi-property edits like arrow type) or null to
 * leave the element untouched; untargeted and skipped elements pass through by
 * identity. `make` builds the new element — the Excalidraw hook passes
 * `newElementWith` so `version`/`versionNonce` bump and the edit is recorded in
 * history; the default is a structural spread for pure use.
 */
export function updateSelected<T extends Identified>(
  elements: readonly T[],
  selectedElementIds: SelectedElementIds,
  updater: (el: T) => ElementUpdate,
  make?: (el: T, updates: Record<string, unknown>) => T,
): T[] {
  return elements.map((el) => {
    if (selectedElementIds[el.id] !== true) return el;
    const updates = updater(el);
    if (!updates) return el;
    return make ? make(el, updates) : ({ ...el, ...updates } as T);
  });
}
