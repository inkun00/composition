import { BEAT_INSTRUMENTS } from "../music/beatInstruments";
import { findInstrument } from "../music/instruments";
import { measureCapacity } from "../music/meter";
import { toNumber } from "../music/rational";
import { buildPracticeAudioPlan } from "./practiceAudioTimeline";
import { practiceAudioScores } from "./practiceAudioScores";
import type { PracticeAudioInput, PracticeRenderedAudio, PracticeTimeline } from "./practiceAudioTypes";
import { PRACTICE_VIDEO_FPS } from "./practiceVideoLayout";
import type {
  PracticeVideoFrame, PracticeVideoMeasure, PracticeVideoNote, PracticeVideoPlan, PracticeVideoTrack
} from "./practiceVideoTypes";

type RenderedTiming = Pick<PracticeRenderedAudio, "timeline" | "layerTimelines"> & Readonly<{
  buffer: Pick<AudioBuffer, "duration">;
}>;

function instrumentName(id: string): string {
  const beatId = id.startsWith("beat:") ? id.slice(5) : id;
  return BEAT_INSTRUMENTS.find((instrument) => instrument.id === beatId)?.name ?? findInstrument(id).name;
}

function mapTrack(
  measures: PracticeAudioInput["measures"], timeline: PracticeTimeline, rhythm: boolean
): PracticeVideoNote[][] {
  let eventIndex = 0;
  return measures.map((measure) => measure.notes.map((note) => {
    const event = timeline.events[eventIndex++];
    if (!event || event.noteId !== note.id) {
      throw new Error("악보와 연주 시간이 달라졌어요. 다시 저장해 주세요.");
    }
    return {
      note,
      startSeconds: event.startSeconds,
      endSeconds: event.endSeconds,
      visualPitch: rhythm ? null : note.pitch,
      rest: note.pitch === null
    };
  }));
}

function videoFrames(measures: readonly PracticeVideoMeasure[], durationSeconds: number): PracticeVideoFrame[] {
  const times = new Set<number>([0, durationSeconds]);
  for (let frame = 1; frame / PRACTICE_VIDEO_FPS < durationSeconds; frame += 1) {
    times.add(frame / PRACTICE_VIDEO_FPS);
  }
  for (const measure of measures) {
    times.add(measure.startSeconds);
    for (const notes of measure.tracks) {
      for (const note of notes) {
        times.add(note.startSeconds);
        times.add(note.endSeconds);
      }
    }
  }
  const sortedTimes = [...times].filter((time) => time >= 0 && time <= durationSeconds)
    .sort((left, right) => left - right);
  const boundaries: number[] = [];
  for (const time of sortedTimes) {
    const previous = boundaries.at(-1);
    if (previous === undefined || time - previous > 0.000001) boundaries.push(time);
    // Keep the later timestamp so floating-point rounding never highlights the
    // preceding note for an extra frame at an almost-equal frame boundary.
    else if (boundaries.length > 1) boundaries[boundaries.length - 1] = time;
  }
  return boundaries.slice(0, -1).map((startSeconds, index) => ({
    startSeconds,
    endSeconds: boundaries[index + 1],
    measureIndex: practiceVideoMeasureAtTime(measures, startSeconds).index
  }));
}

export function practiceVideoMeasureAtTime(
  measures: readonly PracticeVideoMeasure[], seconds: number
): PracticeVideoMeasure {
  const active = measures.find((measure) => seconds >= measure.startSeconds && seconds < measure.endSeconds);
  return active ?? measures[measures.length - 1];
}

/** The rendered timelines, including rests and silent layer gaps, are authoritative. */
export function buildPracticeVideoPlan(input: PracticeAudioInput, rendered: RenderedTiming): PracticeVideoPlan {
  const meter = input.meter ?? { beats: 4, beatUnit: 4 };
  const durationSeconds = rendered.buffer.duration;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("연주 길이를 확인한 뒤 다시 저장해 주세요.");
  }
  const scores = practiceAudioScores(input).map((score, index) => ({
    ...score,
    timeline: index === 0 ? rendered.timeline : rendered.layerTimelines?.[index - 1]
  }));
  const tracks: PracticeVideoTrack[] = scores.map((score) => ({
    id: score.id,
    instrumentId: score.instrumentId,
    instrumentName: instrumentName(score.instrumentId),
    rhythm: score.rhythm
  }));
  const notesByTrack = scores.map((score) => {
    if (!score.timeline) throw new Error("함께 연주할 악보의 시간이 없어요. 다시 저장해 주세요.");
    return mapTrack(score.measures, score.timeline, score.rhythm);
  });
  const measures: PracticeVideoMeasure[] = [];
  const barCount = Math.max(...scores.map((score) => score.measures.length));
  const barSeconds = toNumber(measureCapacity(meter)) * 60 / input.bpm;
  let startSeconds = 0;
  for (let index = 0; index < barCount && startSeconds < durationSeconds; index += 1) {
    const trackNotes = notesByTrack.map((notes) => notes[index] ?? []);
    const eventStarts = trackNotes.flatMap((notes) => notes.length ? [notes[0].startSeconds] : []);
    if (eventStarts.length) startSeconds = Math.min(...eventStarts);
    const lastNoteEnd = Math.max(startSeconds, ...trackNotes.flatMap((notes) => notes.map((note) => note.endSeconds)));
    const followingStarts = notesByTrack.flatMap((notes) => notes[index + 1]?.length
      ? [notes[index + 1][0].startSeconds] : []);
    const nextStart = scores.length === 1 ? lastNoteEnd : Math.max(lastNoteEnd, startSeconds + barSeconds);
    const endSeconds = Math.min(durationSeconds, followingStarts.length ? Math.min(...followingStarts) : nextStart);
    if (endSeconds > startSeconds) measures.push({ index, startSeconds, endSeconds, tracks: trackNotes });
    startSeconds = nextStart;
  }
  if (!measures.length) throw new Error("영상에 표시할 음표를 먼저 넣어 주세요.");
  // AudioBuffer rounds its length to an integral sample. Keep its final fraction.
  const final = measures[measures.length - 1];
  measures[measures.length - 1] = { ...final, endSeconds: durationSeconds };
  return {
    title: input.title.trim() || "나의 연습 가락",
    bpm: input.bpm,
    meter,
    durationSeconds,
    tracks,
    measures,
    frames: videoFrames(measures, durationSeconds)
  };
}

/** Saving-panel preview uses the same timing plan without preparing instrument samples. */
export function buildPracticeVideoPreviewPlan(input: PracticeAudioInput): PracticeVideoPlan {
  const audioPlan = buildPracticeAudioPlan(input);
  return buildPracticeVideoPlan(input, {
    timeline: audioPlan.timeline,
    layerTimelines: audioPlan.tracks.slice(1).map((track) => track.timeline),
    buffer: { duration: audioPlan.timeline.durationSeconds }
  });
}
