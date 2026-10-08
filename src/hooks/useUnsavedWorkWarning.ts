import { useCallback, useEffect, useRef } from "react";

export const UNSAVED_WORK_WARNING = "저장하지 않고 종료하면 작업이 사라질 수도 있어요.";

export function useUnsavedWorkWarning(enabled: boolean): () => void {
  const skipNextWarning = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (skipNextWarning.current) {
        skipNextWarning.current = false;
        return;
      }
      event.preventDefault();
      event.returnValue = UNSAVED_WORK_WARNING;
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [enabled]);

  return useCallback(() => { skipNextWarning.current = true; }, []);
}
