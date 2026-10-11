import { toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";

export type LyricVideoFrame = Readonly<{
  startSeconds: number;
  endSeconds: number;
  syllables: readonly string[];
  activeSyllable: number | null;
  measureIndex: number | null;
}>;

export type LyricVideoPlan = Readonly<{
  title: string;
  frames: readonly LyricVideoFrame[];
  hasLyrics: boolean;
}>;

export function buildLyricVideoPlan(
  title: string,
  measures: readonly Readonly<{ notes: readonly NoteEvent[] }>[],
  bpm: number,
  introSeconds: number,
  recordingSeconds: number
): LyricVideoPlan {
  const frames: LyricVideoFrame[] = [];
  const totalSeconds = Math.max(0, recordingSeconds);
  let cursor = Math.min(totalSeconds, Math.max(0, introSeconds));

  if (cursor > 0) {
    frames.push({ startSeconds: 0, endSeconds: cursor, syllables: [], activeSyllable: null, measureIndex: null });
  }

  let hasLyrics = false;
  for (const [measureIndex, measure] of measures.entries()) {
    const syllables = measure.notes.filter((note) => note.pitch !== null && note.lyric?.trim())
      .map((note) => note.lyric!.trim());
    hasLyrics ||= syllables.length > 0;
    let lyricIndex = 0;

    for (const note of measure.notes) {
      const duration = Math.max(0, toNumber(note.duration) * 60 / bpm);
      const activeSyllable = note.pitch !== null && note.lyric?.trim() ? lyricIndex++ : null;
      const endSeconds = Math.min(totalSeconds, cursor + duration);
      if (endSeconds > cursor) {
        frames.push({ startSeconds: cursor, endSeconds, syllables, activeSyllable, measureIndex });
      }
      cursor += duration;
    }
  }

  if (cursor < totalSeconds) {
    frames.push({ startSeconds: cursor, endSeconds: totalSeconds, syllables: [], activeSyllable: null, measureIndex: null });
  }

  return { title: title.trim() || "나의 노래", frames, hasLyrics };
}
