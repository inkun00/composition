import { DRAFT_BACKUP_STORAGE_KEY, DRAFT_RECOVERY_STORAGE_KEY, DRAFT_STORAGE_KEY } from "./draft";
import { createLostDrawingInbox, LOST_DRAWING_INBOX_KEY, type LostDrawingInbox, type LostDrawingInboxEntry,
  type RecoveryResolution } from "./lostDrawingRecoveryInbox";
import { extractLostDrawingCandidates, type LostDrawingRecordSource,
  type LostDrawingRecoveryCandidate, type LostDrawingSourceKind } from "./lostDrawingRecoveryModel";

export { extractLostDrawingCandidates, lostDrawingSceneFingerprint } from "./lostDrawingRecoveryModel";
export type { LostDrawingRecordSource, LostDrawingRecoveryCandidate, LostDrawingSourceKind } from "./lostDrawingRecoveryModel";

type Options = {
  storage: () => Storage | null;
  readArchives: () => Promise<LostDrawingRecordSource[]>;
  inbox: LostDrawingInbox;
};

function browserStorage(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

function localRecordKind(key: string): LostDrawingSourceKind | null {
  if (key === DRAFT_STORAGE_KEY) return "primary";
  if (key === DRAFT_BACKUP_STORAGE_KEY) return "backup";
  if (key === DRAFT_RECOVERY_STORAGE_KEY) return "damaged";
  if (!/^maeum[-_:]?melody[:_-]/i.test(key) || key === LOST_DRAWING_INBOX_KEY ||
    /practice|auth|token|firebase|preference|:cleared$/i.test(key)) return null;
  return /draft|scene|project|backup|recovery/i.test(key) ? "legacy" : null;
}

function captureLocalRecords(storage: Storage | null): LostDrawingRecordSource[] {
  if (!storage) return [];
  const records: LostDrawingRecordSource[] = [];
  const keys = new Set([DRAFT_STORAGE_KEY, DRAFT_BACKUP_STORAGE_KEY, DRAFT_RECOVERY_STORAGE_KEY]);
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && localRecordKind(key)) keys.add(key);
    }
  } catch { /* Exact known keys may still be readable. */ }
  for (const key of keys) {
    const sourceKind = localRecordKind(key);
    if (!sourceKind) continue;
    try {
      const value = storage.getItem(key);
      if (value) records.push({ value, source: `localStorage:${key}`, sourceKind, currentPointer: key === DRAFT_STORAGE_KEY });
    } catch { /* One blocked record must not hide the other surviving copies. */ }
  }
  return records;
}

/** Read only this app's archive, including drafts rejected by today's validator. */
async function readRawProjectArchives(): Promise<LostDrawingRecordSource[]> {
  if (typeof indexedDB === "undefined") return [];
  if (typeof indexedDB.databases === "function") {
    const databases = await indexedDB.databases();
    if (!databases.some((database) => database.name === "maeum-melody-projects")) return [];
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("maeum-melody-projects");
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("projects")) { db.close(); resolve([]); return; }
      const hasMetadata = db.objectStoreNames.contains("metadata");
      const transaction = db.transaction(hasMetadata ? ["projects", "metadata"] : ["projects"], "readonly");
      const rows = transaction.objectStore("projects").getAll();
      const pointer = hasMetadata ? transaction.objectStore("metadata").get("current") : null;
      transaction.oncomplete = () => {
        const current: unknown = pointer?.result;
        const sources = (rows.result as unknown[]).map((value, index) => {
          const row = value as { id?: unknown };
          const id = typeof row?.id === "string" ? row.id : String(index);
          return { value, source: `indexedDB:maeum-melody-projects/projects/${id}`, sourceKind: "archive" as const,
            currentPointer: id === current };
        });
        db.close(); resolve(sources);
      };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  });
}

function rawOriginal(value: unknown): string | null {
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return null; }
}

export function createLostDrawingRecovery({ storage, readArchives, inbox }: Options) {
  let scanQueue: Promise<unknown> = Promise.resolve();

  async function listLostDrawingRecovery(includeResolved = false): Promise<LostDrawingRecoveryCandidate[]> {
    const records = await inbox.read();
    return records.filter((record) => includeResolved || !record.resolution)
      .map((record) => ({ ...record.candidate }))
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async function scanLostDrawingRecoveryRecords(extraRecords: readonly LostDrawingRecordSource[] = []) {
    // This capture happens synchronously, before a startup migration can rotate
    // primary/backup. No source record is altered by the recovery scanner.
    const local = captureLocalRecords(storage());
    const scan = async () => {
      let archives: LostDrawingRecordSource[] = [];
      try { archives = await readArchives(); } catch { /* Browser privacy restrictions may block IndexedDB. */ }
      const entries: LostDrawingInboxEntry[] = [];
      for (const record of [...local, ...archives, ...extraRecords]) {
        let candidates: LostDrawingRecoveryCandidate[] = [];
        try { candidates = extractLostDrawingCandidates(record); } catch { /* A damaged source is isolated. */ }
        const raw = rawOriginal(record.value);
        for (const candidate of candidates) entries.push({ candidate,
          originals: raw === null ? [] : [{ source: record.source, raw }] });
      }
      const preserved = await inbox.preserve(entries);
      if (preserved) return { candidates: await listLostDrawingRecovery(), preserved };
      const retained = await listLostDrawingRecovery();
      const resolved = new Set((await inbox.read()).filter((entry) => entry.resolution).map((entry) => entry.candidate.id));
      const candidates = new Map(retained.map((candidate) => [candidate.id, candidate]));
      for (const { candidate } of entries) {
        if (!resolved.has(candidate.id)) candidates.set(candidate.id,
          { ...candidate, preserved: candidates.get(candidate.id)?.preserved ?? false });
      }
      return { candidates: [...candidates.values()], preserved: false };
    };
    const pending = scanQueue.then(scan, scan);
    scanQueue = pending.catch(() => undefined);
    return pending;
  }

  async function scanLostDrawingRecovery(extraRecords: readonly LostDrawingRecordSource[] = []) {
    return (await scanLostDrawingRecoveryRecords(extraRecords)).candidates;
  }

  async function addLostDrawingRecoveryCandidates(candidates: readonly LostDrawingRecoveryCandidate[]) {
    const preserved = await inbox.preserve(candidates.map((candidate) => ({ candidate, originals: [] })));
    const saved = await listLostDrawingRecovery();
    const resolved = new Set((await inbox.read()).filter((entry) => entry.resolution).map((entry) => entry.candidate.id));
    return preserved ? saved : [...new Map([...saved, ...candidates.filter((candidate) => !resolved.has(candidate.id))
      .map((candidate) => ({ ...candidate, preserved: false }))]
      .map((candidate) => [candidate.id, candidate])).values()];
  }

  async function resolveLostDrawingRecovery(id: string, resolution: RecoveryResolution) {
    return inbox.resolve(id, resolution);
  }

  return { scanLostDrawingRecoveryRecords, scanLostDrawingRecovery, listLostDrawingRecovery,
    addLostDrawingRecoveryCandidates, resolveLostDrawingRecovery,
    dismissLostDrawingRecovery: (id: string) => resolveLostDrawingRecovery(id, "dismissed") };
}

const recovery = createLostDrawingRecovery({ storage: browserStorage, readArchives: readRawProjectArchives, inbox: createLostDrawingInbox() });
export const { scanLostDrawingRecoveryRecords, scanLostDrawingRecovery, listLostDrawingRecovery,
  addLostDrawingRecoveryCandidates, resolveLostDrawingRecovery, dismissLostDrawingRecovery } = recovery;
