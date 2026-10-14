import { measureCapacity } from "../music/meter";
import { compare, subtract, sum, toNumber } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { practiceAudioScores } from "./practiceAudioScores";
import type {
  PracticeAudioEvent,
  PracticeAudioInput,
  PracticeAudioPlan,
  PracticeRenderedAudio,
  PracticeTimeline
} from "./practiceAudioTypes";

function selectedScore(
  input: PracticeAudioInput,
  scoreIndex: number
) {
  const lastScoreIndex = input.mode === "melody" ? 0 : input.rhythmLayers?.length ?? 0;
  if (!Number.isInteger(scoreIndex) || scoreIndex < 0 || scoreIndex > lastScoreIndex) {
    throw new Error("미리 들을 악보를 다시 골라 주세요.");
  }
  const layer = scoreIndex === 0 ? null : input.rhythmLayers![scoreIndex - 1];
  return layer;
}

/** Preview the selected score, including its paired rhythm in the combined mode. */
export function practiceScoreAudioInput(input: PracticeAudioInput, scoreIndex = 0): PracticeAudioInput {
  const layer = selectedScore(input, scoreIndex);
  const measures = layer?.measures ?? input.measures;
  if (!measures.some((measure) => measure.notes.some((note) => note.pitch !== null))) {
    throw new Error(`악보${scoreIndex + 1}에 소리 나는 음표를 한 개 이상 넣은 뒤 미리 들어 보세요.`);
  }
  const capacity = measureCapacity(input.meter ?? { beats: 4, beatUnit: 4 });
  if (!Number.isFinite(toNumber(capacity)) || toNumber(capacity) <= 0) {
    throw new Error("박자표를 올바르게 정한 뒤 다시 시도해 주세요.");
  }
  return {
    ...input,
    measures: measures.map((measure) => {
      for (const note of measure.notes) noteBeats(note);
      const used = sum(measure.notes.map((note) => note.duration));
      if (compare(used, capacity) >= 0) return measure;
      // A playback-only rest has no UI note ID, so silent gaps stay unhighlighted.
      return { notes: [...measure.notes, { id: "", pitch: null, duration: subtract(capacity, used) }] };
    }),
    rhythmLayers: undefined,
    rhythmInstrumentId: layer?.instrumentId ?? input.rhythmInstrumentId,
    mode: layer ? "rhythm" : input.mode,
    step: layer ? "rhythm" : input.step
  };
}

/** Preview one bar of the selected score, including a paired rhythm if selected. */
export function practiceMeasureAudioInput(
  input: PracticeAudioInput,
  index: number,
  scoreIndex = 0
): PracticeAudioInput {
  const layer = selectedScore(input, scoreIndex);
  const measures = layer?.measures ?? input.measures;
  if (!Number.isInteger(index) || index < 0 || index >= measures.length) {
    throw new Error("미리 들을 마디를 다시 골라 주세요.");
  }
  const measure = measures[index];
  if (!measure.notes.some((note) => note.pitch !== null)) {
    throw new Error(`${index + 1}마디에 소리 나는 음표를 한 개 이상 넣은 뒤 미리 들어 보세요.`);
  }
  return {
    ...input,
    measures: [measure],
    rhythmLayers: undefined,
    rhythmInstrumentId: layer?.instrumentId ?? input.rhythmInstrumentId,
    mode: layer ? "rhythm" : input.mode,
    step: layer ? "rhythm" : input.step
  };
}

function noteBeats(note: NoteEvent): number {
  const beats = toNumber(note.duration);
  if (!Number.isFinite(beats) || beats <= 0) {
    throw new Error("음표 길이를 올바르게 정한 뒤 다시 시도해 주세요.");
  }
  if (note.pitch !== null && (!Number.isFinite(note.pitch) || note.pitch < 0 || note.pitch > 127)) {
    throw new Error("음표의 높이를 다시 골라 주세요.");
  }
  return beats;
}

function appendEvents(
  events: PracticeAudioEvent[],
  notes: readonly NoteEvent[],
  startSeconds: number,
  input: PracticeAudioInput,
  rhythm: boolean,
  followingNote?: NoteEvent
): number {
  let cursor = startSeconds;
  for (const [index, note] of notes.entries()) {
    const endSeconds = cursor + noteBeats(note) * 60 / input.bpm;
    const next = notes[index + 1] ?? followingNote;
    events.push({
      noteId: note.id,
      pitch: note.pitch === null ? null : rhythm ? 72 : note.pitch,
      startSeconds: cursor,
      endSeconds,
      // A slur between different pitches remains two rhythm attacks at C5.
      linkToNext: Boolean(note.linkToNext && next?.pitch === note.pitch)
    });
    cursor = endSeconds;
  }
  return cursor;
}

/** Scores share bar starts, while the final bar ends at the last entered note. */
export function buildPracticeAudioPlan(input: PracticeAudioInput): PracticeAudioPlan {
  if (!Number.isFinite(input.bpm) || input.bpm <= 0) {
    throw new Error("빠르기를 올바르게 정한 뒤 다시 시도해 주세요.");
  }
  if (input.mode !== "melody" && (input.rhythmLayers?.length ?? 0) > 2) {
    throw new Error("리듬 악보는 세 개까지 함께 연주할 수 있어요.");
  }
  const scores = practiceAudioScores(input);
  const events = scores.map(() => [] as PracticeAudioEvent[]);
  let durationSeconds = 0;
  if (scores.length === 1) {
    durationSeconds = appendEvents(events[0], input.measures.flatMap((measure) => [...measure.notes]), 0, input, scores[0].rhythm);
  } else {
    const meter = input.meter ?? { beats: 4, beatUnit: 4 };
    const capacity = toNumber(measureCapacity(meter));
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error("박자표를 올바르게 정한 뒤 다시 시도해 주세요.");
    }
    const barCount = Math.max(...scores.map((score) => score.measures.length));
    let barStart = 0;
    for (let index = 0; index < barCount; index += 1) {
      let barEnd = barStart;
      for (const [scoreIndex, score] of scores.entries()) {
        const notes = score.measures[index]?.notes ?? [];
        const end = appendEvents(events[scoreIndex], notes, barStart, input, score.rhythm, score.measures[index + 1]?.notes[0]);
        barEnd = Math.max(barEnd, end);
        if (notes.length > 0) durationSeconds = Math.max(durationSeconds, end);
      }
      // An overflowing bar expands for every score, so the next bar stays aligned.
      barStart = Math.max(barEnd, barStart + capacity * 60 / input.bpm);
    }
  }
  if (!events.some((scoreEvents) => scoreEvents.some((event) => event.pitch !== null))) {
    throw new Error("음표를 한 개 이상 넣은 뒤 미리듣거나 저장해 주세요.");
  }
  if (!Number.isFinite(durationSeconds) || durationSeconds > 600) {
    throw new Error("연습 곡은 10분 안으로 만들어 주세요. 마디와 빠르기를 확인해 주세요.");
  }
  const tracks = scores.map((score, index) => ({
    instrumentId: score.instrumentId,
    rhythm: score.rhythm,
    timeline: { events: events[index], durationSeconds }
  }));
  return { timeline: tracks[0].timeline, tracks };
}

/** The main score remains the source of lyrics and the primary highlight. */
export function buildPracticeTimeline(input: PracticeAudioInput): PracticeTimeline {
  return buildPracticeAudioPlan(input).timeline;
}

export function practiceNoteAtTime(timeline: PracticeTimeline, seconds: number): string | null {
  return timeline.events.find((event) => seconds >= event.startSeconds && seconds < event.endSeconds)?.noteId || null;
}

export function practiceNotesAtTime(rendered: PracticeRenderedAudio, seconds: number): string[] {
  const ids = [rendered.timeline, ...(rendered.layerTimelines ?? [])]
    .map((timeline) => practiceNoteAtTime(timeline, seconds))
    .filter((id): id is string => id !== null);
  return [...new Set(ids)];
}
