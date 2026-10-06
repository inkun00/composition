import { isSavedDraft, type SavedDraft } from "./draft";

export const DRAFT_HISTORY_KEY = "maeum-melody:draft-history:v1";

export type ArchivedDraft = Readonly<{
  id: string;
  savedAt: number;
  draft: SavedDraft;
}>;

export function readDraftHistory(storage: Pick<Storage, "getItem">): ArchivedDraft[] {
  try {
    const raw = storage.getItem(DRAFT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is ArchivedDraft =>
      entry && typeof entry.id === "string" && Number.isFinite(entry.savedAt) && isSavedDraft(entry.draft));
  } catch {
    return [];
  }
}

export function readBrowserDraftHistory(): ArchivedDraft[] {
  try { return readDraftHistory(window.localStorage); }
  catch { return []; }
}

export function archiveDraft(storage: Pick<Storage, "getItem" | "setItem">, draft: SavedDraft): boolean {
  if (!isSavedDraft(draft)) return false;
  try {
    const history = readDraftHistory(storage);
    const fingerprint = (value: SavedDraft) => JSON.stringify({ ...value, updatedAt: 0 });
    if (history[0] && fingerprint(history[0].draft) === fingerprint(draft)) return true;
    const archived: ArchivedDraft = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      savedAt: Date.now(),
      draft: { ...draft, updatedAt: Date.now() }
    };
    storage.setItem(DRAFT_HISTORY_KEY, JSON.stringify([archived, ...history]));
    return true;
  } catch {
    return false;
  }
}

export function deleteArchivedDraft(storage: Pick<Storage, "getItem" | "setItem">, id: string): boolean {
  try {
    storage.setItem(DRAFT_HISTORY_KEY, JSON.stringify(readDraftHistory(storage).filter((entry) => entry.id !== id)));
    return true;
  } catch { return false; }
}
