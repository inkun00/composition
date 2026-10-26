import { describe, expect, it, vi } from "vitest";
import type { AccompanimentOptions, PlaybackMeasure } from "../audio/accompanimentScore";
import type { NoteEvent } from "../music/types";
import { buildLyricVideoPlan, type LyricVideoPlan } from "./lyricVideoPlan";
import { buildRecordedMusicVideoPlan, matchingMusicVideoRecording } from "./musicVideoRecording";

type SongSource = Readonly<{
  title: string;
  measures: readonly PlaybackMeasure[];
  bpm: number;
  instrumentId: string;
  accompaniment: AccompanimentOptions;
}>;

function source(): SongSource {
  return {
    title: "우리 노래", bpm: 120, instrumentId: "flute",
    measures: [{ harmony: "home", chords: ["C"], measureIndex: 0,
      effects: [{ id: "effect-1", effectId: "bird", offsetBeats: 1 }], notes: [
        { id: "first", pitch: 60, lyric: "우", duration: { numerator: 1, denominator: 1 } },
        { id: "last", pitch: 62, lyric: "리", duration: { numerator: 1, denominator: 1 } }
      ] }],
    accompaniment: {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"],
      meter: { beats: 4, beatUnit: 4 }, beatVolume: 100,
      beatPattern: [{ id: "beat-1", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 }],
      trackMix: { acoustic_guitar_steel: { volume: 80, muted: false } }
    }
  };
}

function register(song: SongSource): LyricVideoPlan {
  return buildRecordedMusicVideoPlan(song.title, song.measures, song.bpm, song.instrumentId,
    song.accompaniment, 2, 5);
}

function match(song: SongSource, plan: LyricVideoPlan | null, audioUrl = "blob:recording") {
  return matchingMusicVideoRecording(audioUrl, plan, song.measures, song.bpm, song.instrumentId, song.accompaniment);
}

function changeNote(song: SongSource, patch: Partial<NoteEvent>): SongSource {
  return { ...song, measures: song.measures.map((measure) => ({ ...measure,
    notes: measure.notes.map((note, index) => index === 0 ? { ...note, ...patch } : note) })) };
}

const changes: readonly (readonly [string, (song: SongSource) => SongSource])[] = [
  ["음높이", (song) => changeNote(song, { pitch: 65 })],
  ["리듬", (song) => changeNote(song, { duration: { numerator: 2, denominator: 1 } })],
  ["가사", (song) => changeNote(song, { lyric: "나" })],
  ["빠르기", (song) => ({ ...song, bpm: 96 })],
  ["가락 악기", (song) => ({ ...song, instrumentId: "violin" })],
  ["화음", (song) => ({ ...song, measures: song.measures.map((measure) => ({ ...measure, chords: ["G7"] })) })],
  ["화성 역할", (song) => ({ ...song, measures: song.measures.map((measure) => ({ ...measure, harmony: "journey" })) })],
  ["효과음", (song) => ({ ...song, measures: song.measures.map((measure) => ({ ...measure,
    effects: [{ id: "effect-1", effectId: "bird", offsetBeats: 0 }] })) })],
  ["반주 스타일", (song) => ({ ...song, accompaniment: { ...song.accompaniment, styleId: "arpeggio" } })],
  ["반주 악기", (song) => ({ ...song, accompaniment: { ...song.accompaniment, instrumentIds: ["clarinet"] } })],
  ["반주 음량", (song) => ({ ...song, accompaniment: { ...song.accompaniment,
    trackMix: { acoustic_guitar_steel: { volume: 20, muted: false } } } })],
  ["반주 음소거", (song) => ({ ...song, accompaniment: { ...song.accompaniment,
    trackMix: { acoustic_guitar_steel: { volume: 80, muted: true } } } })],
  ["반주 솔로", (song) => ({ ...song, accompaniment: { ...song.accompaniment, soloInstrumentId: "acoustic_guitar_steel" } })],
  ["타악기 리듬", (song) => ({ ...song, accompaniment: { ...song.accompaniment,
    beatPattern: [{ id: "beat-1", instrumentId: "kick", measureIndex: 0, offsetBeats: 1 }] } })],
  ["타악기 음량", (song) => ({ ...song, accompaniment: { ...song.accompaniment, beatVolume: 50 } })],
  ["박자표", (song) => ({ ...song, accompaniment: { ...song.accompaniment, meter: { beats: 3, beatUnit: 4 } } })]
];

describe("현재 곡과 녹음의 뮤직비디오 연결", () => {
  it("같은 곡은 녹음을 연결하고 후처리로 URL이 바뀌어도 같은 타이밍을 사용한다", () => {
    const song = source();
    const plan = register(song);
    expect(match(song, plan)).toEqual({ audioUrl: "blob:recording", plan });
    expect(match(song, plan, "blob:processed-vocals")).toEqual({ audioUrl: "blob:processed-vocals", plan });
    expect(plan.frames[0]).toMatchObject({ startSeconds: 0, endSeconds: 2, measureIndex: null });
    expect(plan.frames.at(-1)?.endSeconds).toBe(5);
  });

  it.each(changes)("녹음 후 %s 변경은 이전 노래의 음성 사용을 막는다", (_label, change) => {
    const song = source();
    const plan = register(song);
    expect(match(change(song), plan)).toBeUndefined();
    expect(match(song, plan)?.plan).toBe(plan);
  });

  it("제목과 화면 상태 콜백이 바뀌어도 음악이 같으면 녹음을 유지한다", () => {
    const song = source();
    const oldCallback = vi.fn();
    const newCallback = vi.fn();
    const plan = register({ ...song, accompaniment: { ...song.accompaniment, onTrackState: oldCallback } });
    const metadata = { ...song, title: "새 제목", measures: song.measures.map((measure) => ({ ...measure,
      candidateName: "새 표시 이름", description: "새 화면 설명" })),
    accompaniment: { ...song.accompaniment, onTrackState: newCallback } };
    expect(match(metadata, plan)).toEqual({ audioUrl: "blob:recording", plan });
    expect(oldCallback).not.toHaveBeenCalled();
    expect(newCallback).not.toHaveBeenCalled();
  });

  it("등록되지 않은 동일 내용의 가사 계획과 복사한 계획을 녹음으로 신뢰하지 않는다", () => {
    const song = source();
    const plan = register(song);
    const arbitrary = buildLyricVideoPlan(song.title, song.measures, song.bpm, 2, 5);
    expect(arbitrary).toEqual(plan);
    expect(match(song, arbitrary)).toBeUndefined();
    expect(match(song, { ...plan })).toBeUndefined();
    expect(match(song, null)).toBeUndefined();
    expect(match(song, plan, "")).toBeUndefined();
  });

  it("등록 뒤 원본 악보가 바뀌어도 기록 당시의 스냅샷을 유지한다", () => {
    const song = source();
    const plan = register(song);
    const note = song.measures[0].notes[0] as { pitch: number };
    note.pitch = 70;
    expect(match(song, plan)).toBeUndefined();
    expect(match(source(), plan)?.plan).toBe(plan);
  });
});
