import { describe, it, expect } from "vitest";
import { getFlowShapeGeometry } from "@excalidraw/excalidraw";
import "./register";

describe("flow shape registration", () => {
  it("registers the triangle with the vendor renderer", () => {
    const geom = getFlowShapeGeometry({
      width: 100,
      height: 50,
      customData: { flowShape: { kind: "triangle", p: {} } },
    });
    expect(geom?.points).toHaveLength(3);
  });

  it("returns null for a plain rectangle", () => {
    expect(getFlowShapeGeometry({ width: 10, height: 10 })).toBeNull();
  });

  it("returns null for an unregistered kind instead of throwing", () => {
    expect(
      getFlowShapeGeometry({
        width: 10,
        height: 10,
        customData: { flowShape: { kind: "not-a-shape", p: {} } },
      }),
    ).toBeNull();
  });
});
