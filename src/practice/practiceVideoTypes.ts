import type { Meter } from "../music/meter";
import type { NoteEvent } from "../music/types";

export type PracticeVideoMode = "bars" | "score";

export type PracticeVideoNote = Readonly<{
  note: NoteEvent;
  startSeconds: number;
  endSeconds: number;
  /** Rhythm scores have no melodic pitch, even when their audio uses C5. */
  visualPitch: number | null;
  rest: boolean;
}>;

export type PracticeVideoMeasure = Readonly<{
  index: number;
  startSeconds: number;
  endSeconds: number;
  tracks: readonly (readonly PracticeVideoNote[])[];
}>;

export type PracticeVideoTrack = Readonly<{
  id: string;
  instrumentId: string;
  instrumentName: string;
  rhythm: boolean;
}>;

export type PracticeVideoFrame = Readonly<{
  startSeconds: number;
  endSeconds: number;
  measureIndex: number;
}>;

export type PracticeVideoPlan = Readonly<{
  title: string;
  bpm: number;
  meter: Meter;
  durationSeconds: number;
  tracks: readonly PracticeVideoTrack[];
  measures: readonly PracticeVideoMeasure[];
  frames: readonly PracticeVideoFrame[];
}>;

export type PracticeVideoRenderer = Readonly<{
  canvas: HTMLCanvasElement;
  draw: (seconds: number) => void;
}>;
