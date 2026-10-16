import { lyricSyllables, type PracticeMeasure } from "./practiceModel";

/** Keep the unplaced syllables accurate even when a middle note is deleted. */
export function unassignedLyricSyllables(measure: PracticeMeasure): string[] {
  const assigned = new Map<string, number>();
  for (const note of measure.notes) {
    if (note.pitch === null) continue;
    for (const syllable of lyricSyllables(note.lyric ?? "")) {
      assigned.set(syllable, (assigned.get(syllable) ?? 0) + 1);
    }
  }
  return lyricSyllables(measure.lyric).filter((syllable) => {
    const count = assigned.get(syllable) ?? 0;
    if (count === 0) return true;
    assigned.set(syllable, count - 1);
    return false;
  });
}
