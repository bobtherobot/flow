import { describe, it, expect } from "vitest";
import { markDeferred, consumeDeferred, resetDeferred } from "./deferred-commit";

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

  it("resetDeferred releases a pending mark without it being consumed as a commit", () => {
    markDeferred();
    resetDeferred();
    expect(consumeDeferred()).toBe(false);
  });

  it("resetDeferred is a no-op when nothing is pending", () => {
    resetDeferred();
    expect(consumeDeferred()).toBe(false);
  });
});
