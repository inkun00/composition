import { createAccompanimentPattern } from "../music/accompaniment";
import { toNumber } from "../music/rational";
import { buildIntroMeasures, buildOutroMeasures, compositionSeconds,
  type AccompanimentOptions, type PlaybackMeasure } from "./accompanimentScore";
import type { KaraokeCountIn, KaraokeHighlight, KaraokeRecordingCallbacks } from "./karaokeTypes";

type Event = Readonly<{ at: number } & (
  { kind: "highlight"; value: KaraokeHighlight } |
  { kind: "phase"; value: "intro" | "song" | "outro" } |
  { kind: "count"; value: number | null } |
  { kind: "status"; value: string }
)>;

/** Prepare UI events before choosing the audio start time; no timers per note. */
export function prepareKaraokeTimeline(measures: readonly PlaybackMeasure[], bpm: number,
  accompaniment: AccompanimentOptions | undefined, countIn: KaraokeCountIn, practice: boolean): readonly Event[] {
  const secondsPerBeat = 60 / bpm;
  const intro = buildIntroMeasures(measures);
  const outro = buildOutroMeasures(measures);
  const introSeconds = compositionSeconds(intro, secondsPerBeat);
  const songSeconds = compositionSeconds(measures, secondsPerBeat);
  const events: Event[] = [
    { at: 0, kind: "phase", value: "intro" },
    { at: 0, kind: "count", value: null },
    { at: 0, kind: "highlight", value: { section: "intro", measureIndex: null, noteId: null } },
    { at: 0, kind: "status", value: "4마디 인트로를 들으며 준비해요. 마지막 카운트 뒤에 시작해요." }
  ];
  function backingHighlights(bars: readonly PlaybackMeasure[], start: number, section: "intro" | "outro") {
    let cursor = start;
    bars.forEach((measure, index) => {
      const beats = measure.notes.reduce((total, note) => total + toNumber(note.duration), 0);
      const chords = measure.chords?.length ? measure.chords : [""];
      const chordBeats = beats / chords.length;
      let eventIndex = 0;
      chords.forEach((_, chordIndex) => {
        for (const event of createAccompanimentPattern(accompaniment?.styleId ?? "arpeggio", chordBeats, accompaniment?.meter)) {
          events.push({ at: cursor + (chordIndex * chordBeats + event.offsetBeats) * secondsPerBeat,
            kind: "highlight", value: { section, measureIndex: index, noteId: `${section}-${index}-${eventIndex++}` } });
        }
      });
      cursor += beats * secondsPerBeat;
    });
  }
  backingHighlights(intro, 0, "intro");
  const countStart = Math.max(0, introSeconds - countIn.beats * countIn.unitBeats * secondsPerBeat);
  for (let count = countIn.beats; count >= 1; count -= 1) {
    events.push({ at: countStart + (countIn.beats - count) * countIn.unitBeats * secondsPerBeat, kind: "count", value: count });
  }
  events.push({ at: introSeconds, kind: "phase", value: "song" },
    { at: introSeconds, kind: "count", value: null },
    { at: introSeconds, kind: "status", value: practice
      ? "메인 가락을 들으며 함께 불러 보세요. 녹음되지는 않아요." : "지금부터 노래를 불러 주세요. 녹음 중이에요." });
  let cursor = introSeconds;
  measures.forEach((measure, index) => {
    for (const note of measure.notes) {
      if (note.pitch !== null) events.push({ at: cursor, kind: "highlight",
        value: { section: "song", measureIndex: measure.measureIndex ?? index, noteId: note.id } });
      cursor += toNumber(note.duration) * secondsPerBeat;
    }
  });
  events.push({ at: introSeconds + songSeconds, kind: "phase", value: "outro" },
    { at: introSeconds + songSeconds, kind: "status", value: practice
      ? "잘했어요! 4마디 아웃트로까지 편하게 들어 보세요." : "노래가 끝났어요. 4마디 아웃트로 반주 뒤 자동 저장돼요." });
  backingHighlights(outro, introSeconds + songSeconds, "outro");
  return events.sort((left, right) => left.at - right.at);
}

/** Follow AudioContext time, including suspension; skip obsolete highlight renders. */
export function startKaraokeClock(context: AudioContext, start: number, duration: number,
  events: readonly Event[], callbacks: KaraokeRecordingCallbacks, onEnd: (completed: boolean) => void): () => void {
  let next = 0;
  let finished = false;
  let timer: number;
  function finish(completed: boolean) {
    if (finished) return;
    finished = true;
    window.clearInterval(timer);
    onEnd(completed);
  }
  function tick() {
    if (context.state === "closed") {
      finish(false);
      return;
    }
    const elapsed = context.currentTime - start;
    let highlight: KaraokeHighlight | undefined;
    while (next < events.length && events[next].at <= elapsed) {
      const event = events[next++];
      if (event.kind === "highlight") highlight = event.value;
      else if (event.kind === "phase") callbacks.onPhase?.(event.value);
      else if (event.kind === "count") callbacks.onCount?.(event.value);
      else callbacks.onStatus?.(event.value);
    }
    if (highlight) callbacks.onHighlight?.(highlight);
    if (elapsed >= duration) finish(true);
  }
  timer = window.setInterval(tick, 30);
  tick();
  return () => finish(false);
}
