import { chordPitchClasses } from "./chord";
import { measureCapacity, type Meter } from "./meter";
import { melodyFeelingForNotes } from "./melodyFeelings";
import { rational, toNumber } from "./rational";
import type { MelodyCandidate, NoteEvent } from "./types";

function nearestRootPitch(rootClass: number, near: number): number {
  const options = Array.from({ length: 37 }, (_, index) => index + 48)
    .filter((pitch) => pitch % 12 === rootClass);
  return options.sort((left, right) =>
    Math.abs(left - near) - Math.abs(right - near) || left - right)[0];
}

function notesBefore(notes: readonly NoteEvent[], endingStart: number): NoteEvent[] {
  const result: NoteEvent[] = [];
  let onset = 0;
  for (const note of notes) {
    const remaining = endingStart - onset;
    if (remaining <= 0) break;
    const duration = toNumber(note.duration);
    result.push({ ...note, duration: rational(Math.round(Math.min(duration, remaining) * 2), 2) });
    onset += duration;
  }
  return result;
}

export function makeEndingCandidates(
  candidates: readonly MelodyCandidate[],
  chords: readonly string[],
  meter: Meter
): readonly MelodyCandidate[] {
  const capacity = toNumber(measureCapacity(meter));
  const lastChordStart = chords.length > 1 ? capacity * (chords.length - 1) / chords.length : 0;
  const endingStart = Math.min(capacity - 0.5, Math.ceil(Math.max(capacity / 2, lastChordStart) * 2) / 2);
  const lastChord = (chords.at(-1) ?? "C").split("/")[0];
  const rootClass = chordPitchClasses(lastChord)[0];

  return candidates.map((candidate) => {
    const lead = notesBefore(candidate.notes, endingStart);
    const previousPitch = [...lead].reverse().find((note) => note.pitch !== null)?.pitch
      ?? candidate.notes.find((note) => note.pitch !== null)?.pitch ?? 60;
    const closingNote: NoteEvent = {
      id: `${candidate.id}-ending`,
      pitch: nearestRootPitch(rootClass, previousPitch),
      duration: rational(Math.round((capacity - endingStart) * 2), 2)
    };
    const notes = [...lead, closingNote];
    return {
      ...candidate,
      name: `${candidate.name} 마침`,
      hint: "마지막 화음의 편안한 음을 길게 불러 끝내요.",
      feelingId: melodyFeelingForNotes(notes),
      notes
    };
  });
}
