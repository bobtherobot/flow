import { useEffect, useReducer } from "react";
import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import {
  updateSelected,
  resolveTextTargetIds,
  type ElementUpdate,
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
  /** Whether the selection contains a linear element (arrow or line). */
  hasLinear: boolean;
  /** Apply a single property to the selection (or a custom id set) and set its
   *  default, recording one undo step. */
  setProp: (args: SetPropArgs) => void;
  /** Apply a computed, possibly multi-property update to the given ids (e.g.
   *  arrow type), optionally setting currentItem* defaults. One undo step. */
  update: (
    ids: SelectedElementIds,
    updater: (el: SceneElement) => ElementUpdate,
    currentItems?: Record<string, unknown>,
  ) => void;
  /** Dispatch a registered Excalidraw action by name against the selection
   *  (reuses its correct perform + history — e.g. "changeArrowType"). */
  executeAction: (name: string, value?: unknown) => void;
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
  const hasLinear = elements.some(
    (el) => selectedIds[el.id] === true && (el.type === "arrow" || el.type === "line"),
  );

  const update: SelectionStyle["update"] = (ids, updater, currentItems) => {
    if (!api) return;
    // `newElementWith` bumps version/versionNonce so Excalidraw records the edit
    // in history (raw spreads read back fine but are never captured for undo).
    const next = updateSelected(api.getSceneElements(), ids, updater, (el, updates) =>
      newElementWith(el, updates as Partial<SceneElement>),
    );
    // The dynamic currentItem* keys can't be statically typed here; the cast is
    // localized to this scene-write boundary.
    api.updateScene({
      elements: next,
      appState: currentItems as UpdateAppState | undefined,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const setProp = ({ prop, value, currentItemKey, ids }: SetPropArgs) =>
    update(
      ids ?? selectedIds,
      (el) => ((el as Record<string, unknown>)[prop] === value ? null : { [prop]: value }),
      currentItemKey ? { [currentItemKey]: value } : undefined,
    );

  const executeAction = (name: string, value?: unknown) => api?.executeAction(name, value);

  return {
    elements,
    appState,
    selectedIds,
    textTargetIds,
    hasSelection,
    hasText,
    hasLinear,
    setProp,
    update,
    executeAction,
  };
}
