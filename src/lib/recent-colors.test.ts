import { describe, it, expect } from "vitest";
import { pushRecent, normalizeRecents, RECENT_LIMIT } from "./recent-colors";

describe("pushRecent", () => {
  it("puts a new color at the front", () => {
    expect(pushRecent(["#111111"], "#222222")).toEqual(["#222222", "#111111"]);
  });

  it("moves an existing color to the front instead of duplicating it", () => {
    expect(pushRecent(["#111111", "#222222", "#333333"], "#333333"))
      .toEqual(["#333333", "#111111", "#222222"]);
  });

  it("drops the oldest past the limit", () => {
    const full = ["#a1a1a1", "#a2a2a2", "#a3a3a3", "#a4a4a4", "#a5a5a5", "#a6a6a6"];
    const next = pushRecent(full, "#b0b0b0");
    expect(next).toHaveLength(RECENT_LIMIT);
    expect(next[0]).toBe("#b0b0b0");
    expect(next).not.toContain("#a6a6a6");
  });

  it("normalizes to lowercase 6-digit hex and dedups on hue", () => {
    expect(pushRecent(["#ff0000"], "#F00")).toEqual(["#ff0000"]);
  });

  it("strips an alpha byte so nudging opacity does not burn a slot", () => {
    expect(pushRecent(["#ff0000"], "#ff000080")).toEqual(["#ff0000"]);
  });

  it("refuses transparent", () => {
    expect(pushRecent(["#111111"], "transparent")).toEqual(["#111111"]);
  });

  it("refuses junk", () => {
    expect(pushRecent(["#111111"], "not a color")).toEqual(["#111111"]);
  });

  it("does not mutate the input", () => {
    const before = ["#111111"];
    pushRecent(before, "#222222");
    expect(before).toEqual(["#111111"]);
  });
});

describe("normalizeRecents", () => {
  it("keeps clean hex", () => {
    expect(normalizeRecents(["#111111", "#222222"])).toEqual(["#111111", "#222222"]);
  });

  it("drops malformed entries and non-strings", () => {
    expect(normalizeRecents(["#111111", 7, null, "zzz", "#222222"]))
      .toEqual(["#111111", "#222222"]);
  });

  it("truncates past the limit", () => {
    const many = Array.from({ length: 20 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`);
    expect(normalizeRecents(many)).toHaveLength(RECENT_LIMIT);
  });

  it("returns an empty list for a non-array", () => {
    expect(normalizeRecents(null)).toEqual([]);
    expect(normalizeRecents({ nope: true })).toEqual([]);
  });

  it("dedups", () => {
    expect(normalizeRecents(["#111111", "#111111"])).toEqual(["#111111"]);
  });
});
