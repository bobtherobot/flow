import {
  serializeAsJSON,
  loadFromBlob,
  exportToBlob,
  exportToSvg,
} from "@excalidraw/excalidraw";
import type { ComponentProps } from "react";
import type { Excalidraw } from "@excalidraw/excalidraw";
import { ARCHITECT_ROUGHNESS, normalizeRoughness } from "./roughness";

export { ARCHITECT_ROUGHNESS, normalizeRoughness } from "./roughness";

/** The imperative handle Excalidraw hands us via the `excalidrawAPI` prop. */
export type ExcalidrawAPI = NonNullable<
  Parameters<NonNullable<ComponentProps<typeof Excalidraw>["excalidrawAPI"]>>[0]
>;

/** Serialize the current canvas to a `.excalidraw` JSON string. */
export function serializeScene(api: ExcalidrawAPI): string {
  return serializeAsJSON(
    api.getSceneElements(),
    api.getAppState(),
    api.getFiles(),
    "local",
  );
}

/** Load a `.excalidraw` JSON string onto the canvas, replacing current content. */
export async function applyContentsToScene(
  api: ExcalidrawAPI,
  contents: string,
): Promise<void> {
  const blob = new Blob([contents], { type: "application/json" });
  const scene = await loadFromBlob(blob, null, null);
  api.updateScene({
    // Normalize imported elements and reset the inherited default so the
    // opened file cannot reintroduce a non-Architect sloppiness.
    elements: normalizeRoughness(scene.elements),
    appState: { ...scene.appState, currentItemRoughness: ARCHITECT_ROUGHNESS },
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
