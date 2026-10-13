export const PRACTICE_MIN_PITCH = 60;
export const PRACTICE_MAX_PITCH = 72;

export const PRACTICE_PITCHES: readonly {
  pitch: number;
  label: string;
  color: string;
}[] = [
  { pitch: 60, label: "낮은 도", color: "#e45158" },
  { pitch: 62, label: "레", color: "#ed922f" },
  { pitch: 64, label: "미", color: "#d7ad19" },
  { pitch: 65, label: "파", color: "#79a94e" },
  { pitch: 67, label: "솔", color: "#419ebd" },
  { pitch: 69, label: "라", color: "#657bc9" },
  { pitch: 71, label: "시", color: "#a177b3" },
  { pitch: 72, label: "높은 도", color: "#d96d95" }
];

export function isPracticePitch(pitch: unknown): pitch is number {
  return typeof pitch === "number" && Number.isInteger(pitch) &&
    pitch >= PRACTICE_MIN_PITCH && pitch <= PRACTICE_MAX_PITCH;
}

export function normalizePracticePitch(pitch: number): number | null {
  if (!Number.isFinite(pitch)) return null;
  return Math.max(PRACTICE_MIN_PITCH, Math.min(PRACTICE_MAX_PITCH, Math.round(pitch)));
}
