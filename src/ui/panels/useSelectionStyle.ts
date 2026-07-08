import { useEffect, useReducer } from "react";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import {
  applyToSelection,
  resolveTextTargetIds,
  type SelectedElementIds,
} from "../../lib/selection-style";

type SceneElements = ReturnType<ExcalidrawAPI["getSceneElements"]>;
type SceneElement = SceneElements[number];
type UpdateAppState = NonNullable<Parameters<ExcalidrawAPI["updateScene"]>[0]>["appState"];

interface SetPropArgs {
  /** Element property to write (e.g. "strokeColor"). */
  prop: string;
  value: unknown;
  /** Matching `currentItem*` appState default, so new elements inherit it. */
  currentItemKey?: string;
  /** Restrict the write to these ids (defaults to the selection). */
  ids?: SelectedElementIds;
}

export interface SelectionStyle {
  elements: SceneElements;
  appState: ReturnType<ExcalidrawAPI["getAppState"]> | null;
  selectedIds: SelectedElementIds;
  /** Ids a text-color edit targets (selected text + bound container text). */
  textTargetIds: SelectedElementIds;
  hasSelection: boolean;
  hasText: boolean;
  /** Apply a property to the selection (or a custom id set) and set its default,
   *  recording a single undo step via the imperative scene API. */
  setProp: (args: SetPropArgs) => void;
}

/**
 * Live bridge between the Illustrator-style panels and the Excalidraw scene.
 * Subscribes to the canvas's `onChange` so the panels re-render as the selection
 * or element values change, and exposes `setProp` which writes through the
 * public `updateScene` API (mirroring App's existing mutations) while also
 * updating the matching `currentItem*` default. With an empty selection, reads
 * fall back to those defaults (Illustrator-style tool defaults) and writes still
 * update them.
 */
export function useSelectionStyle(api: ExcalidrawAPI | null): SelectionStyle {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  const elements: SceneElements = api?.getSceneElements() ?? [];
  const appState = api?.getAppState() ?? null;
  const selectedIds: SelectedElementIds = appState?.selectedElementIds ?? {};
  const textTargetIds = resolveTextTargetIds(elements, selectedIds);

  const hasSelection = Object.values(selectedIds).some(Boolean);
  const hasText = Object.keys(textTargetIds).length > 0;

  const setProp = ({ prop, value, currentItemKey, ids }: SetPropArgs) => {
    if (!api) return;
    const targetIds = ids ?? selectedIds;
    // `newElementWith` bumps version/versionNonce so Excalidraw records the edit
    // in history (raw spreads are read back fine but never captured for undo).
    const next = applyToSelection(api.getSceneElements(), targetIds, prop, value, {
      make: (el: SceneElement, p, v) => newElementWith(el, { [p]: v } as Partial<SceneElement>),
    });
    // The dynamic currentItem* key can't be statically typed here; the cast is
    // localized to this scene-write boundary.
    const appStatePatch = currentItemKey
      ? ({ [currentItemKey]: value } as UpdateAppState)
      : undefined;
    api.updateScene({
      elements: next,
      appState: appStatePatch,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return { elements, appState, selectedIds, textTargetIds, hasSelection, hasText, setProp };
}
