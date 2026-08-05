import { describe, it, expect } from "vitest";
import { markDeferred, consumeDeferred } from "./deferred-commit";

describe("deferred-commit", () => {
  it("reports nothing pending before any deferred write", () => {
    expect(consumeDeferred()).toBe(false);
  });

  it("reports a pending sequence exactly once, then resets", () => {
    markDeferred();
    expect(consumeDeferred()).toBe(true);
    expect(consumeDeferred()).toBe(false);
  });

  it("collapses a run of deferred writes into one pending sequence", () => {
    markDeferred();
    markDeferred();
    markDeferred();
    expect(consumeDeferred()).toBe(true);
    expect(consumeDeferred()).toBe(false);
  });
});
