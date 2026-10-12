import { buildLyricVideoPlan, type LyricVideoFrame, type LyricVideoPlan } from "../video/lyricVideoPlan";
import type { PracticeAudioInput, PracticeRenderedAudio } from "./practiceAudioTypes";

/** Accompanying scores never replace or shift the main score's lyrics. */
export function buildPracticeLyricVideoPlan(input: PracticeAudioInput, rendered: PracticeRenderedAudio): LyricVideoPlan {
  if (!input.rhythmLayers?.length) {
    return buildLyricVideoPlan(input.title, input.measures, input.bpm, 0, rendered.buffer.duration);
  }
  const frames: LyricVideoFrame[] = [];
  const totalSeconds = rendered.buffer.duration;
  let eventIndex = 0;
  let cursor = 0;
  let hasLyrics = false;
  function addGap(endSeconds: number): void {
    if (endSeconds <= cursor) return;
    frames.push({ startSeconds: cursor, endSeconds, syllables: [], activeSyllable: null, measureIndex: null });
    cursor = endSeconds;
  }
  for (const [measureIndex, measure] of input.measures.entries()) {
    const syllables = measure.notes.filter((note) => note.pitch !== null && note.lyric?.trim())
      .map((note) => note.lyric!.trim());
    hasLyrics ||= syllables.length > 0;
    let lyricIndex = 0;
    for (const note of measure.notes) {
      const event = rendered.timeline.events[eventIndex++];
      if (!event) continue;
      addGap(Math.min(totalSeconds, event.startSeconds));
      const endSeconds = Math.min(totalSeconds, event.endSeconds);
      const activeSyllable = note.pitch !== null && note.lyric?.trim() ? lyricIndex++ : null;
      if (endSeconds > cursor) {
        frames.push({ startSeconds: cursor, endSeconds, syllables, activeSyllable, measureIndex });
        cursor = endSeconds;
      }
    }
  }
  addGap(totalSeconds);
  return { title: input.title.trim() || "나의 노래", frames, hasLyrics };
}
