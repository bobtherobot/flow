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
 * `SHAPES_REGISTRY` is typed `Partial<Record<FlowShapeKind, ShapeDef>>` (Task 8
 * completes the set and drops the `Partial`), so `Object.values` types each
 * entry as `ShapeDef | undefined`. In practice every key present on the object
 * literal has a real value — `undefined` here would mean the registry itself
 * was built wrong, not that a kind is merely unimplemented yet. Fail loudly
 * rather than silently skipping registration for that kind.
 */
export function registerAllFlowShapes(): void {
  for (const def of Object.values(SHAPES_REGISTRY)) {
    if (!def) {
      throw new Error(
        "SHAPES_REGISTRY contains an undefined entry; every key present on it must map to a real ShapeDef",
      );
    }
    registerFlowShape(def.kind, def.geometry);
  }
}

registerAllFlowShapes();
