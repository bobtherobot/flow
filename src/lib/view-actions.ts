import type { ExcalidrawAPI } from "./excalidraw-scene";

/** Excalidraw's branded zoom object; we only ever set `.value`. */
type Zoom = ReturnType<ExcalidrawAPI["getAppState"]>["zoom"];

const ZOOM_STEP = 1.1;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

function setZoom(api: ExcalidrawAPI, value: number): void {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  api.updateScene({ appState: { zoom: { value: clamped } as Zoom } });
}

export function zoomIn(api: ExcalidrawAPI): void {
  setZoom(api, api.getAppState().zoom.value * ZOOM_STEP);
}

export function zoomOut(api: ExcalidrawAPI): void {
  setZoom(api, api.getAppState().zoom.value / ZOOM_STEP);
}

export function resetZoom(api: ExcalidrawAPI): void {
  setZoom(api, 1);
}

export function zoomToFit(api: ExcalidrawAPI): void {
  api.scrollToContent(api.getSceneElements(), { fitToContent: true, animate: true });
}

export function toggleGrid(api: ExcalidrawAPI): void {
  api.updateScene({ appState: { gridModeEnabled: !api.getAppState().gridModeEnabled } });
}
