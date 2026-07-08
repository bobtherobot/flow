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

/**
 * Immutably set `prop` to `value` on every selected element, optionally
 * restricted to those matching `predicate` (e.g. only text elements for a text
 * color). Unselected elements, elements failing the predicate, and elements
 * already at `value` pass through by identity to avoid needless churn.
 *
 * `prop`/`value` are dynamic across a heterogeneous element union, so the write
 * is structural; call sites use typed wrappers for their specific property.
 */
export function applyToSelection<T extends Identified>(
  elements: readonly T[],
  selectedElementIds: SelectedElementIds,
  prop: string,
  value: unknown,
  predicate?: (el: T) => boolean,
): T[] {
  return elements.map((el) => {
    if (selectedElementIds[el.id] !== true) return el;
    if (predicate && !predicate(el)) return el;
    if ((el as Record<string, unknown>)[prop] === value) return el;
    return { ...el, [prop]: value } as T;
  });
}
