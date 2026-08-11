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
  // Upstream replaced scrollToContent with the viewport API. "scale-down" is
  // what upstream's own Zoom-to-Fit action uses: fit the content, never zooming
  // past 100%, which is what the old `fitToContent: true` did.
  api.setViewport({
    target: api.getSceneElements(),
    fit: "scale-down",
    animation: true,
  });
}
