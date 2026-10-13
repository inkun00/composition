// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import { buildPracticeAudioPlan } from "./practiceAudioTimeline";
import type { PracticeAudioInput } from "./practiceAudioTypes";
import { practiceVideoNotation } from "./practiceVideoNotation";
import { buildPracticeVideoPlan, buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";

function note(id: string, beats: number, pitch: number | null = 60, lyric?: string): NoteEvent {
  return { id, pitch, duration: rational(beats * 8, 8), lyric };
}

const input: PracticeAudioInput = {
  measures: [{ notes: [note("main-a", 1, 60, "봄")] }, { notes: [note("main-b", 1, 64, "날")] }],
  rhythmLayers: [
    { id: "layer-b", instrumentId: "clarinet", measures: [
      { notes: [note("b-a", 0.5, 62, "반"), note("b-rest", 0.5, null)] },
      { notes: [note("b-c", 1)] }
    ] },
    { id: "layer-c", instrumentId: "beat:woodblock", measures: [
      { notes: [note("c-a", 0.5), note("c-b", 0.5)] }, { notes: [] }
    ] }
  ],
  meter: { beats: 4, beatUnit: 4 },
  bpm: 120,
  step: "melody",
  melodyInstrumentId: "flute",
  rhythmInstrumentId: "piano",
  title: "봄날"
};

function renderedTiming(settings = input, extraSampleSeconds = 0) {
  const plan = buildPracticeAudioPlan(settings);
  return {
    timeline: plan.timeline,
    layerTimelines: plan.tracks.slice(1).map((track) => track.timeline),
    buffer: { duration: plan.timeline.durationSeconds + extraSampleSeconds }
  };
}

describe("연습 영상의 실제 연주 시간과 악보", () => {
  it("세 악보의 음표와 쉼표, 별도 가사를 보존하며 공통 마디 시작과 빈 박자를 유지한다", () => {
    const plan = buildPracticeVideoPlan(input, renderedTiming());
    expect(plan.durationSeconds).toBe(2.5);
    expect(plan.measures.map((measure) => [measure.startSeconds, measure.endSeconds])).toEqual([[0, 2], [2, 2.5]]);
    expect(plan.tracks.map((track) => [track.instrumentName, track.rhythm])).toEqual([
      ["플루트", false], ["클라리넷", true], ["나무블록", true]
    ]);
    expect(plan.measures[0].tracks[0][0]).toMatchObject({ visualPitch: 60, startSeconds: 0, endSeconds: 0.5 });
    expect(plan.measures[1].tracks[0][0]).toMatchObject({ visualPitch: 64, startSeconds: 2, endSeconds: 2.5 });
    expect(plan.measures[0].tracks[1][1]).toMatchObject({ rest: true, startSeconds: 0.25, endSeconds: 0.5 });
    expect(plan.measures[0].tracks[0][0].note.lyric).toBe("봄");
    expect(plan.measures[1].tracks[0][0].note.lyric).toBe("날");
    expect(plan.measures[0].tracks[1][0].note.lyric).toBe("반");
    expect(plan.frames.some((frame) => frame.startSeconds === 0.25)).toBe(true);
    expect(plan.frames.some((frame) => frame.startSeconds === 0.5)).toBe(true);
    expect(plan.frames.filter((frame) => frame.startSeconds >= 0.5 && frame.startSeconds < 2)
      .every((frame) => frame.measureIndex === 0)).toBe(true);
  });

  it("리듬의 막대 높이는 중립으로 표시하며 악보용 원래 음높이는 C5 오디오와 구분한다", () => {
    const settings = { ...input, step: "rhythm" as const };
    const rendered = renderedTiming(settings);
    expect(rendered.timeline.events[0].pitch).toBe(72);
    const plan = buildPracticeVideoPlan(settings, rendered);
    expect(plan.measures[0].tracks[0][0].visualPitch).toBeNull();
    expect(plan.measures[0].tracks[0][0].note.pitch).toBe(60);
    expect(plan.measures[0].tracks[1][0].visualPitch).toBeNull();
    expect(plan.measures[0].tracks[1][0].note.pitch).toBe(62);
  });

  it("가사 없는 곡의 뒤 쉼표와 마지막 오디오 샘플 길이도 영상에 포함한다", () => {
    const settings = { ...input, rhythmLayers: undefined, measures: [
      { notes: [note("sound", 0.5), note("rest", 0.5, null)] }
    ] };
    const duration = 0.5000001;
    const plan = buildPracticeVideoPlan(settings, { ...renderedTiming(settings), buffer: { duration } });
    expect(plan.frames.at(-1)?.endSeconds).toBe(duration);
    expect(plan.frames[0].startSeconds).toBe(0);
    expect(plan.frames.every((frame, index) => index === 0 || frame.startSeconds === plan.frames[index - 1].endSeconds)).toBe(true);
    expect(plan.measures[0].tracks[0][1].rest).toBe(true);
    expect(plan.measures[0].endSeconds).toBe(duration);
  });

  it("6/8과 중간 빈 마디는 시간에 맞춰 표시하고 마지막 빈 마디는 늘리지 않는다", () => {
    const settings = {
      ...input,
      meter: { beats: 6, beatUnit: 8 } as const,
      measures: [{ notes: [note("start", 1)] }, { notes: [] }, { notes: [note("later", 1)] }, { notes: [] }],
      rhythmLayers: [{ ...input.rhythmLayers![0], measures: [{ notes: [] }, { notes: [] }, { notes: [] }, { notes: [] }] }]
    };
    const plan = buildPracticeVideoPlan(settings, renderedTiming(settings));
    expect(plan.durationSeconds).toBe(3.5);
    expect(plan.measures.map((measure) => [measure.index, measure.startSeconds, measure.endSeconds]))
      .toEqual([[0, 0, 1.5], [1, 1.5, 3], [2, 3, 3.5]]);
  });

  it("초과 박자로 늘어난 공통 마디와 짧은 레이어 음표의 경계를 반영한다", () => {
    const settings = { ...input, measures: [{ notes: [note("over", 5)] }, input.measures[1]] };
    const plan = buildPracticeVideoPlan(settings, renderedTiming(settings));
    expect(plan.measures[1].startSeconds).toBe(2.5);
    expect(plan.frames.some((frame) => frame.startSeconds === 0.25)).toBe(true);
    expect(plan.frames.at(-1)?.endSeconds).toBe(3);
  });

  it("미리보기는 샘플 렌더 없이 내보내기와 같은 악보 시간 모델을 사용한다", () => {
    expect(buildPracticeVideoPreviewPlan(input)).toEqual(buildPracticeVideoPlan(input, renderedTiming()));
  });

  it("정규 프레임과 거의 같은 음표 시작은 반올림 때문에 다음 프레임까지 늦춰지지 않는다", () => {
    const settings = { ...input, bpm: 150, rhythmLayers: undefined, measures: [{ notes: [
      note("a", 0.5), note("b", 0.5), note("c", 0.5), note("d", 0.5)
    ] }] };
    const timing = renderedTiming(settings);
    const lastStart = timing.timeline.events[3].startSeconds;
    expect(lastStart).toBeGreaterThan(0.6);
    const plan = buildPracticeVideoPlan(settings, timing);
    expect(plan.frames.some((frame) => frame.startSeconds === lastStart)).toBe(true);
    expect(plan.frames.some((frame) => frame.startSeconds === 0.6)).toBe(false);
  });

  it("예전 연주와 다른 악보를 섞어 저장하지 않는다", () => {
    const timing = renderedTiming();
    expect(() => buildPracticeVideoPlan(input, { ...timing, layerTimelines: [] })).toThrow("함께 연주할 악보의 시간");
    expect(() => buildPracticeVideoPlan(input, {
      ...timing, timeline: { ...timing.timeline, events: [{ ...timing.timeline.events[0], noteId: "old" }] }
    })).toThrow("악보와 연주 시간이");
  });
});

describe("VexFlow 악보에 넘기는 실제 음표 표기", () => {
  it("점음표 길이를 다시 더하지 않고 올바른 기본 음표와 점으로 나눈다", () => {
    expect(practiceVideoNotation({ ...note("dotted-quarter", 1.5), dotted: true }))
      .toMatchObject({ duration: "qd", dotted: true });
    expect(practiceVideoNotation(note("dotted-half", 3))).toMatchObject({ duration: "hd", dotted: true });
    expect(practiceVideoNotation(note("eighth", 0.5))).toMatchObject({ duration: "8", dotted: false });
  });

  it("같은 MIDI 음도 샤프와 플랫의 작성 위치를 구별한다", () => {
    expect(practiceVideoNotation({ ...note("sharp", 1, 66), accidental: "sharp" }))
      .toMatchObject({ key: "f#/4", accidental: "#" });
    expect(practiceVideoNotation({ ...note("flat", 1, 66), accidental: "flat" }))
      .toMatchObject({ key: "gb/4", accidental: "b" });
    expect(practiceVideoNotation({ ...note("natural", 1, 65), accidental: "natural" }))
      .toMatchObject({ key: "f/4", accidental: "n" });
  });

  it("8분·4분·2분·온쉼표와 점쉼표는 서로 다른 표기를 사용한다", () => {
    expect([0.5, 1, 2, 4].map((beats) => practiceVideoNotation(note("rest", beats, null)).duration))
      .toEqual(["8r", "qr", "hr", "wr"]);
    expect(practiceVideoNotation({ ...note("dot-rest", 1.5, null), dotted: true }))
      .toMatchObject({ duration: "qdr", dotted: true, accidental: null });
  });
});
