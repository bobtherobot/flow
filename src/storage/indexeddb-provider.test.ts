import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { IndexedDbProvider } from "./indexeddb-provider";

// A deterministic clock and id generator make the timestamp/id assertions stable.
describe("IndexedDbProvider", () => {
  beforeEach(() => {
    // Fresh in-memory IndexedDB per test.
    globalThis.indexedDB = new IDBFactory();
  });

  it("creates a document with a generated id and timestamps", async () => {
    const provider = new IndexedDbProvider({
      dbName: "flow-test",
      now: () => 1000,
      genId: () => "id-1",
    });

    const doc = await provider.save({ name: "diagram", contents: '{"x":1}' });

    expect(doc).toEqual({
      id: "id-1",
      name: "diagram",
      contents: '{"x":1}',
      createdAt: 1000,
      updatedAt: 1000,
    });
    expect(await provider.list()).toHaveLength(1);
  });

  it("updates an existing document in place, preserving createdAt", async () => {
    let clock = 1000;
    const provider = new IndexedDbProvider({
      dbName: "flow-test",
      now: () => clock,
      genId: () => "id-1",
    });

    const created = await provider.save({ name: "v1", contents: "a" });
    clock = 2000;
    const updated = await provider.save({ id: created.id, name: "v2", contents: "b" });

    expect(updated.id).toBe(created.id);
    expect(updated.name).toBe("v2");
    expect(updated.contents).toBe("b");
    expect(updated.createdAt).toBe(1000);
    expect(updated.updatedAt).toBe(2000);
    expect(await provider.list()).toHaveLength(1);
  });

  it("loads a stored document and returns undefined for a missing id", async () => {
    const provider = new IndexedDbProvider({ dbName: "flow-test", now: () => 1, genId: () => "id-1" });
    const created = await provider.save({ name: "d", contents: "c" });

    expect(await provider.load(created.id)).toEqual(created);
    expect(await provider.load("nope")).toBeUndefined();
  });

  it("deletes a document", async () => {
    const provider = new IndexedDbProvider({ dbName: "flow-test", now: () => 1, genId: () => "id-1" });
    const created = await provider.save({ name: "d", contents: "c" });

    await provider.delete(created.id);

    expect(await provider.load(created.id)).toBeUndefined();
    expect(await provider.list()).toHaveLength(0);
  });

  it("lists summaries newest-first without contents", async () => {
    let clock = 1000;
    let n = 0;
    const provider = new IndexedDbProvider({
      dbName: "flow-test",
      now: () => clock,
      genId: () => `id-${++n}`,
    });

    await provider.save({ name: "oldest", contents: "a" });
    clock = 2000;
    await provider.save({ name: "newest", contents: "b" });

    const list = await provider.list();
    expect(list.map((d) => d.name)).toEqual(["newest", "oldest"]);
    expect(list[0]).not.toHaveProperty("contents");
  });
});
