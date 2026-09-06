import { useCallback, useEffect, useRef, useState } from "react";

type ProjectHistoryOptions<T> = Readonly<{
  current: T;
  onRestore: (snapshot: T) => void;
  limit?: number;
}>;

type ProjectHistoryControls = Readonly<{
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}>;

function shouldUseNativeUndo(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest("[data-project-history='true']")) return false;
  return target.isContentEditable || target instanceof HTMLTextAreaElement ||
    target instanceof HTMLInputElement || target instanceof HTMLSelectElement;
}

export function useProjectHistory<T>({
  current,
  onRestore,
  limit = 40
}: ProjectHistoryOptions<T>): ProjectHistoryControls {
  const [undoStack, setUndoStack] = useState<readonly T[]>([]);
  const [redoStack, setRedoStack] = useState<readonly T[]>([]);
  const currentRef = useRef<T | null>(null);
  const restoringRef = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    const previous = currentRef.current;
    if (previous === null) {
      currentRef.current = current;
      return;
    }
    if (restoringRef.current) {
      restoringRef.current = false;
      currentRef.current = current;
      return;
    }
    if (Object.is(previous, current)) return;
    setUndoStack((stack) => [...stack, previous].slice(-limit));
    setRedoStack([]);
    currentRef.current = current;
  }, [current, limit]);

  const restore = useCallback((snapshot: T) => {
    restoringRef.current = true;
    restoreRef.current(snapshot);
  }, []);

  const undo = useCallback(() => {
    const previous = undoStack.at(-1);
    const latest = currentRef.current;
    if (previous === undefined || latest === null) return;
    setUndoStack((stack) => stack.slice(0, -1));
    setRedoStack((stack) => [...stack, latest].slice(-limit));
    restore(previous);
  }, [limit, restore, undoStack]);

  const redo = useCallback(() => {
    const next = redoStack.at(-1);
    const latest = currentRef.current;
    if (next === undefined || latest === null) return;
    setRedoStack((stack) => stack.slice(0, -1));
    setUndoStack((stack) => [...stack, latest].slice(-limit));
    restore(next);
  }, [limit, redoStack, restore]);

  const reset = useCallback(() => {
    currentRef.current = null;
    restoringRef.current = false;
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.isComposing) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']") || shouldUseNativeUndo(event.target)) return;
      const key = event.key.toLowerCase();
      const wantsUndo = key === "z" && !event.shiftKey;
      const wantsRedo = (key === "z" && event.shiftKey) || key === "y";
      if (wantsUndo && undoStack.length > 0) {
        event.preventDefault();
        undo();
      } else if (wantsRedo && redoStack.length > 0) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redo, redoStack.length, undo, undoStack.length]);

  return {
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    undo,
    redo,
    reset
  };
}
