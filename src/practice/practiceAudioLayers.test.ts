// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import type { NoteEvent } from "../music/types";
import {
  buildPracticeTimeline,
  encodePracticeMp3,
  exportPracticeMp4,
  practiceMeasureAudioInput,
  practiceNotesAtTime,
  renderPracticeAudio,
  type PracticeAudioInput
} from "./practiceAudio";

const mocks = vi.hoisted(() => ({
  load: vi.fn(), queue: vi.fn(), release: vi.fn(), preloadBeat: vi.fn(), scheduleBeat: vi.fn(), mp4: vi.fn()
}));
vi.mock("../audio/samplePlayer", () => ({
  loadSampleInstrument: mocks.load, queueSampleNote: mocks.queue, releaseSampleInstrument: mocks.release
}));
vi.mock("../audio/beatSamples", () => ({
  preloadBeatSamples: mocks.preloadBeat, scheduleLoadedBeatSample: mocks.scheduleBeat
}));
vi.mock("./exportPracticeVideoMp4", () => ({ exportPracticeVideoMp4: mocks.mp4 }));

function note(id: string, beats: number, pitch: number | null = 60, lyric?: string): NoteEvent {
  return { id, pitch, duration: rational(beats * 2, 2), lyric };
}

const layered: PracticeAudioInput = {
  measures: [
    { notes: [note("main-a", 1, 60, "봄")] },
    { notes: [note("main-b", 1, 64, "날")] }
  ],
  rhythmLayers: [
    { id: "score-b", instrumentId: "clarinet", measures: [
      { notes: [note("b-a", 0.5, 62, "반"), note("b-b", 0.5)] },
      { notes: [note("b-c", 1)] }
    ] },
    { id: "score-c", instrumentId: "beat:woodblock", measures: [
      { notes: [note("c-a", 0.5), note("c-b", 0.5)] },
      { notes: [] }
    ] }
  ],
  meter: { beats: 4, beatUnit: 4 },
  bpm: 120,
  melodyInstrumentId: "flute",
  rhythmInstrumentId: "piano",
  step: "melody",
  title: "봄날"
};

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
}

function gainNode() {
  return { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
}

class OfflineContext {
  static instances: OfflineContext[] = [];
  static amplitude = 0.2;
  destination = {};
  gains: ReturnType<typeof gainNode>[] = [];
  channels: Float32Array[];
  constructor(readonly numberOfChannels: number, readonly length: number, readonly sampleRate: number) {
    this.channels = Array.from({ length: numberOfChannels }, (_, channel) =>
      Float32Array.from({ length }, (_, index) => Math.sin(index * 0.1) * OfflineContext.amplitude * (channel === 0 ? 1 : 0.5))
    );
    OfflineContext.instances.push(this);
  }
  createGain() {
    const node = gainNode();
    this.gains.push(node);
    return node;
  }
  createOscillator() {
    const node = { type: "", frequency: parameter(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    node.connect.mockImplementation((destination) => destination);
    return node;
  }
  startRendering = vi.fn(async () => ({
    numberOfChannels: this.numberOfChannels,
    length: this.length,
    sampleRate: this.sampleRate,
    duration: this.length / this.sampleRate,
    getChannelData: (channel: number) => this.channels[channel]
  } as AudioBuffer));
}

beforeEach(() => {
  vi.clearAllMocks();
  OfflineContext.instances = [];
  OfflineContext.amplitude = 0.2;
  vi.stubGlobal("OfflineAudioContext", OfflineContext);
  mocks.load.mockImplementation(async (_context, _destination, instrumentId) => ({ instrumentId }));
  mocks.preloadBeat.mockResolvedValue(undefined);
  mocks.scheduleBeat.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("세 악보의 독립 리듬과 동시 연주", () => {
  it("서로 다른 악기를 하나의 오프라인 버퍼에 같은 시작 시간으로 예약한다", async () => {
    const result = await renderPracticeAudio(layered);
    const context = OfflineContext.instances[0];
    expect(OfflineContext.instances).toHaveLength(1);
    expect(mocks.load.mock.calls.map((args) => args[2])).toEqual(["flute", "clarinet"]);
    expect(new Set(mocks.load.mock.calls.map((args) => args[1])).size).toBe(2);
    expect(mocks.load.mock.calls.every((args) => args[0] === context)).toBe(true);
    expect(mocks.queue.mock.calls.map((args) => [args[0].instrumentId, ...args.slice(3, 6)])).toEqual([
      ["flute", 60, 0, 0.5], ["flute", 64, 2, 0.5],
      ["clarinet", 72, 0, 0.25], ["clarinet", 72, 0.25, 0.25], ["clarinet", 72, 2, 0.5]
    ]);
    expect(mocks.scheduleBeat.mock.calls.map((args) => [args[2], args[4]])).toEqual([[0, "woodblock"], [0.25, "woodblock"]]);
    expect(context.gains).toHaveLength(4);
    expect(context.gains.slice(1).every((bus) => bus.connect.mock.calls[0][0] === context.gains[0])).toBe(true);
    expect(context.gains.every((bus) => bus.disconnect.mock.calls.length === 1)).toBe(true);
    expect(mocks.release.mock.calls.map((args) => args[2])).toEqual(["flute", "clarinet"]);
    expect(result.timeline.events.map((event) => event.noteId)).toEqual(["main-a", "main-b"]);
    expect(practiceNotesAtTime(result, 0)).toEqual(["main-a", "b-a", "c-a"]);
    expect(practiceNotesAtTime(result, 0.3)).toEqual(["main-a", "b-b", "c-b"]);
    expect(practiceNotesAtTime(result, 2.1)).toEqual(["main-b", "b-c"]);
    expect(result.timeline.durationSeconds).toBe(2.5);
    expect(result.buffer.duration).toBe(2.5);
  });

  it("6/8 박자와 미완성 악보를 공통 마디 시작에 맞추고 마지막 빈 박자는 늘리지 않는다", () => {
    const result = buildPracticeTimeline({ ...layered, meter: { beats: 6, beatUnit: 8 } });
    expect(result.events.map((event) => event.startSeconds)).toEqual([0, 1.5]);
    expect(result.durationSeconds).toBe(2);
    const onlyFirst = {
      ...layered,
      measures: [layered.measures[0], { notes: [] }, { notes: [] }],
      rhythmLayers: [{ ...layered.rhythmLayers![0], measures: [{ notes: [] }, { notes: [] }, { notes: [] }] }]
    };
    expect(buildPracticeTimeline(onlyFirst).durationSeconds).toBe(0.5);
  });

  it("한 악보의 초과 박자는 모든 악보의 다음 마디 시작을 함께 뒤로 옮긴다", async () => {
    const settings = { ...layered, measures: [{ notes: [note("over", 5)] }, layered.measures[1]] };
    const result = await renderPracticeAudio(settings);
    expect(result.timeline.events[1].startSeconds).toBe(2.5);
    expect(result.layerTimelines![0].events.at(-1)?.startSeconds).toBe(2.5);
    expect(result.timeline.durationSeconds).toBe(3);
  });

  it("개별 마디 듣기는 선택한 악보의 악기만 사용하며 다른 악보를 포함하지 않는다", async () => {
    const selected = practiceMeasureAudioInput(layered, 0, 1);
    const result = await renderPracticeAudio(selected);
    expect(selected.rhythmLayers).toBeUndefined();
    expect(selected.measures[0]).toBe(layered.rhythmLayers![0].measures[0]);
    expect(selected.rhythmInstrumentId).toBe("clarinet");
    expect(mocks.load.mock.calls.map((args) => args[2])).toEqual(["clarinet"]);
    expect(result.buffer.duration).toBe(0.5);
    expect(result.layerTimelines).toBeUndefined();
    expect(() => practiceMeasureAudioInput(layered, 0, 3)).toThrow("악보를 다시");
  });

  it("비어 있는 주 악보 대신 추가 악보를 연주하며 빈 악기는 준비하지 않는다", async () => {
    const result = await renderPracticeAudio({
      ...layered,
      measures: [{ notes: [] }],
      rhythmLayers: [{ ...layered.rhythmLayers![0], measures: [layered.rhythmLayers![0].measures[0]] }]
    });
    expect(mocks.load.mock.calls.map((args) => args[2])).toEqual(["clarinet"]);
    expect(result.timeline.events).toEqual([]);
    expect(result.timeline.durationSeconds).toBe(0.5);
    expect(practiceNotesAtTime(result, 0)).toEqual(["b-a"]);
  });

  it("세 소리의 피크를 한 번에 줄여 클리핑 없이 좌우 비율을 보존한다", async () => {
    OfflineContext.amplitude = 1.8;
    const result = await renderPracticeAudio(layered);
    const peak = (channel: number) => result.buffer.getChannelData(channel).reduce((value, sample) => Math.max(value, Math.abs(sample)), 0);
    expect(peak(0)).toBeCloseTo(0.95, 6);
    expect(peak(1)).toBeCloseTo(0.475, 6);
    const blob = await encodePracticeMp3(result.buffer);
    expect(blob.type).toBe("audio/mpeg");
    expect(blob.size).toBeGreaterThan(1000);
  });

  it("동시 샘플 준비를 취소하면 모든 악기 버스를 해제하고 아무 음도 예약하지 않는다", async () => {
    mocks.load.mockReturnValue(new Promise(() => undefined));
    const controller = new AbortController();
    const pending = renderPracticeAudio(layered, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.release).toHaveBeenCalledTimes(2);
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.scheduleBeat).not.toHaveBeenCalled();
    expect(OfflineContext.instances[0].startRendering).not.toHaveBeenCalled();
    expect(OfflineContext.instances[0].gains.every((bus) => bus.disconnect.mock.calls.length === 1)).toBe(true);
  });

  it("추가 악기 하나의 준비 실패는 다른 두 악기의 동시 연주를 막지 않는다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.load.mockImplementation(async (_context, _destination, instrumentId) => {
      if (instrumentId === "clarinet") throw new Error("offline");
      return { instrumentId };
    });
    try {
      const result = await renderPracticeAudio(layered);
      expect(result.usedFallback).toBe(true);
      expect(result.buffer.duration).toBe(2.5);
      expect(mocks.queue.mock.calls.map((args) => args[0].instrumentId)).toEqual(["flute", "flute"]);
      expect(mocks.scheduleBeat).toHaveBeenCalledTimes(2);
      expect(mocks.release).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });

  it("다른 악보의 비정상 길이와 네 번째 악보를 렌더 전에 거절한다", () => {
    expect(() => buildPracticeTimeline({ ...layered, rhythmLayers: [layered.rhythmLayers![0], layered.rhythmLayers![1], layered.rhythmLayers![0]] }))
      .toThrow("세 개까지");
    expect(() => buildPracticeTimeline({ ...layered, rhythmLayers: [{
      ...layered.rhythmLayers![0], measures: [{ notes: [note("wrong", 0)] }]
    }] })).toThrow("음표 길이");
  });

  it("MP4 화면에 모든 악보와 공통 마디 시작을 가진 렌더 시간을 전달한다", async () => {
    mocks.mp4.mockResolvedValue(new Blob(["mp4"]));
    const result = await renderPracticeAudio(layered);
    await exportPracticeMp4(result, layered);
    expect(mocks.mp4).toHaveBeenCalledWith(result, layered, {});
    expect(result.layerTimelines).toHaveLength(2);
    expect(result.timeline.events.map((event) => event.startSeconds)).toEqual([0, 2]);
    expect(result.buffer.duration).toBe(2.5);
  });
});
