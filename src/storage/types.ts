// Storage-agnostic document model. A document's `contents` is the full
// `.excalidraw` file as a JSON string (elements + appState + files), so the same
// shape flows through every provider: local file, IndexedDB, and Google Drive.

export interface StoredDocument {
  id: string;
  name: string;
  /** Serialized `.excalidraw` JSON (elements + appState + files). */
  contents: string;
  createdAt: number;
  updatedAt: number;
}

/** Lightweight record for listing a library without loading full contents. */
export type DocumentSummary = Omit<StoredDocument, "contents">;

/** Input to save: omit `id` to create, provide `id` to update in place. */
export interface SaveInput {
  id?: string;
  name: string;
  contents: string;
}

/**
 * A provider that manages a browsable library of documents (list/load/save/
 * delete). Implemented by IndexedDB now and Google Drive later.
 */
export interface LibraryProvider {
  list(): Promise<DocumentSummary[]>;
  load(id: string): Promise<StoredDocument | undefined>;
  save(input: SaveInput): Promise<StoredDocument>;
  delete(id: string): Promise<void>;
}
