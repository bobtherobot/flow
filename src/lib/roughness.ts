/**
 * Sloppiness enforcement, kept free of Excalidraw imports so it can be unit
 * tested in isolation. Excalidraw's roughness scale is 0=Architect, 1=Artist,
 * 2=Cartoonist. flow controls sloppiness globally (app-wide), not per element.
 */

/** Excalidraw roughness values, named. */
export type Sloppiness = 0 | 1 | 2;

export const SLOPPINESS_ARCHITECT: Sloppiness = 0;
export const SLOPPINESS_ARTIST: Sloppiness = 1;
export const SLOPPINESS_CARTOONIST: Sloppiness = 2;

/** App default when no preference is stored. */
export const DEFAULT_SLOPPINESS: Sloppiness = SLOPPINESS_ARCHITECT;

/** Kept for existing call sites; identical to the Architect value. */
export const ARCHITECT_ROUGHNESS = SLOPPINESS_ARCHITECT;

export const SLOPPINESS_LABELS: Record<Sloppiness, string> = {
  0: "Architect",
  1: "Artist",
  2: "Cartoonist",
};

/** Ordered for rendering a control (crisp → sketchy). */
export const SLOPPINESS_ORDER: readonly Sloppiness[] = [0, 1, 2];

export function isSloppiness(value: unknown): value is Sloppiness {
  return value === 0 || value === 1 || value === 2;
}

/**
 * Force every element to `target` sloppiness, returning new objects only where
 * a change is needed. Elements already at `target` are passed through by
 * identity to avoid needless churn. `target` defaults to Architect.
 */
export function normalizeRoughness<T extends { roughness?: number }>(
  elements: readonly T[],
  target: Sloppiness = DEFAULT_SLOPPINESS,
): T[] {
  return elements.map((el) =>
    el.roughness === target ? el : { ...el, roughness: target },
  );
}
