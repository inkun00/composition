import { chordPitchClasses, nearestChordTone } from "./chord";
import { toNumber } from "./rational";
import type { HarmonyStory, MelodyCandidate, NoteEvent } from "./types";

export type MelodyRepeatMode = "again" | "new-ending";

function chordAt(chords: readonly string[], onset: number, totalDuration: number): string {
  if (chords.length === 0 || totalDuration <= 0) return "C";
  const index = Math.min(Math.floor(onset / (totalDuration / chords.length)), chords.length - 1);
  return chords[Math.max(0, index)] ?? "C";
}

function differentEnding(pitch: number, chord: string): number {
  const allowed = chordPitchClasses(chord);
  const options = Array.from({ length: 33 }, (_, index) => index + 52)
    .filter((value) => value !== pitch && allowed.includes(value % 12))
    .sort((left, right) => Math.abs(left - pitch) - Math.abs(right - pitch));
  return options[0] ?? pitch;
}

export function repeatMelody(
  sourceNotes: readonly NoteEvent[],
  sourceChords: readonly string[],
  targetChords: readonly string[],
  targetStory: HarmonyStory,
  sourceMeasureIndex: number,
  targetMeasureIndex: number,
  mode: MelodyRepeatMode
): MelodyCandidate {
  const id = `repeat-${sourceMeasureIndex + 1}-${targetMeasureIndex + 1}-${mode}`;
  const totalDuration = sourceNotes.reduce((sum, note) => sum + toNumber(note.duration), 0);
  let onset = 0;
  const notes = sourceNotes.map((note, index) => {
    const sourceChord = chordAt(sourceChords, onset, totalDuration);
    const targetChord = chordAt(targetChords, onset, totalDuration);
    const pitch = note.pitch === null ? null : sourceChord === targetChord
      ? note.pitch : nearestChordTone(note.pitch, targetChord);
    onset += toNumber(note.duration);
    return { ...note, id: `${id}-${index}`, pitch };
  });

  if (mode === "new-ending") {
    let lastIndex = notes.length - 1;
    while (lastIndex >= 0 && notes[lastIndex].pitch === null) lastIndex -= 1;
    if (lastIndex >= 0) {
      const lastOnset = notes.slice(0, lastIndex).reduce((sum, note) => sum + toNumber(note.duration), 0);
      const finalChord = chordAt(targetChords, lastOnset, totalDuration);
      const last = notes[lastIndex];
      notes[lastIndex] = { ...last, pitch: differentEnding(last.pitch!, finalChord) };
    }
  }

  return {
    id,
    name: mode === "again" ? `${sourceMeasureIndex + 1}마디 가락 다시` : `${sourceMeasureIndex + 1}마디 가락, 끝만 다르게`,
    hint: mode === "again" ? "좋아하는 가락을 다시 들려줘요" : "익숙한 가락을 새롭게 마쳐요",
    harmony: targetStory,
    notes
  };
}
