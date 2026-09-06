import { add, rational, toNumber } from "./rational";
import type { NoteEvent } from "./types";
import { accidentalAfterPitchMove, accidentalSymbol } from "./accidental";

export type PositionedNote = NoteEvent & { onset: number };

export function positionNotes(notes: readonly NoteEvent[]): PositionedNote[] {
  let cursor = rational(0);
  return notes.map((note) => {
    const positioned = { ...note, onset: toNumber(cursor) };
    cursor = add(cursor, note.duration);
    return positioned;
  });
}

export function pitchName(pitch: number | null, accidental?: NoteEvent["accidental"]): string {
  if (pitch === null) return "쉼표";
  const names = ["도", "도♯", "레", "레♯", "미", "파", "파♯", "솔", "솔♯", "라", "라♯", "시"];
  const naturalName = names[pitch % 12].replace("♯", "");
  return accidentalSymbol(pitch, accidental) === "♭"
    ? ["도", "레", "레", "미", "미", "파", "솔", "솔", "라", "라", "시", "시"][pitch % 12] + "♭"
    : naturalName + accidentalSymbol(pitch, accidental);
}

export function withEditedPitch(note: NoteEvent, nextPitch: number, keyFifths = 0): NoteEvent {
  if (note.pitch === null) return note;
  return { ...note, pitch: nextPitch,
    accidental: accidentalAfterPitchMove(note.pitch, nextPitch, note.accidental, keyFifths) };
}
