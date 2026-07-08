import { openDB, type IDBPDatabase } from "idb";
import type {
  DocumentSummary,
  LibraryProvider,
  SaveInput,
  StoredDocument,
} from "./types";

const STORE = "documents";
const DEFAULT_DB_NAME = "flow";

export interface IndexedDbProviderOptions {
  dbName?: string;
  /** Injectable clock for deterministic timestamps (defaults to Date.now). */
  now?: () => number;
  /** Injectable id generator (defaults to crypto.randomUUID). */
  genId?: () => string;
}

/**
 * Persists drawings in the browser via IndexedDB. Backs both the auto-save of
 * the current document and the "internally stored" library the user picks from.
 *
 * Note: browser cache/site-data clears wipe IndexedDB — the UI surfaces this
 * caveat wherever internal storage is chosen.
 */
export class IndexedDbProvider implements LibraryProvider {
  private readonly dbName: string;
  private readonly now: () => number;
  private readonly genId: () => string;
  private dbPromise: Promise<IDBPDatabase> | null = null;

  constructor(options: IndexedDbProviderOptions = {}) {
    this.dbName = options.dbName ?? DEFAULT_DB_NAME;
    this.now = options.now ?? (() => Date.now());
    this.genId = options.genId ?? (() => crypto.randomUUID());
  }

  private db(): Promise<IDBPDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDB(this.dbName, 1, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE)) {
            const store = db.createObjectStore(STORE, { keyPath: "id" });
            store.createIndex("updatedAt", "updatedAt");
          }
        },
      });
    }
    return this.dbPromise;
  }

  async save(input: SaveInput): Promise<StoredDocument> {
    const db = await this.db();
    const timestamp = this.now();

    // Preserve createdAt when updating an existing document in place.
    const existing = input.id
      ? await db.get(STORE, input.id)
      : undefined;

    const doc: StoredDocument = {
      id: input.id ?? this.genId(),
      name: input.name,
      contents: input.contents,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await db.put(STORE, doc);
    return doc;
  }

  async load(id: string): Promise<StoredDocument | undefined> {
    return (await this.db()).get(STORE, id);
  }

  async delete(id: string): Promise<void> {
    await (await this.db()).delete(STORE, id);
  }

  async list(): Promise<DocumentSummary[]> {
    const all = (await (await this.db()).getAll(STORE)) as StoredDocument[];
    return [...all]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ id, name, createdAt, updatedAt }) => ({
        id,
        name,
        createdAt,
        updatedAt,
      }));
  }
}
