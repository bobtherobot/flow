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
 * Open Excalidraw's own eyedropper.
 *
 * flow does not render the overlay: `LayerUI` already mounts `<EyeDropper/>`
 * whenever this atom holds a payload, and clears it on select or cancel. So the
 * whole integration is setting one atom — which is why the fork edit is two
 * re-export lines rather than a ported component.
 */
export function openEyeDropper({ part, onSelect }: OpenEyeDropperOptions): void {
  editorJotaiStore.set(activeEyeDropperAtom, {
    // flow's picker closes on pick; alt-to-keep-open would strand the overlay
    // above a popup that has already dismissed.
    keepOpenOnAlt: false,
    colorPickerType: PICKER_TYPE[part],
    onSelect: (color: string) => {
      // The vendor can hand back any CSS color; the panels only speak hex.
      const hex = scrubHex(color);
      if (hex) onSelect(hex);
    },
  });
}

/** Dismiss the overlay (e.g. the popup closed underneath it). */
export function cancelEyeDropper(): void {
  editorJotaiStore.set(activeEyeDropperAtom, null);
}
