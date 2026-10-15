// @vitest-environment node
import { describe, expect, it } from "vitest";
import { rational } from "../music/rational";
import { practiceAudioScores } from "./practiceAudioScores";
import {
  buildPracticeAudioPlan, practiceMeasureAudioInput, practiceNotesAtTime, practiceScoreAudioInput
} from "./practiceAudioTimeline";
import type { PracticeAudioInput } from "./practiceAudioTypes";
import { buildPracticeVideoPreviewPlan } from "./practiceVideoPlan";

const input: PracticeAudioInput = {
  mode: "rhythm-melody",
  step: "melody",
  bpm: 120,
  meter: { beats: 4, beatUnit: 4 },
  melodyInstrumentId: "flute",
  rhythmInstrumentId: "beat:woodblock",
  title: "함께 연주",
  measures: [{ notes: [
    { id: "low", pitch: 60, duration: rational(1, 4), lyric: "봄" },
    { id: "rest", pitch: null, duration: rational(1, 4) },
    { id: "high", pitch: 67, duration: rational(7, 2), lyric: "날" }
  ] }, { notes: [{ id: "next", pitch: 64, duration: rational(4), lyric: "아" }] }],
  rhythmLayers: [{ id: "layer", instrumentId: "clarinet", measures: [
    { notes: [{ id: "layer-first", pitch: 60, duration: rational(4) }] },
    { notes: [{ id: "layer-next", pitch: 60, duration: rational(4) }] }
  ] }]
};

describe("처음 고른 만들기 모드의 연주와 영상", () => {
  it("리듬만들기는 가락 단계 값이 남아 있어도 리듬 악기로만 연주한다", () => {
    const plan = buildPracticeAudioPlan({ ...input, mode: "rhythm" });
    expect(plan.tracks.map((track) => [track.instrumentId, track.rhythm])).toEqual([
      ["beat:woodblock", true], ["clarinet", true]
    ]);
    expect(plan.timeline.events.map((event) => event.pitch)).toEqual([72, null, 72, 72]);
  });

  it("가락만들기는 리듬 악보가 저장되어 있어도 가락 하나만 연주하고 표시한다", () => {
    const settings: PracticeAudioInput = { ...input, mode: "melody", step: "rhythm" };
    const plan = buildPracticeAudioPlan(settings);
    expect(plan.tracks).toHaveLength(1);
    expect(plan.tracks[0]).toMatchObject({ instrumentId: "flute", rhythm: false });
    expect(plan.timeline.events.map((event) => event.pitch)).toEqual([60, null, 67, 64]);
    const video = buildPracticeVideoPreviewPlan(settings);
    expect(video.tracks.map((track) => [track.id, track.rhythm])).toEqual([["main", false]]);
    expect(video.measures[0].tracks).toHaveLength(1);
    expect(input.rhythmLayers).toHaveLength(1);
    expect(() => practiceScoreAudioInput(settings, 1)).toThrow("악보를 다시");
  });

  it("함께 만들기의 리듬 단계는 가락을 아직 연주하지 않는다", () => {
    const plan = buildPracticeAudioPlan({ ...input, step: "rhythm" });
    expect(plan.tracks.map((track) => [track.instrumentId, track.rhythm])).toEqual([
      ["beat:woodblock", true], ["clarinet", true]
    ]);
  });

  it("함께 만들기의 가락 단계는 입력한 박자를 유지하며 가락 악기만 연주한다", () => {
    const scores = practiceAudioScores(input);
    expect(scores).toHaveLength(1);
    expect(scores[0].measures).toBe(input.measures);
    const plan = buildPracticeAudioPlan(input);
    expect(plan.tracks.map((track) => [track.instrumentId, track.rhythm])).toEqual([
      ["flute", false]
    ]);
    expect(plan.timeline.events.map((event) => event.pitch)).toEqual([60, null, 67, 64]);
    expect(plan.timeline.events.map(({ startSeconds, endSeconds }) => [startSeconds, endSeconds]))
      .toEqual([[0, 0.125], [0.125, 0.25], [0.25, 2], [2, 4]]);
    const highlighted = practiceNotesAtTime({
      buffer: {} as AudioBuffer, timeline: plan.timeline,
      layerTimelines: plan.tracks.slice(1).map((track) => track.timeline), usedFallback: false
    }, 0.2);
    expect(highlighted).toEqual(["rest"]);
    expect(input.rhythmLayers).toHaveLength(1);
  });

  it("함께 만들기의 한 마디·악보 듣기도 가락만 연주하고 리듬 악보 선택을 막는다", () => {
    for (const preview of [practiceMeasureAudioInput(input, 0), practiceScoreAudioInput(input, 0)]) {
      const plan = buildPracticeAudioPlan(preview);
      expect(preview.mode).toBe("rhythm-melody");
      expect(plan.tracks.map((track) => track.instrumentId)).toEqual(["flute"]);
      expect(plan.tracks[0].timeline.events.map((event) => event.pitch)).toContain(60);
    }
    expect(() => practiceMeasureAudioInput(input, 0, 1)).toThrow("악보를 다시");
    expect(() => practiceScoreAudioInput(input, 1)).toThrow("악보를 다시");
    const rhythm = practiceScoreAudioInput({ ...input, step: "rhythm" }, 1);
    expect(buildPracticeAudioPlan(rhythm).tracks.map((track) => [track.instrumentId, track.rhythm]))
      .toEqual([["clarinet", true]]);
  });

  it("저장 영상에서도 리듬 악보를 제외하고 가락의 악보와 연주 시간을 일치시킨다", () => {
    const video = buildPracticeVideoPreviewPlan(input);
    expect(video.tracks.map((track) => track.id)).toEqual(["main"]);
    expect(video.measures.map((measure) => [measure.startSeconds, measure.endSeconds])).toEqual([[0, 2], [2, 4]]);
    expect(video.measures[0].tracks[0].map((note) => note.visualPitch)).toEqual([60, null, 67]);
    expect(video.measures.every((measure) => measure.tracks.length === 1)).toBe(true);
    expect(video.measures[1].tracks[0][0].startSeconds).toBe(2);
    expect(video.frames.at(-1)?.endSeconds).toBe(4);
  });

  it("가락 단계에서는 저장된 리듬 수·길이·음표가 연주 길이와 제한에 영향을 주지 않는다", () => {
    const settings = { ...input, rhythmLayers: [input.rhythmLayers![0], {
      ...input.rhythmLayers![0], id: "long", instrumentId: "beat:shaker",
      measures: [{ notes: [{ id: "long", pitch: 60, duration: rational(2000) }] }]
    }, {
      ...input.rhythmLayers![0], id: "invalid",
      measures: [{ notes: [{ id: "invalid", pitch: 60, duration: rational(0) }] }]
    }] };
    const audio = buildPracticeAudioPlan(settings);
    const video = buildPracticeVideoPreviewPlan(settings);
    expect(audio.tracks).toHaveLength(1);
    expect(audio.timeline.durationSeconds).toBe(4);
    expect(video.tracks).toHaveLength(1);
    expect(video.durationSeconds).toBe(4);
    expect(settings.rhythmLayers).toHaveLength(3);
  });
});
