import { registerFlowShape } from "@excalidraw/excalidraw";
import { SHAPES_REGISTRY } from "./registry";

/**
 * Push every flow shape's geometry into the vendor registry.
 *
 * Must run before the first render of `<Excalidraw>`: a scene restored from
 * localStorage can contain flow shapes, and an unregistered kind draws as a
 * plain box. `src/main.tsx` imports this module for its side effect, at module
 * scope, which is what guarantees the ordering.
 *
 * `SHAPES_REGISTRY` is typed `Record<FlowShapeKind, ShapeDef>`, so
 * `Object.values` types each entry as `ShapeDef` — every key present on the
 * object literal has a real value, and TypeScript enforces that the literal
 * covers every `FlowShapeKind`.
 */
export function registerAllFlowShapes(): void {
  for (const def of Object.values(SHAPES_REGISTRY)) {
    registerFlowShape(def.kind, def.geometry);
  }
}

registerAllFlowShapes();
