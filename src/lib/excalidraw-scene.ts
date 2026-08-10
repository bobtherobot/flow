import {
  serializeAsJSON,
  loadFromBlob,
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type { ComponentProps } from "react";
import type { Excalidraw } from "@excalidraw/excalidraw";
import { normalizeRoughness, DEFAULT_SLOPPINESS, type Sloppiness } from "./roughness";
import { withoutFlowGlobals } from "./flow-app-state";

export { ARCHITECT_ROUGHNESS, normalizeRoughness } from "./roughness";

/** The imperative handle Excalidraw hands us via the `onExcalidrawAPI` prop.
 *  (Upstream renamed it from `excalidrawAPI` and now also passes null on
 *  unmount, hence the NonNullable.) */
type ExcalidrawImperativeHandle = NonNullable<
  Parameters<
    NonNullable<ComponentProps<typeof Excalidraw>["onExcalidrawAPI"]>
  >[0]
>;

/**
 * The imperative handle plus flow's `executeAction` fork addition — dispatches a
 * registered Excalidraw action by name (z-order, group, align, arrow type) with
 * correct history capture. Present at runtime (vendor App.tsx); typed here until
 * the vendor `.d.ts` is regenerated.
 */
export type ExcalidrawAPI = ExcalidrawImperativeHandle & {
  executeAction: (name: string, value?: unknown) => void;
};

/** Raster/vector formats flow can export the canvas to. */
export type ImageFormat = "png" | "svg" | "jpg";

/** Serialize the current canvas to a `.excalidraw` JSON string. */
export function serializeScene(api: ExcalidrawAPI): string {
  return serializeAsJSON(
    api.getSceneElements(),
    api.getAppState(),
    api.getFiles(),
    "local",
  );
}

/** Load a `.excalidraw` JSON string onto the canvas, replacing current content.
 *  Imported elements are normalized to the app-wide sloppiness `target`, and the
 *  scene's copy of flow's app-wide preferences is dropped so opening a doc
 *  authored elsewhere can't override them (see `flow-app-state`). */
export async function applyContentsToScene(
  api: ExcalidrawAPI,
  contents: string,
  target: Sloppiness = DEFAULT_SLOPPINESS,
): Promise<void> {
  const blob = new Blob([contents], { type: "application/json" });
  const scene = await loadFromBlob(blob, null, null);
  api.updateScene({
    elements: normalizeRoughness(scene.elements, target),
    appState: { ...withoutFlowGlobals(scene.appState), currentItemRoughness: target },
  });
  if (scene.files) {
    api.addFiles(Object.values(scene.files));
  }
}

type ExportArgs = Parameters<typeof exportToBlob>[0];

function sceneExportPayload(api: ExcalidrawAPI): Pick<
  ExportArgs,
  "elements" | "appState" | "files"
> {
  return {
    elements: api.getSceneElements(),
    appState: api.getAppState(),
    files: api.getFiles(),
  };
}

export function exportPng(api: ExcalidrawAPI): Promise<Blob> {
  return exportToBlob({ ...sceneExportPayload(api), mimeType: "image/png", quality: 1 });
}

export function exportJpg(api: ExcalidrawAPI): Promise<Blob> {
  return exportToBlob({ ...sceneExportPayload(api), mimeType: "image/jpeg", quality: 0.92 });
}

export async function exportSvgString(api: ExcalidrawAPI): Promise<string> {
  const svg = await exportToSvg(sceneExportPayload(api));
  return new XMLSerializer().serializeToString(svg);
}
