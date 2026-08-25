/**
 * Line-height (line-spacing) logic for the Text panel — pure, so it stays out of
 * the Excalidraw package barrel and unit-tests under jsdom.
 *
 * Excalidraw stores line height on the text element as a unitless multiple of
 * the font size, and every text element's height is exactly
 * `lineCount × fontSize × lineHeight` (vendor `getTextHeight`, and its inverse
 * `detectLineHeight`, which `restore.ts` uses to recover the value from an old
 * scene). Wrapping is unaffected — only the wrap *width* decides where lines
 * break — so changing line height changes the height and nothing else.
 */

/** Sanity bounds for the manual field. Zero would collapse the box entirely,
 *  and vendor's `restore` treats a falsy stored lineHeight as "unset". */
export const LINE_HEIGHT_MIN = 0.25;
export const LINE_HEIGHT_MAX = 10;

/** Granularity for the scrub, spin buttons and arrow keys. */
export const LINE_HEIGHT_STEP = 0.05;

/** The word-processor presets. Fonts default to 1.15–1.25, so a fresh text
 *  element usually matches none of these — the same way an off-preset font size
 *  leaves S/M/L/XL unlit. */
export const LINE_HEIGHT_PRESETS = ["1", "1.5", "2"] as const;
export type LineHeightPreset = (typeof LINE_HEIGHT_PRESETS)[number];

/** The minimum a text element needs for its height to be recomputed. */
export interface LineHeightElement {
  text: string;
  fontSize: number;
}

/** Vendor `splitIntoLines`: line breaks are "\n" once the text is normalized. */
export function lineCount(text: string): number {
  return text.replace(/\r\n?/g, "\n").split("\n").length;
}

/**
 * The height a text element takes at `lineHeight` — vendor's `getTextHeight`
 * formula, recomputed rather than measured because line height cannot change
 * how the text wraps, so the line count is already known.
 */
export function textHeightAt(el: LineHeightElement, lineHeight: number): number {
  return lineCount(el.text) * el.fontSize * lineHeight;
}

/** Clamp a typed or scrubbed value into the field's range. */
export function clampLineHeight(value: number): number {
  return Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, value));
}

/** The subset of a text element this module needs to judge "custom". */
export interface FontedTextElement extends LineHeightElement {
  id: string;
  type: string;
  fontFamily: number;
  lineHeight: number;
}

/**
 * The line heights worth carrying across a font-family change, keyed by element
 * id: those that differ from the line height the element's *current* font
 * supplies on its own.
 *
 * Vendor's `changeFontFamily` overwrites `lineHeight` with the incoming font's
 * metric on every font change — right, when the value on the element was only
 * ever the old font's metric in the first place, and wrong when the user picked
 * it deliberately. Comparing against the old font's default is what separates
 * the two, so untouched text still adopts each font's own spacing.
 *
 * `defaultFor` is injected (vendor's `getLineHeight`) to keep this module free
 * of Excalidraw imports.
 */
export function customLineHeights(
  elements: readonly { id: string; type: string }[],
  ids: Record<string, boolean | undefined>,
  defaultFor: (fontFamily: number) => number,
): Map<string, number> {
  const custom = new Map<string, number>();
  for (const el of elements) {
    if (ids[el.id] !== true || el.type !== "text") continue;
    const text = el as FontedTextElement;
    if (text.lineHeight !== defaultFor(text.fontFamily)) custom.set(text.id, text.lineHeight);
  }
  return custom;
}
