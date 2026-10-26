import { staffDegreeForPitch } from "../music/accidental";
import type { NoteEvent } from "../music/types";

// The practice staff leaves room for C6 and its selection target above the staff.
export const expandedStaveY = 40;
export const expandedStaffLines = [64, 76, 88, 100, 112] as const;
const expandedStaffStep = 6;
const e4StaffDegree = 4 * 7 + 2;
const naturalPitchClasses = [0, 2, 4, 5, 7, 9, 11];

function naturalPitchForDegree(degree: number): number {
  const octave = Math.floor(degree / 7);
  const letter = ((degree % 7) + 7) % 7;
  return (octave + 1) * 12 + naturalPitchClasses[letter];
}

export function expandedStaffNoteY(pitch: number, accidental?: NoteEvent["accidental"]): number {
  return expandedStaffLines[4] - (staffDegreeForPitch(pitch, accidental) - e4StaffDegree) * expandedStaffStep;
}

export function expandedStaffLedgerLines(pitch: number, accidental?: NoteEvent["accidental"]): number[] {
  const noteY = expandedStaffNoteY(pitch, accidental);
  const [top] = expandedStaffLines;
  const bottom = expandedStaffLines[4];
  const lines: number[] = [];
  for (let y = top - 12; y >= noteY; y -= 12) lines.push(y);
  for (let y = bottom + 12; y <= noteY; y += 12) lines.push(y);
  return lines;
}

export function pitchAfterStaffDrag(
  pitch: number,
  viewBoxDeltaY: number,
  notationScale: number,
  accidental?: NoteEvent["accidental"]
): number {
  const startDegree = staffDegreeForPitch(pitch, accidental);
  const degreeDelta = Math.round(-viewBoxDeltaY / (expandedStaffStep * notationScale));
  // Retain a sharp/flat while following the actual staff lines and spaces.
  const alteration = pitch - naturalPitchForDegree(startDegree);
  return Math.max(48, Math.min(84, naturalPitchForDegree(startDegree + degreeDelta) + alteration));
}
