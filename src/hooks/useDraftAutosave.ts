import { useCallback, useEffect, useRef } from "react";
import { DRAFT_STORAGE_KEY, writeDraft, type SavedDraft } from "../music/draft";

type DraftStorage = Pick<Storage, "setItem" | "removeItem">;

type DraftAutosaveOptions = Readonly<{
  draft: SavedDraft;
  storage: DraftStorage;
  onStatus: (status: string) => void;
  delayMs?: number;
}>;

export function useDraftAutosave({
  draft,
  storage,
  onStatus,
  delayMs = 800
}: DraftAutosaveOptions): Readonly<{ discardDraft: () => void; saveNow: () => boolean }> {
  const latestDraftRef = useRef(draft);
  const timerRef = useRef<number | null>(null);
  const discardedRef = useRef(false);
  latestDraftRef.current = draft;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const saveNow = useCallback(() => {
    if (discardedRef.current) return false;
    clearTimer();
    const saved = writeDraft(storage, { ...latestDraftRef.current, updatedAt: Date.now() });
    onStatus(saved ? "저장됨 ✓" : "저장하지 못했어요");
    return saved;
  }, [clearTimer, onStatus, storage]);

  const discardDraft = useCallback(() => {
    discardedRef.current = true;
    clearTimer();
    try {
      storage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // 저장소를 사용할 수 없는 환경에서도 새 프로젝트 화면은 계속 열어요.
    }
  }, [clearTimer, storage]);

  useEffect(() => {
    if (discardedRef.current) return;
    onStatus("저장 중…");
    clearTimer();
    timerRef.current = window.setTimeout(saveNow, delayMs);
    return clearTimer;
  }, [clearTimer, delayMs, draft, onStatus, saveNow]);

  useEffect(() => {
    const flushBeforeLeaving = () => {
      if (!discardedRef.current) saveNow();
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushBeforeLeaving();
    };
    window.addEventListener("pagehide", flushBeforeLeaving);
    window.addEventListener("beforeunload", flushBeforeLeaving);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushBeforeLeaving);
      window.removeEventListener("beforeunload", flushBeforeLeaving);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [saveNow]);

  return { discardDraft, saveNow };
}
