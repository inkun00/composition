import type { NoteEvent } from "../music/types";
import { toNumber } from "../music/rational";
import type { MusicVideoScene } from "./musicVideoModel";

export type MusicVideoMeasure = Readonly<{ notes: readonly NoteEvent[]; measureIndex?: number }>;
export type MusicVideoMeasureCue = Readonly<{
  measureIndex: number;
  key: string;
  label: string;
  lyricText: string;
  startSeconds: number;
  endSeconds: number;
}>;

/** Scene boundaries include the entire measure, including rests and instrumental notes. */
export function getMusicVideoMeasures(measures: readonly MusicVideoMeasure[], bpm: number,
  introSeconds = 0): MusicVideoMeasureCue[] {
  let cursor = introSeconds;
  return measures.map((measure, index) => {
    const measureIndex = measure.measureIndex ?? index;
    const lyricText = measure.notes.filter((note) => note.pitch !== null)
      .map((note) => note.lyric?.trim() ?? "").join("");
    const startSeconds = cursor;
    cursor += measure.notes.reduce((sum, note) => sum + Math.max(0, toNumber(note.duration)) * 60 / bpm, 0);
    return { measureIndex, key: String(measureIndex), label: `${measureIndex + 1}마디 · ${lyricText || "(연주)"}`,
      lyricText, startSeconds, endSeconds: cursor };
  });
}

/** Older drawings retain their authored measure when its former lyric note changes. */
export function resolveSceneEndMeasure(scene: MusicVideoScene,
  measures: readonly MusicVideoMeasureCue[]): MusicVideoMeasureCue | null {
  if (scene.section === "intro") return null;
  const measureIndex = scene.endMeasureIndex ?? scene.endLyric?.measureIndex;
  return measures.find((measure) => measure.measureIndex === measureIndex) ?? null;
}
