import { describe, it, expect } from "vitest";
import {
  registerFlowShape,
  getFlowShapeGeometry,
  clearFlowShapes,
} from "@excalidraw/excalidraw";
import { registerAllFlowShapes } from "./register";
import "./register";

describe("flow shape registration", () => {
  it("registers the triangle with the vendor renderer, matching its real geometry", () => {
    // Asserting the actual points (not just their count) is what makes this
    // case fail against a getFlowShapeGeometry stubbed to always return null,
    // or one that returns some other 3-point shape.
    const geom = getFlowShapeGeometry({
      width: 100,
      height: 50,
      customData: { flowShape: { kind: "triangle", p: {} } },
    });
    expect(geom?.points).toEqual([
      [50, 0],
      [100, 50],
      [0, 50],
    ]);
  });

  it("returns null for a plain rectangle with no customData at all", () => {
    expect(getFlowShapeGeometry({ width: 10, height: 10 })).toBeNull();
  });

  it("returns null when customData is present but has no flowShape key", () => {
    expect(
      getFlowShapeGeometry({
        width: 10,
        height: 10,
        customData: { somethingElse: 1 },
      }),
    ).toBeNull();
  });

  it("returns null when flowShape.kind is present but not a string", () => {
    expect(
      getFlowShapeGeometry({
        width: 10,
        height: 10,
        customData: { flowShape: { kind: 42, p: {} } },
      }),
    ).toBeNull();
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

  it("returns null when a registered kind's geometry yields fewer than 3 points", () => {
    registerFlowShape("test-degenerate", () => ({ points: [[0, 0]] }));
    try {
      expect(
        getFlowShapeGeometry({
          width: 10,
          height: 10,
          customData: { flowShape: { kind: "test-degenerate", p: {} } },
        }),
      ).toBeNull();
    } finally {
      // Don't leave "test-degenerate" registered for other tests to trip
      // over — reset the registry and put the real shapes back exactly as
      // the app's own startup path (src/main.tsx) does.
      clearFlowShapes();
      registerAllFlowShapes();
    }
  });
});
