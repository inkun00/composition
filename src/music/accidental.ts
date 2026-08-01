import type { NoteEvent } from "./types";

export type Accidental = NonNullable<NoteEvent["accidental"]>;

const naturalPitchClasses = new Set([0, 2, 4, 5, 7, 9, 11]);
const sharpVexNames = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];
const flatVexNames = ["c", "db", "d", "eb", "e", "f", "gb", "g", "ab", "a", "bb", "b"];
const sharpDegrees = [3, 0, 4, 1, 5, 2, 6];
const flatDegrees = [6, 2, 5, 1, 4, 0, 3];
const keySignatureNames = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];

export function pitchClass(pitch: number): number {
  return ((pitch % 12) + 12) % 12;
}

export function isAccidentalPitch(pitch: number): boolean {
  return !naturalPitchClasses.has(pitchClass(pitch));
}

export function accidentalAfterPitchMove(
  previousPitch: number,
  nextPitch: number,
  current?: Accidental,
  keyFifths = 0
): Accidental | undefined {
  if (!isAccidentalPitch(nextPitch)) {
    const degree = staffDegreeForPitch(nextPitch) % 7;
    return keyAlterationForDegree(keyFifths, degree) === 0 ? undefined : "natural";
  }
  if (nextPitch > previousPitch) return "sharp";
  if (nextPitch < previousPitch) return "flat";
  return current ?? "sharp";
}

export function accidentalSymbol(pitch: number, accidental?: Accidental): "♯" | "♭" | "♮" | "" {
  if (accidental === "natural") return "♮";
  if (!isAccidentalPitch(pitch)) return "";
  return accidental === "flat" ? "♭" : "♯";
}

export function keyAlterationForDegree(keyFifths: number, degree: number): -1 | 0 | 1 {
  const normalizedDegree = ((degree % 7) + 7) % 7;
  if (keyFifths > 0 && sharpDegrees.slice(0, keyFifths).includes(normalizedDegree)) return 1;
  if (keyFifths < 0 && flatDegrees.slice(0, -keyFifths).includes(normalizedDegree)) return -1;
  return 0;
}

export function displayedAccidentalSymbol(
  pitch: number,
  accidental?: Accidental,
  keyFifths = 0
): "♯" | "♭" | "♮" | "" {
  const symbol = accidentalSymbol(pitch, accidental);
  const degree = staffDegreeForPitch(pitch, accidental) % 7;
  const noteAlteration = symbol === "♯" ? 1 : symbol === "♭" ? -1 : 0;
  const keyAlteration = keyAlterationForDegree(keyFifths, degree);
  if (noteAlteration === keyAlteration) return "";
  if (noteAlteration === 0 && keyAlteration !== 0) return "♮";
  return symbol;
}

export function keySignatureName(keyFifths: number): string | undefined {
  return Number.isInteger(keyFifths) && keyFifths >= -7 && keyFifths <= 7
    ? keySignatureNames[keyFifths + 7] : undefined;
}

export function midiToVexKey(pitch: number, accidental?: Accidental): string {
  const names = accidental === "flat" ? flatVexNames : sharpVexNames;
  return `${names[pitchClass(pitch)]}/${Math.floor(pitch / 12) - 1}`;
}

export function staffDegreeForPitch(pitch: number, accidental?: Accidental): number {
  const pitchClassValue = pitchClass(pitch);
  const sharpDegrees = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
  const flatDegrees = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
  const degrees = accidental === "flat" ? flatDegrees : sharpDegrees;
  return (Math.floor(pitch / 12) - 1) * 7 + degrees[pitchClassValue];
}
