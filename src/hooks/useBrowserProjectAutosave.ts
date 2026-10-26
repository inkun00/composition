import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { SavedDraft } from "../music/draft";
import { checkpointBrowserProject, saveBrowserProjectDraft } from "../music/projectStorage";

export function useBrowserProjectAutosave(draft: SavedDraft, enabled = true) {
  const [status, setStatus] = useState("이 기기에 저장 준비 중");
  const latest = useRef({ draft, enabled, version: 0 });
  const mounted = useRef(true);

  const flush = useCallback(async (): Promise<boolean> => {
    const current = latest.current;
    if (!current.enabled) return false;
    checkpointBrowserProject(current.draft);
    const saved = await saveBrowserProjectDraft(current.draft);
    if (mounted.current && current === latest.current) {
      setStatus(saved ? "이 기기에 자동 저장됨 ✓" : "자동 저장 실패 · 저장 공간을 확인해 주세요");
    }
    return saved;
  }, []);

  useLayoutEffect(() => {
    const current = { draft, enabled, version: latest.current.version + 1 };
    latest.current = current;
    if (!enabled) return;
    checkpointBrowserProject(draft);
    setStatus("이 기기에 저장 중…");
    void saveBrowserProjectDraft(draft).then((saved) => {
      if (mounted.current && current === latest.current) {
        setStatus(saved ? "이 기기에 자동 저장됨 ✓" : "자동 저장 실패 · 저장 공간을 확인해 주세요");
      }
    });
  }, [draft, enabled]);

  useEffect(() => {
    mounted.current = true;
    const save = () => { void flush(); };
    const visibility = () => { if (document.visibilityState === "hidden") save(); };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      // The synchronous checkpoint survives even when a browser terminates before
      // an asynchronous pagehide request can finish.
      const current = latest.current;
      if (current.enabled) {
        checkpointBrowserProject(current.draft);
        void saveBrowserProjectDraft(current.draft);
      }
      mounted.current = false;
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", save);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flush]);

  return { status, flush };
}
