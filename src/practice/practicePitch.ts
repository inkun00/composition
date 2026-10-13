export const PRACTICE_MIN_PITCH = 60;
export const PRACTICE_MAX_PITCH = 72;

export function isPracticePitch(pitch: unknown): pitch is number {
  return typeof pitch === "number" && Number.isInteger(pitch) &&
    pitch >= PRACTICE_MIN_PITCH && pitch <= PRACTICE_MAX_PITCH;
}

export function normalizePracticePitch(pitch: number): number | null {
  if (!Number.isFinite(pitch)) return null;
  return Math.max(PRACTICE_MIN_PITCH, Math.min(PRACTICE_MAX_PITCH, Math.round(pitch)));
}
