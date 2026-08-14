import { describe, it, expect } from "vitest";
import { expectInsideBox, expectClosed, expectPathOutlineClosed } from "./invariants";
import type { FlowGeometry } from "../types";

describe("expectInsideBox", () => {
  it("throws for a point beyond the right edge", () => {
    const geom: FlowGeometry = { points: [[100.01, 50]] };
    expect(() => expectInsideBox(geom, 100, 100)).toThrow();
  });

  it("throws for a point beyond the bottom edge", () => {
    const geom: FlowGeometry = { points: [[50, 100.01]] };
    expect(() => expectInsideBox(geom, 100, 100)).toThrow();
  });

  it("throws for a negative x coordinate", () => {
    const geom: FlowGeometry = { points: [[-0.01, 50]] };
    expect(() => expectInsideBox(geom, 100, 100)).toThrow();
  });

  it("throws for a negative y coordinate", () => {
    const geom: FlowGeometry = { points: [[50, -0.01]] };
    expect(() => expectInsideBox(geom, 100, 100)).toThrow();
  });

  it("throws for a NaN coordinate", () => {
    const geom: FlowGeometry = { points: [[NaN, 50]] };
    expect(() => expectInsideBox(geom, 100, 100)).toThrow();
  });

  it("passes for a point exactly at the left edge", () => {
    const geom: FlowGeometry = { points: [[0, 50]] };
    expect(() => expectInsideBox(geom, 100, 100)).not.toThrow();
  });

  it("passes for a point exactly at the right edge", () => {
    const geom: FlowGeometry = { points: [[100, 50]] };
    expect(() => expectInsideBox(geom, 100, 100)).not.toThrow();
  });

  it("passes for a point exactly at the top edge", () => {
    const geom: FlowGeometry = { points: [[50, 0]] };
    expect(() => expectInsideBox(geom, 100, 100)).not.toThrow();
  });

  it("passes for a point exactly at the bottom edge", () => {
    const geom: FlowGeometry = { points: [[50, 100]] };
    expect(() => expectInsideBox(geom, 100, 100)).not.toThrow();
  });
});

describe("expectClosed", () => {
  it("throws when the first and last points are identical", () => {
    const geom: FlowGeometry = {
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 0],
      ],
    };
    expect(() => expectClosed(geom)).toThrow();
  });

  it("throws for a 2-point outline", () => {
    const geom: FlowGeometry = {
      points: [
        [0, 0],
        [100, 100],
      ],
    };
    expect(() => expectClosed(geom)).toThrow();
  });

  it("passes for a valid 3-point outline", () => {
    const geom: FlowGeometry = {
      points: [
        [0, 0],
        [100, 0],
        [50, 100],
      ],
    };
    expect(() => expectClosed(geom)).not.toThrow();
  });
});

describe("expectPathOutlineClosed", () => {
  it("passes for a two-subpath string with both closed", () => {
    const geom: FlowGeometry = {
      points: [[0, 0]],
      path: "M 0 0 L 1 0 Z M 2 2 L 3 3 Z",
    };
    expect(() => expectPathOutlineClosed(geom)).not.toThrow();
  });

  it("throws when the first subpath lacks Z", () => {
    const geom: FlowGeometry = {
      points: [[0, 0]],
      path: "M 0 0 L 1 0 M 2 2 L 3 3 Z",
    };
    expect(() => expectPathOutlineClosed(geom)).toThrow();
  });

  it("allows an interior subpath to stay open", () => {
    // Interior detail is stroke, not boundary: the cylinder's front cap must be
    // an open arc, because closing it strokes a chord straight across the top
    // ellipse. Only the outline needs to close.
    const geom: FlowGeometry = {
      points: [[0, 0]],
      path: "M 0 0 L 1 0 Z M 2 2 L 3 3",
    };
    expect(() => expectPathOutlineClosed(geom)).not.toThrow();
  });

  it("passes trivially when path is absent", () => {
    const geom: FlowGeometry = { points: [[0, 0]] };
    expect(() => expectPathOutlineClosed(geom)).not.toThrow();
  });
});
