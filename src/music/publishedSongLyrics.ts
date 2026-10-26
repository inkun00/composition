import { compositionFromDraft } from "./composerDraft";
import type { SavedDraft } from "./draft";
import { findHarmonyPreset } from "./harmonyPresets";
import { toNumber } from "./rational";

export type PublishedSongLyricSegment = Readonly<{
  noteId: string;
  noteIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
}>;

export type PublishedSongLyricLine = Readonly<{
  measureIndex: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  segments: readonly PublishedSongLyricSegment[];
}>;

export type PublishedSongLyrics = Readonly<{
  lines: readonly PublishedSongLyricLine[];
  /** Score time only; the playback engine owns its scheduling lead and release tail. */
  durationSeconds: number;
  hasLyrics: boolean;
}>;

export type PublishedSongLyricPosition = Readonly<{
  measureIndex: number;
  /** Index within that line's segments, or null during a rest or an unvoiced note. */
  activeSegmentIndex: number | null;
}>;

/** Build the same note timing and legacy lyric assignment used by album playback. */
export function buildPublishedSongLyrics(
  input: SavedDraft | Readonly<{ draft: SavedDraft }>
): PublishedSongLyrics {
  const draft = "draft" in input ? input.draft : input;
  const composition = compositionFromDraft(draft, findHarmonyPreset(draft.presetId));
  const secondsPerBeat = 60 / (draft.bpm ?? 96);
  let cursor = 0;
  let hasLyrics = false;

  const lines = composition.map((measure, measureIndex): PublishedSongLyricLine => {
    const startSeconds = cursor;
    const segments: PublishedSongLyricSegment[] = [];
    let noteCursor = 0;

    (measure.notes ?? []).forEach((note, noteIndex) => {
      const durationBeats = toNumber(note.duration);
      const text = note.pitch === null ? "" : (note.lyric ?? "").replace(/\s+/g, " ");
      if (text) {
        segments.push({
          noteId: note.id,
          noteIndex,
          text,
          startSeconds: startSeconds + noteCursor * secondsPerBeat,
          endSeconds: startSeconds + (noteCursor + durationBeats) * secondsPerBeat
        });
        hasLyrics ||= Boolean(text.trim());
      }
      noteCursor += durationBeats;
    });

    // The audio scheduler also sums every note, including rests and notes without lyrics.
    cursor += noteCursor * secondsPerBeat;
    return {
      measureIndex,
      text: segments.map((segment) => segment.text).join(""),
      startSeconds,
      endSeconds: cursor,
      segments
    };
  });

  return { lines, durationSeconds: cursor, hasLyrics };
}

/** Half-open ranges make an exact boundary belong to the next note or measure. */
export function findPublishedSongLyricPosition(
  lyrics: PublishedSongLyrics,
  elapsedSeconds: number
): PublishedSongLyricPosition | null {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0 || elapsedSeconds >= lyrics.durationSeconds) {
    return null;
  }
  const line = lyrics.lines.find((item) =>
    elapsedSeconds >= item.startSeconds && elapsedSeconds < item.endSeconds);
  if (!line) return null;
  const segmentIndex = line.segments.findIndex((segment) =>
    Boolean(segment.text.trim()) && elapsedSeconds >= segment.startSeconds && elapsedSeconds < segment.endSeconds);
  return { measureIndex: line.measureIndex, activeSegmentIndex: segmentIndex < 0 ? null : segmentIndex };
}
