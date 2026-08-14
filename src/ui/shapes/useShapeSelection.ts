import { useEffect, useReducer } from "react";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";
import { SHAPES_REGISTRY } from "./registry";
import type { FlowShapeKind, ShapeDef, ShapeParams } from "./types";

type SceneElements = ReturnType<ExcalidrawAPI["getSceneElements"]>;
export type SceneElement = SceneElements[number];

export interface ShapeSelection {
  element: SceneElement;
  def: ShapeDef;
}

/** The untrusted shape of `element.customData.flowShape` as it actually
 *  arrives at runtime — a scene can be loaded from an imported `.excalidraw`
 *  file authored elsewhere, so `kind` is read as a bare string and checked
 *  against the registry rather than trusted as `FlowShapeKind`. */
type RawFlowShape = { kind?: string; p?: ShapeParams };

function rawFlowShapeOf(element: SceneElement): RawFlowShape | undefined {
  const customData = element.customData as { flowShape?: RawFlowShape } | undefined;
  return customData?.flowShape;
}

/** `p` for the given element's flow shape, or `{}` when it has none — used by
 *  `ShapeHandles` to feed `HandleDef.at`. Safe to call on any element. */
export function flowShapeParamsOf(element: SceneElement): ShapeParams {
  return rawFlowShapeOf(element)?.p ?? {};
}

function isFlowShapeKind(kind: string | undefined): kind is FlowShapeKind {
  // `Object.hasOwn` is ES2022; the project targets ES2020, so use the
  // equivalent `hasOwnProperty.call` instead.
  return kind !== undefined && Object.prototype.hasOwnProperty.call(SHAPES_REGISTRY, kind);
}

/**
 * The single selected flow-shape element with a non-empty handle set, or
 * null. Subscribes to `onChange` directly — this hook must live in a sibling
 * of `<Excalidraw>`, never in App, for the same non-terminating-`onChange`
 * reason documented on `useActiveTool` and `useSelectionStyle`'s call site
 * (`ToolRails`): a state bump driven by `onChange` re-rendering `<Excalidraw>`
 * makes its `componentDidUpdate` re-fire `onChange` whether or not anything
 * changed, looping forever. `ShapeHandles` (this hook's only caller) is
 * mounted as `ToolRails`'s sibling for the same reason.
 *
 * Returns null when: nothing is selected, more than one element is selected,
 * the element is locked, it carries no `flowShape`, its kind is unknown (not
 * a key of `SHAPES_REGISTRY` — covers bad/foreign data), or its `handles`
 * array is empty (the three handle-less shapes).
 */
export function useShapeSelection(api: ExcalidrawAPI | null): ShapeSelection | null {
  const [, bump] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    if (!api) return;
    return api.onChange(() => bump());
  }, [api]);

  if (!api) return null;

  const elements = api.getSceneElements();
  const appState = api.getAppState();
  const selectedIds = appState?.selectedElementIds ?? {};
  const selected = elements.filter((el) => selectedIds[el.id]);

  if (selected.length !== 1) return null;
  const [element] = selected;
  if (element.locked) return null;

  const raw = rawFlowShapeOf(element);
  if (!raw || !isFlowShapeKind(raw.kind)) return null;

  const def = SHAPES_REGISTRY[raw.kind];
  if (def.handles.length === 0) return null;

  return { element, def };
}
