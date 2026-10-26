import {
  DRAFT_BACKUP_STORAGE_KEY, DRAFT_RECOVERY_STORAGE_KEY, DRAFT_STORAGE_KEY, isSavedDraft, parseDraft, readDraft,
  writeDraft, type SavedDraft
} from "./draft";
import { createIndexedProjectSnapshots, type ProjectSnapshotStore } from "./projectSnapshots";

const CLEARED_KEY = `${DRAFT_STORAGE_KEY}:cleared`;

export function ensureBrowserProjectIdentity(draft: SavedDraft): SavedDraft {
  if (draft.projectId) return draft;
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { ...draft, projectId: id };
}

type StoreOptions = {
  storage: () => Storage | null;
  snapshots: ProjectSnapshotStore;
};

export function createBrowserProjectStore({ storage: getStorage, snapshots }: StoreOptions) {
  let queue: Promise<unknown> = Promise.resolve();
  let intent = 0;
  let lastDraft: SavedDraft | null = null;
  let lastCheckpoint = false;
  let checkpointStorage: Storage | null = null;
  let checkpointRaw: string | null = null;
  let snapshotRevision: { token: number; pending: Promise<boolean> } | null = null;
  const identified = new WeakMap<SavedDraft, SavedDraft>();
  const latestProjectIntent = new Map<string, number>();

  function identify(draft: SavedDraft): SavedDraft {
    const cached = identified.get(draft);
    if (cached) return cached;
    const result = ensureBrowserProjectIdentity(draft);
    identified.set(draft, result);
    return result;
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = queue.then(operation, operation);
    queue = pending.catch(() => undefined);
    return pending;
  }

  function checkpointBrowserProject(draft: SavedDraft): boolean {
    const known = identified.get(draft);
    if (!known && !isSavedDraft(draft)) return false;
    const normalized = known ?? identify(draft);
    if (lastDraft === normalized && lastCheckpoint) {
      try {
        const storage = getStorage();
        // Flushes of the same immutable revision need no repeated traversal or
        // serialization. Still repair a checkpoint cleared by another tab.
        if (storage && storage === checkpointStorage && storage.getItem(DRAFT_STORAGE_KEY) === checkpointRaw) return true;
      } catch { /* Retry below, including the IndexedDB fallback. */ }
    }
    intent += 1;
    lastDraft = normalized;
    latestProjectIntent.set(normalized.projectId!, intent);
    lastCheckpoint = false;
    checkpointStorage = null;
    checkpointRaw = null;
    try {
      const storage = getStorage();
      if (!storage) return false;
      lastCheckpoint = writeDraft(storage, normalized);
      if (lastCheckpoint) {
        storage.removeItem(CLEARED_KEY);
        checkpointStorage = storage;
        checkpointRaw = storage.getItem(DRAFT_STORAGE_KEY);
      }
    } catch { /* IndexedDB still receives this version when local storage is blocked. */ }
    return lastCheckpoint;
  }

  async function saveBrowserProjectDraft(draft: SavedDraft): Promise<boolean> {
    const known = identified.get(draft);
    if (!known && !isSavedDraft(draft)) return false;
    const normalized = known ?? identify(draft);
    if (lastDraft !== normalized) checkpointBrowserProject(normalized);
    const token = intent;
    const localSaved = lastCheckpoint;
    if (snapshotRevision?.token === token) return snapshotRevision.pending;
    const revision = { token, pending: Promise.resolve(false) };
    snapshotRevision = revision;
    revision.pending = enqueue(async () => {
      // A flurry of brush strokes needs one durable latest snapshot per project,
      // while the last queued snapshot of a previous project is still retained.
      if (latestProjectIntent.get(normalized.projectId!) !== token) return localSaved;
      let snapshotSaved = false;
      try { snapshotSaved = await snapshots.save(normalized, token === intent); }
      catch { /* Browser storage restrictions must be reflected as a failed save. */ }
      // Only successful archive writes are reusable. A later lifecycle flush
      // must retry a failed archive even when its local checkpoint succeeded.
      if (!snapshotSaved && snapshotRevision === revision) snapshotRevision = null;
      if (snapshotSaved && token === intent) {
        try {
          const storage = getStorage();
          if (storage) {
            storage.removeItem(CLEARED_KEY);
            if (!localSaved && parseDraft(storage.getItem(DRAFT_STORAGE_KEY))) {
              // A confirmed IndexedDB snapshot is newer than a local checkpoint
              // rejected for quota. Do not let that stale primary win on restart.
              // Unreadable raw originals are deliberately retained for recovery.
              storage.removeItem(DRAFT_STORAGE_KEY);
              storage.removeItem(DRAFT_BACKUP_STORAGE_KEY);
            }
          }
        } catch { /* IndexedDB current pointer is durable. */ }
      }
      return localSaved || snapshotSaved;
    });
    return revision.pending;
  }

  async function readBrowserProjectDraft(): Promise<SavedDraft | null> {
    await queue;
    let local: SavedDraft | null = null;
    let explicitlyCleared = false;
    try {
      const storage = getStorage();
      if (storage) {
        explicitlyCleared = storage.getItem(CLEARED_KEY) === "1";
        local = explicitlyCleared ? null : parseDraft(storage.getItem(DRAFT_STORAGE_KEY));
      }
    } catch { /* A project can still be restored from IndexedDB. */ }
    if (explicitlyCleared) return null;
    let archived: SavedDraft | null = null;
    try { archived = await snapshots.readCurrent(); } catch { /* localStorage is sufficient when available. */ }
    if (!local && !archived) {
      try { const storage = getStorage(); if (storage) local = readDraft(storage); }
      catch { /* All copies are unavailable. */ }
    }
    // The synchronous checkpoint is authoritative across a project switch. Only
    // compare versions of the same project (legacy drafts have no identity yet).
    const sameProject = !local?.projectId || !archived?.projectId || local.projectId === archived.projectId;
    const latest = !local ? archived : sameProject && archived && archived.updatedAt > local.updatedAt ? archived : local;
    if (!latest) return null;
    const restored = identify(latest);
    // Also migrates old drafts to an independent project archive on startup.
    await saveBrowserProjectDraft(restored);
    return restored;
  }

  async function readBrowserProject(id: string): Promise<SavedDraft | null> {
    await queue;
    let local: SavedDraft | null = null;
    try {
      const storage = getStorage();
      const draft = storage && readDraft(storage);
      if (draft?.projectId === id) local = draft;
    } catch { /* Try the independent project archive below. */ }
    try {
      const archived = await snapshots.readProject(id);
      return archived && (!local || archived.updatedAt > local.updatedAt) ? archived : local;
    } catch { return local; }
  }

  async function clearBrowserCurrentProject(): Promise<void> {
    intent += 1;
    lastDraft = null;
    lastCheckpoint = false;
    checkpointStorage = null;
    checkpointRaw = null;
    snapshotRevision = null;
    try {
      const storage = getStorage();
      if (storage) {
        // A small tombstone prevents interrupted startup/new-project work from
        // reopening an old IndexedDB pointer. Project archives are never deleted.
        storage.setItem(CLEARED_KEY, "1");
        const raw = storage.getItem(DRAFT_STORAGE_KEY);
        if (raw && !parseDraft(raw)) storage.setItem(DRAFT_RECOVERY_STORAGE_KEY, raw);
        storage.removeItem(DRAFT_STORAGE_KEY);
        storage.removeItem(DRAFT_BACKUP_STORAGE_KEY);
      }
    } catch { /* The queued pointer transaction still clears IndexedDB. */ }
    await enqueue(async () => {
      try { await snapshots.clearCurrent(); } catch { /* No IndexedDB may exist in private mode. */ }
    });
  }

  async function listBrowserProjects(): Promise<SavedDraft[]> {
    await queue;
    const projects = new Map<string, SavedDraft>();
    try {
      for (const draft of await snapshots.listProjects()) {
        if (draft.projectId) projects.set(draft.projectId, draft);
      }
    } catch { /* The current local draft can still appear in the recovery list. */ }
    try {
      const storage = getStorage();
      const draft = storage && readDraft(storage);
      if (draft) {
        const local = identify(draft);
        const archived = projects.get(local.projectId!);
        if (!archived || local.updatedAt >= archived.updatedAt) projects.set(local.projectId!, local);
      }
    } catch { /* Independent project archives remain available. */ }
    return [...projects.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  return { checkpointBrowserProject, saveBrowserProjectDraft, readBrowserProjectDraft,
    readBrowserProject, clearBrowserCurrentProject, listBrowserProjects };
}

function browserStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; }
  catch { return null; }
}

const browserProjects = createBrowserProjectStore({ storage: browserStorage, snapshots: createIndexedProjectSnapshots() });
export const { checkpointBrowserProject, saveBrowserProjectDraft, readBrowserProjectDraft,
  readBrowserProject, clearBrowserCurrentProject, listBrowserProjects } = browserProjects;
