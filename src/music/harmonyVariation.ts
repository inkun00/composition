import { chordPitchClasses } from "./chord";

export type HarmonyVariation = Readonly<{
  shapeShift: number;
  rhythmShift: number;
  contourBend: number;
}>;

// The root, chord colour and movement to the next chord all affect the
// melody's shape and beat pattern. This keeps the same story role from
// producing the same tune over every harmony.
export function harmonyVariation(chords: readonly string[]): HarmonyVariation {
  if (chords.length === 0) return { shapeShift: 0, rhythmShift: 0, contourBend: 0 };

  const first = chordPitchClasses(chords[0]);
  const root = first[0];
  const colour = ((first[1] ?? root) - root + 12) % 12;
  const nextRoot = chordPitchClasses(chords[1] ?? chords[0])[0];
  const upward = (nextRoot - root + 12) % 12;
  const movement = upward > 6 ? upward - 12 : upward;
  const extraTones = Math.max(0, first.length - 3);

  return {
    shapeShift: (root + colour * 2 + Math.abs(movement) + extraTones * 3) % 12,
    rhythmShift: (root * 2 + colour + Math.abs(movement) * 3 + extraTones * 5) % 12,
    contourBend: movement > 0 ? 2 : movement < 0 ? -2 : colour === 3 ? -1 : extraTones > 0 ? 2 : 1
  };
}

export function colourContour(contour: readonly number[], bend: number): readonly number[] {
  return contour.map((offset, index) =>
    offset === -99 || index === 0 ? offset : offset + (index % 3 === 1 ? bend : 0));
}
