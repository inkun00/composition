import { isSavedDraft, type SavedDraft } from "./draft";

export interface ProjectSnapshotStore {
  readCurrent(): Promise<SavedDraft | null>;
  readProject(id: string): Promise<SavedDraft | null>;
  listProjects(): Promise<SavedDraft[]>;
  save(draft: SavedDraft, makeCurrent: boolean): Promise<boolean>;
  clearCurrent(): Promise<void>;
}

const DATABASE_NAME = "maeum-melody-projects";
const PROJECTS = "projects";
const METADATA = "metadata";
const CURRENT = "current";

export function createIndexedProjectSnapshots(): ProjectSnapshotStore {
  let database: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (!database) {
      database = new Promise<IDBDatabase>((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("indexeddb-unavailable"));
          return;
        }
        const request = indexedDB.open(DATABASE_NAME, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(METADATA)) db.createObjectStore(METADATA);
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); database = null; };
          resolve(db);
        };
        request.onerror = () => { database = null; reject(request.error); };
        request.onblocked = () => { database = null; reject(new Error("indexeddb-blocked")); };
      });
      // A failed or disabled database must be retried on the next save.
      void database.catch(() => { database = null; });
    }
    return database;
  }

  async function readProject(id: string): Promise<SavedDraft | null> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PROJECTS, "readonly");
      const request = transaction.objectStore(PROJECTS).get(id);
      request.onsuccess = () => {
        const draft: unknown = request.result?.draft;
        resolve(isSavedDraft(draft) ? draft : null);
      };
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  return {
    readProject,
    async listProjects() {
      const db = await open();
      return new Promise<SavedDraft[]>((resolve, reject) => {
        const request = db.transaction(PROJECTS, "readonly").objectStore(PROJECTS).getAll();
        request.onsuccess = () => resolve(request.result.map((row: { draft?: unknown }) => row.draft).filter(isSavedDraft));
        request.onerror = () => reject(request.error);
      });
    },
    async readCurrent() {
      const db = await open();
      const id = await new Promise<string | null>((resolve, reject) => {
        const request = db.transaction(METADATA, "readonly").objectStore(METADATA).get(CURRENT);
        request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
        request.onerror = () => reject(request.error);
      });
      return id ? readProject(id) : null;
    },
    async save(draft, makeCurrent) {
      if (!draft.projectId || !isSavedDraft(draft)) return false;
      const db = await open();
      return new Promise<boolean>((resolve) => {
        // The archive and its current-project pointer commit together. An aborted
        // large drawing write can never advance the pointer to a missing draft.
        const transaction = db.transaction([PROJECTS, METADATA], "readwrite");
        transaction.objectStore(PROJECTS).put({ id: draft.projectId, draft });
        if (makeCurrent) transaction.objectStore(METADATA).put(draft.projectId, CURRENT);
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      });
    },
    async clearCurrent() {
      const db = await open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(METADATA, "readwrite");
        transaction.objectStore(METADATA).delete(CURRENT);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    }
  };
}
