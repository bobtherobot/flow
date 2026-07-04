/**
 * Sloppiness enforcement, kept free of Excalidraw imports so it can be unit
 * tested in isolation. Excalidraw's roughness scale is 0=Architect, 1=Artist,
 * 2=Cartoonist; the app locks everything to Architect.
 */

/** Sloppiness is locked to "Architect" app-wide; this is its roughness value. */
export const ARCHITECT_ROUGHNESS = 0;

/**
 * Force every element to Architect sloppiness (`roughness: 0`), returning new
 * objects only where a change is needed. Elements already at Architect are
 * passed through by identity to avoid needless churn.
 */
export function normalizeRoughness<T extends { roughness?: number }>(
  elements: readonly T[],
): T[] {
  return elements.map((el) =>
    el.roughness === ARCHITECT_ROUGHNESS ? el : { ...el, roughness: ARCHITECT_ROUGHNESS },
  );
}
