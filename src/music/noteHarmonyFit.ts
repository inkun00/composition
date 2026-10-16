import { chordPitchClasses } from "./chord";
import { measureCapacity, type Meter } from "./meter";
import { toNumber } from "./rational";
import { positionNotes } from "./score";
import type { NoteEvent } from "./types";

export type HarmonyFit = "chord" | "color";

// Pitch proximity alone cannot identify a passing tone: that requires melodic
// and harmonic context. Keep this beginner-facing guide strictly descriptive.
export function noteHarmonyFit(
  note: NoteEvent, notes: readonly NoteEvent[], chords: readonly string[], meter: Meter
): HarmonyFit | null {
  if (note.pitch === null) return null;
  const positioned = positionNotes(notes).find((item) => item.id === note.id);
  const capacity = toNumber(measureCapacity(meter));
  const chordCount = Math.max(1, chords.length);
  const chordIndex = Math.min(
    Math.max(0, Math.floor((positioned?.onset ?? 0) / (capacity / chordCount))), chordCount - 1
  );
  const tones = chordPitchClasses(chords[chordIndex] ?? "C");
  const pitchClass = ((note.pitch % 12) + 12) % 12;
  return tones.includes(pitchClass) ? "chord" : "color";
}
