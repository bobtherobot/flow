import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useShapeSelection } from "./useShapeSelection";
import type { ExcalidrawAPI } from "../../lib/excalidraw-scene";

type El = Record<string, unknown> & { id: string; type: string };

function makeApi(elements: El[], selectedElementIds: Record<string, boolean>) {
  const appState = { selectedElementIds };
  return {
    getSceneElements: () => elements,
    getAppState: () => appState,
    onChange: () => () => {},
  } as unknown as ExcalidrawAPI;
}

const parallelogram = (id: string, over: Partial<El> = {}): El => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  angle: 0,
  locked: false,
  customData: { flowShape: { kind: "parallelogram", p: { skew: 0.25 } } },
  ...over,
});

describe("useShapeSelection", () => {
  it("returns null with a null api", () => {
    const { result } = renderHook(() => useShapeSelection(null));
    expect(result.current).toBeNull();
  });

  it("returns null when nothing is selected", () => {
    const api = makeApi([parallelogram("a")], {});
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null when more than one element is selected", () => {
    const api = makeApi([parallelogram("a"), parallelogram("b")], { a: true, b: true });
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null for a locked element", () => {
    const api = makeApi([parallelogram("a", { locked: true })], { a: true });
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null when the element carries no flowShape", () => {
    const api = makeApi([parallelogram("a", { customData: {} })], { a: true });
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null when the element has no customData at all", () => {
    const api = makeApi([parallelogram("a", { customData: undefined })], { a: true });
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null for an unknown kind (bad/foreign data)", () => {
    const api = makeApi(
      [parallelogram("a", { customData: { flowShape: { kind: "not-a-real-shape", p: {} } } })],
      { a: true },
    );
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns null for a shape with no handles (triangle)", () => {
    const api = makeApi(
      [parallelogram("a", { customData: { flowShape: { kind: "triangle", p: {} } } })],
      { a: true },
    );
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current).toBeNull();
  });

  it("returns the element and def for a single unlocked flow shape", () => {
    const api = makeApi([parallelogram("a")], { a: true });
    const { result } = renderHook(() => useShapeSelection(api));
    expect(result.current?.element.id).toBe("a");
    expect(result.current?.def.kind).toBe("parallelogram");
    expect(result.current?.def.handles.length).toBeGreaterThan(0);
  });
});
