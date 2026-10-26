import { compressToUTF16, decompressFromUTF16 } from "lz-string";
import { isMusicVideoScenes } from "../video/musicVideoModel";
import { isSavedDraft } from "./draft";
import type { LostDrawingRecoveryCandidate } from "./lostDrawingRecoveryModel";

export type RecoveryResolution = "restored" | "dismissed" | "represented";
export type LostDrawingInboxEntry = {
  candidate: LostDrawingRecoveryCandidate;
  originals: readonly { source: string; raw: string }[];
  resolution?: RecoveryResolution;
};
export interface LostDrawingInbox {
  read(): Promise<LostDrawingInboxEntry[]>;
  preserve(entries: readonly LostDrawingInboxEntry[]): Promise<boolean>;
  resolve(id: string, resolution: RecoveryResolution): Promise<boolean>;
}

export const LOST_DRAWING_INBOX_KEY = "maeum-melody:lost-drawings:v1";
export const LOST_DRAWING_INBOX_DATABASE = "maeum-melody-lost-drawings";
const STORE = "records";

function validEntry(value: unknown): value is LostDrawingInboxEntry {
  const entry = value as Partial<LostDrawingInboxEntry> | null;
  return Boolean(entry?.candidate && typeof entry.candidate.id === "string" &&
    typeof entry.candidate.title === "string" && Number.isFinite(entry.candidate.updatedAt) &&
    typeof entry.candidate.source === "string" && typeof entry.candidate.partial === "boolean" &&
    ["primary", "backup", "damaged", "archive", "legacy", "cloud"].includes(entry.candidate.sourceKind) &&
    (entry.candidate.draft === undefined || isSavedDraft(entry.candidate.draft)) &&
    isMusicVideoScenes(entry.candidate.scenes) && entry.candidate.scenes.some((scene) => scene.elements.length > 0) &&
    Array.isArray(entry.originals) && entry.originals.every((original) => original &&
      typeof original.source === "string" && typeof original.raw === "string") &&
    (entry.resolution === undefined || entry.resolution === "restored" || entry.resolution === "dismissed" ||
      entry.resolution === "represented"));
}

function merge(left: LostDrawingInboxEntry | undefined, right: LostDrawingInboxEntry): LostDrawingInboxEntry {
  if (!left) return right;
  const previous = left.candidate;
  const incoming = right.candidate;
  const priority = { primary: 5, damaged: 4, backup: 3, legacy: 2, archive: 1, cloud: 0 };
  const previousQuality = previous.draft ? 2 : previous.partial ? 0 : 1;
  const incomingQuality = incoming.draft ? 2 : incoming.partial ? 0 : 1;
  const preferIncoming = incomingQuality > previousQuality || incomingQuality === previousQuality &&
    (incoming.updatedAt > previous.updatedAt || incoming.updatedAt === previous.updatedAt &&
      priority[incoming.sourceKind] > priority[previous.sourceKind]);
  const originals = [...left.originals];
  for (const original of right.originals) {
    if (!originals.some((old) => old.source === original.source && old.raw === original.raw)) originals.push(original);
  }
  const explicit = left.resolution === "restored" || left.resolution === "dismissed";
  const resolution = right.resolution === "represented" && explicit ? left.resolution : right.resolution ?? left.resolution;
  return { candidate: preferIncoming ? incoming : previous, originals,
    ...(resolution ? { resolution } : {}) };
}

function localStorageSafely(): Storage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function createLostDrawingInbox(): LostDrawingInbox {
  let opening: Promise<IDBDatabase> | null = null;
  let memory: LostDrawingInboxEntry[] = [];
  const durableIds = new Set<string>();

  function open(): Promise<IDBDatabase> {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") { reject(new Error("indexeddb-unavailable")); return; }
        const request = indexedDB.open(LOST_DRAWING_INBOX_DATABASE, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "candidate.id" });
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => { db.close(); opening = null; };
          resolve(db);
        };
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("recovery-inbox-blocked"));
      });
      void opening.catch(() => { opening = null; });
    }
    return opening;
  }

  function readLocal(): LostDrawingInboxEntry[] {
    try {
      const raw = localStorageSafely()?.getItem(LOST_DRAWING_INBOX_KEY);
      if (!raw) return [];
      const values: unknown = JSON.parse(decompressFromUTF16(raw) ?? "null");
      return Array.isArray(values) ? values.filter(validEntry) : [];
    } catch { return []; }
  }

  function writeLocal(entries: LostDrawingInboxEntry[]): boolean {
    try {
      const storage = localStorageSafely();
      if (!storage) return false;
      storage.setItem(LOST_DRAWING_INBOX_KEY, compressToUTF16(JSON.stringify(entries)));
      return true;
    } catch { return false; }
  }

  async function read(): Promise<LostDrawingInboxEntry[]> {
    let saved = readLocal();
    for (const entry of saved) durableIds.add(entry.candidate.id);
    try {
      const db = await open();
      const rows = await new Promise<LostDrawingInboxEntry[]>((resolve, reject) => {
        const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result.filter(validEntry));
        request.onerror = () => reject(request.error);
      });
      saved = [...saved, ...rows];
      for (const entry of rows) durableIds.add(entry.candidate.id);
    } catch { /* Private mode can use the compressed local fallback. */ }
    const combined = new Map<string, LostDrawingInboxEntry>();
    for (const entry of [...saved, ...memory]) combined.set(entry.candidate.id, merge(combined.get(entry.candidate.id), entry));
    return [...combined.values()].map((entry) => ({ ...entry,
      candidate: { ...entry.candidate, preserved: durableIds.has(entry.candidate.id) } }));
  }

  async function preserve(entries: readonly LostDrawingInboxEntry[]): Promise<boolean> {
    if (entries.length === 0) return true;
    const unique = new Map<string, LostDrawingInboxEntry>();
    for (const entry of entries) unique.set(entry.candidate.id, merge(unique.get(entry.candidate.id), entry));
    entries = [...unique.values()];
    let committed = false;
    try {
      const db = await open();
      committed = await new Promise<boolean>((resolve) => {
        const transaction = db.transaction(STORE, "readwrite");
        const store = transaction.objectStore(STORE);
        for (const entry of entries) {
          const existing = store.get(entry.candidate.id);
          existing.onsuccess = () => store.put(merge(validEntry(existing.result) ? existing.result : undefined, entry));
        }
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
      });
    } catch { /* Keep the same candidates in a second, independent storage area. */ }
    if (committed) for (const entry of entries) durableIds.add(entry.candidate.id);
    const previous = await read();
    const all = new Map(previous.map((entry) => [entry.candidate.id, entry]));
    for (const entry of entries) all.set(entry.candidate.id, merge(all.get(entry.candidate.id), entry));
    memory = [...all.values()];
    // Avoid using precious localStorage space when the dedicated archive committed.
    const localSaved = committed ? false : writeLocal(memory);
    if (localSaved) for (const entry of memory) durableIds.add(entry.candidate.id);
    return committed || localSaved;
  }

  return {
    read, preserve,
    async resolve(id, resolution) {
      const entry = (await read()).find((item) => item.candidate.id === id);
      if (!entry) return false;
      // Marking keeps the original recoverable data; it never deletes the source.
      return preserve([{ ...entry, resolution }]);
    }
  };
}
