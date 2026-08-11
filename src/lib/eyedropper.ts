// src/lib/eyedropper.ts
import { activeEyeDropperAtom, editorJotaiStore } from "@excalidraw/excalidraw";

import { scrubHex } from "./color-palettes";
import type { ColorPart } from "./color-parts";

/** The vendor's own picker-type discriminator; it drives the alt-drag preview. */
const PICKER_TYPE: Record<ColorPart, "elementBackground" | "elementStroke"> = {
  fill: "elementBackground",
  stroke: "elementStroke",
  // Text color is stored on strokeColor, so it previews as a stroke.
  text: "elementStroke",
};

interface OpenEyeDropperOptions {
  part: ColorPart;
  /** Receives a scrubbed `#rrggbb`. Never called for an unparseable pick. */
  onSelect: (hex: string) => void;
}

/**
 * Opaque handle to a pick this caller opened. Never inspected — only ever
 * handed back to `cancelEyeDropper` and compared by identity against
 * whatever the atom currently holds.
 */
export type EyeDropperHandle = object;

/**
 * Open Excalidraw's own eyedropper.
 *
 * flow does not render the overlay: `LayerUI` already mounts `<EyeDropper/>`
 * whenever this atom holds a payload, and clears it on select or cancel. So the
 * whole integration is setting one atom — which is why the fork edit is two
 * re-export lines rather than a ported component.
 */
export function openEyeDropper({ part, onSelect }: OpenEyeDropperOptions): EyeDropperHandle {
  const payload = {
    // flow's picker closes on pick; alt-to-keep-open would strand the overlay
    // above a popup that has already dismissed.
    keepOpenOnAlt: false,
    colorPickerType: PICKER_TYPE[part],
    onSelect: (color: string) => {
      // The vendor can hand back any CSS color; the panels only speak hex.
      const hex = scrubHex(color);
      if (hex) onSelect(hex);
    },
  };
  editorJotaiStore.set(activeEyeDropperAtom, payload);
  return payload;
}

/**
 * Dismiss a pick THIS caller opened.
 *
 * The atom is global and both picker surfaces (the docked panel and the rail
 * popup) share it. An unconditional null would let one surface's unmount
 * kill a pick the *other* surface opened — e.g. the rail popup's pick is in
 * flight, the Color panel's accordion section collapses for an unrelated
 * reason, and the panel's cleanup wipes the atom out from under the popup.
 * The identity check also makes this a no-op in the common case, where the
 * vendor has already cleared the atom itself on select or cancel.
 */
export function cancelEyeDropper(handle: EyeDropperHandle | null): void {
  if (!handle) return;
  if (editorJotaiStore.get(activeEyeDropperAtom) !== handle) return;
  editorJotaiStore.set(activeEyeDropperAtom, null);
}
