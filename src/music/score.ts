import { add, rational, toNumber } from "./rational";
import type { NoteEvent } from "./types";

export type PositionedNote = NoteEvent & { onset: number };

export function positionNotes(notes: readonly NoteEvent[]): PositionedNote[] {
  let cursor = rational(0);
  return notes.map((note) => {
    const positioned = { ...note, onset: toNumber(cursor) };
    cursor = add(cursor, note.duration);
    return positioned;
  });
}

export function pitchName(pitch: number | null): string {
  if (pitch === null) return "쉼표";
  const names = ["도", "도♯", "레", "레♯", "미", "파", "파♯", "솔", "솔♯", "라", "라♯", "시"];
  return names[pitch % 12];
}
