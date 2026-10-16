import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";

type Props = {
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

export default function PracticeHistory({ disabled, canUndo, canRedo, undo, redo }: Props) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (disabled || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      const key = event.key.toLowerCase();
      const forward = (key === "z" && event.shiftKey) || key === "y";
      if (key !== "z" && !forward) return;
      event.preventDefault();
      if (forward ? canRedo : canUndo) (forward ? redo : undo)();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, canUndo, canRedo, undo, redo]);

  return (
    <div className="practice-history" role="group" aria-label="작곡 되돌리기">
      <button type="button" disabled={disabled || !canUndo} onClick={undo} title="되돌리기 (Ctrl/⌘+Z)">
        <Undo2 size={17} aria-hidden="true" /> 되돌리기
      </button>
      <button type="button" disabled={disabled || !canRedo} onClick={redo} title="다시 하기 (Ctrl/⌘+Shift+Z)">
        <Redo2 size={17} aria-hidden="true" /> 다시 하기
      </button>
    </div>
  );
}
