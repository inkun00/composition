import type { Meter } from "../music/meter";
import type { NoteEvent } from "../music/types";

export type PracticeAudioMeasure = Readonly<{ notes: readonly NoteEvent[] }>;

export type PracticeAudioInput = Readonly<{
  measures: readonly PracticeAudioMeasure[];
  rhythmLayers?: readonly Readonly<{
    id: string;
    instrumentId: string;
    measures: readonly PracticeAudioMeasure[];
  }>[];
  meter?: Meter;
  bpm: number;
  melodyInstrumentId: string;
  rhythmInstrumentId: string;
  step: "rhythm" | "melody";
  title: string;
}>;

export type PracticeAudioEvent = Readonly<{
  noteId: string;
  pitch: number | null;
  startSeconds: number;
  endSeconds: number;
  linkToNext: boolean;
}>;

export type PracticeTimeline = Readonly<{
  events: readonly PracticeAudioEvent[];
  durationSeconds: number;
}>;

export type PracticeRenderedAudio = Readonly<{
  buffer: AudioBuffer;
  timeline: PracticeTimeline;
  layerTimelines?: readonly PracticeTimeline[];
  usedFallback: boolean;
}>;

export type PracticeAudioTrack = Readonly<{
  instrumentId: string;
  rhythm: boolean;
  timeline: PracticeTimeline;
}>;

export type PracticeAudioPlan = Readonly<{
  timeline: PracticeTimeline;
  tracks: readonly PracticeAudioTrack[];
}>;
