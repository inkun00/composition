import type { PublishedSong } from "../firebase/communityAlbums";
import { measureCapacity } from "../music/meter";
import { toNumber } from "../music/rational";

export type PublishedPlaybackPosition = Readonly<{
  measureIndex: number;
  noteId: string | null;
}>;

function measureBeats(song: PublishedSong, measureIndex: number): number {
  const notes = song.draft.measures[measureIndex]?.notes;
  if (!notes?.length) return toNumber(measureCapacity(song.draft.meter));
  return notes.reduce((total, note) => total + toNumber(note.duration), 0);
}

export function publishedPlaybackDurationMs(song: PublishedSong): number {
  const millisecondsPerBeat = 60_000 / Math.max(1, song.draft.bpm ?? 96);
  return song.draft.measures.reduce(
    (total, _, measureIndex) => total + measureBeats(song, measureIndex) * millisecondsPerBeat,
    0
  );
}

export function publishedPlaybackPosition(
  song: PublishedSong,
  startedAt: number | null,
  now = Date.now()
): PublishedPlaybackPosition | null {
  if (startedAt === null || now < startedAt) return null;
  const millisecondsPerBeat = 60_000 / Math.max(1, song.draft.bpm ?? 96);
  let elapsedBeats = (now - startedAt) / millisecondsPerBeat;

  for (let measureIndex = 0; measureIndex < song.draft.measures.length; measureIndex += 1) {
    const duration = measureBeats(song, measureIndex);
    if (elapsedBeats >= duration) {
      elapsedBeats -= duration;
      continue;
    }

    const notes = song.draft.measures[measureIndex]?.notes ?? [];
    let noteCursor = 0;
    for (const note of notes) {
      noteCursor += toNumber(note.duration);
      if (elapsedBeats < noteCursor) {
        return { measureIndex, noteId: note.pitch === null ? null : note.id };
      }
    }
    return { measureIndex, noteId: null };
  }
  return null;
}

export function publishedPlaybackMeasureIndex(
  song: PublishedSong,
  startedAt: number | null,
  now = Date.now()
): number | null {
  return publishedPlaybackPosition(song, startedAt, now)?.measureIndex ?? null;
}
