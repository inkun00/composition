import { chordPitchClasses } from "./chord";
import { measureCapacity, type Meter } from "./meter";
import { toNumber } from "./rational";
import { positionNotes } from "./score";
import type { NoteEvent } from "./types";

export type HarmonyFit = "chord" | "color";

const sharpSyllables = ["도", "도♯", "레", "레♯", "미", "파", "파♯", "솔", "솔♯", "라", "라♯", "시"] as const;
const flatSyllables = ["도", "레♭", "레", "미♭", "미", "파", "솔♭", "솔", "라♭", "라", "시♭", "시"] as const;

export function pitchClassSyllable(pitchClass: number, preferFlat = false): string {
  const normalized = ((pitchClass % 12) + 12) % 12;
  return preferFlat ? flatSyllables[normalized] : sharpSyllables[normalized];
}

export function chordToneNames(symbol: string): readonly string[] {
  const preferFlat = /[b♭7]|(?:^F(?![#♯]))|(?:^Dm)/i.test(symbol);
  const classes = chordPitchClasses(symbol);
  return classes.map((pc) => pitchClassSyllable(pc, preferFlat));
}

export function activeChordAtNote(
  note: NoteEvent, notes: readonly NoteEvent[], chords: readonly string[], meter: Meter
): { chord: string; index: number } {
  const positioned = positionNotes(notes).find((item) => item.id === note.id);
  const capacity = toNumber(measureCapacity(meter));
  const chordCount = Math.max(1, chords.length);
  const chordIndex = Math.min(
    Math.max(0, Math.floor((positioned?.onset ?? 0) / (capacity / chordCount))), chordCount - 1
  );
  return { chord: chords[chordIndex] ?? "C", index: chordIndex };
}

// Pitch proximity alone cannot identify a passing tone: that requires melodic
// and harmonic context. Keep this beginner-facing guide strictly descriptive.
export function noteHarmonyFit(
  note: NoteEvent, notes: readonly NoteEvent[], chords: readonly string[], meter: Meter
): HarmonyFit | null {
  if (note.pitch === null) return null;
  const { chord } = activeChordAtNote(note, notes, chords, meter);
  const tones = chordPitchClasses(chord);
  const pitchClass = ((note.pitch % 12) + 12) % 12;
  return tones.includes(pitchClass) ? "chord" : "color";
}

