import { useRef, useState } from "react";
import type { PracticeDraft } from "./practiceStorage";

const HISTORY_LIMIT = 60;

/** Session history stays separate from the autosaved, portable composition. */
export function usePracticeHistory(read: () => PracticeDraft) {
  const [draft, setDraft] = useState(read);
  const latestDraft = useRef(draft);
  const past = useRef<PracticeDraft[]>([]);
  const future = useRef<PracticeDraft[]>([]);

  function publish(next: PracticeDraft) {
    latestDraft.current = next;
    setDraft(next);
    return next;
  }

  function update(change: (previous: PracticeDraft) => PracticeDraft, record = true) {
    const previous = latestDraft.current;
    const next = change(previous);
    // Re-selecting a setting or an unchanged pitch is not an undo step.
    if (next === previous || JSON.stringify(next) === JSON.stringify(previous)) return;
    if (record) past.current = [...past.current.slice(-(HISTORY_LIMIT - 1)), previous];
    future.current = [];
    publish(next);
  }

  function undo() {
    const previous = past.current.pop();
    if (!previous) return null;
    future.current.push(latestDraft.current);
    return publish(previous);
  }

  function redo() {
    const next = future.current.pop();
    if (!next) return null;
    past.current.push(latestDraft.current);
    return publish(next);
  }

  return { draft, latestDraft, update, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}
