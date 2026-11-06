import { useRef, useState } from "react";
import { LESSONS, type LessonId } from "./learningModel";

export const LEARNING_PROGRESS_KEY = "maeum-melody:learning:v1";

export function readLearningProgress(): { completed: LessonId[]; saved: boolean } {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(LEARNING_PROGRESS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return { completed: [], saved: true };
    const completed = LESSONS.filter((lesson) => raw.includes(lesson.id)).map((lesson) => lesson.id);
    return { completed, saved: true };
  } catch {
    return { completed: [], saved: false };
  }
}

export function writeLearningProgress(completed: readonly LessonId[]): boolean {
  try {
    localStorage.setItem(LEARNING_PROGRESS_KEY, JSON.stringify(completed));
    return true;
  } catch {
    return false;
  }
}

export function useLearningProgress() {
  const [initial] = useState(readLearningProgress);
  const [completed, setCompleted] = useState(initial.completed);
  const [saved, setSaved] = useState(initial.saved);
  const completedRef = useRef(completed);

  function markComplete(id: LessonId) {
    if (!LESSONS.some((lesson) => lesson.id === id)) return;
    const next = LESSONS.filter((lesson) => completedRef.current.includes(lesson.id) || lesson.id === id)
      .map((lesson) => lesson.id);
    completedRef.current = next;
    setCompleted(next);
    setSaved(writeLearningProgress(next));
  }

  return { completed, markComplete, saved };
}
