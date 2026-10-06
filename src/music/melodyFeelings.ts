import { toNumber } from "./rational";
import type { NoteEvent } from "./types";

export const MELODY_FEELING_GROUPS = [
  { id: "flowing", label: "부드럽게", description: "음이 자연스럽게 이어져요" },
  { id: "quick", label: "빠르게", description: "짧은 음이 바쁘게 움직여요" },
  { id: "bouncy", label: "통통 튀게", description: "쉬거나 높낮이를 뛰어넘어요" },
  { id: "gentle", label: "느긋하게", description: "긴 음을 여유롭게 불러요" },
  { id: "highlight", label: "높이 힘차게", description: "높은 음으로 돋보여요" }
] as const;

export type MelodyFeelingId = typeof MELODY_FEELING_GROUPS[number]["id"];

// Labels describe the notes that were actually generated, not the position
// of a candidate in the catalogue.
export function melodyFeelingForNotes(notes: readonly NoteEvent[]): MelodyFeelingId {
  const pitched = notes.filter((note): note is NoteEvent & { pitch: number } => note.pitch !== null);
  const pitches = pitched.map((note) => note.pitch);
  const durations = notes.map((note) => toNumber(note.duration));
  const averageDuration = durations.reduce((sum, duration) => sum + duration, 0) / durations.length;
  const shortRatio = durations.filter((duration) => duration <= .5).length / durations.length;
  const leaps = pitches.slice(1).filter((pitch, index) => Math.abs(pitch - pitches[index]) >= 7).length;
  const hasRest = pitched.length < notes.length;
  const highPoint = Math.max(...pitches);
  const pitchRange = highPoint - Math.min(...pitches);

  if (highPoint >= 79 && pitchRange >= 7) return "highlight";
  if (averageDuration >= 1.25) return "gentle";
  if (shortRatio >= .65 && !hasRest) return "quick";
  if (hasRest || (leaps >= 2 && shortRatio >= .4)) return "bouncy";
  return "flowing";
}
