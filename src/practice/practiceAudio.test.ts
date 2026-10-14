// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rational } from "../music/rational";
import {
  buildPracticeTimeline,
  encodePracticeMp3,
  exportPracticeMp4,
  practiceAudioFileName,
  practiceMeasureAudioInput,
  practiceNoteAtTime,
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

const input: PracticeAudioInput = {
  measures: [{ notes: [
    { id: "low", pitch: 60, duration: rational(1), lyric: "나" },
    { id: "rest", pitch: null, duration: rational(1, 2) },
    { id: "high", pitch: 72, duration: rational(1, 2), lyric: "비" }
  ] }],
  bpm: 120,
  melodyInstrumentId: "flute",
  rhythmInstrumentId: "acoustic_grand_piano",
  step: "melody",
  title: "나비"
};

function audioBuffer(length = 4410): AudioBuffer {
  const samples = Float32Array.from({ length }, (_, index) => Math.sin(index * 0.1) * 0.2);
  return {
    length, sampleRate: 44100, numberOfChannels: 2, duration: length / 44100,
    getChannelData: () => samples
  } as unknown as AudioBuffer;
}

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() };
}

class OfflineContextMock {
  static contexts: OfflineContextMock[] = [];
  destination = {};
  sampleRate: number;
  oscillator = { type: "", frequency: parameter(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
  node = { gain: parameter(), connect: vi.fn(), disconnect: vi.fn() };
  constructor(readonly channels: number, readonly length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    OfflineContextMock.contexts.push(this);
    this.oscillator.connect.mockReturnValue(this.node);
    this.node.connect.mockReturnValue(this.node);
  }
  createGain() { return this.node; }
  createOscillator() { return this.oscillator; }
  startRendering = vi.fn(async () => audioBuffer(this.length));
}

beforeEach(() => {
  vi.clearAllMocks();
  OfflineContextMock.contexts = [];
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
  mocks.load.mockResolvedValue({ kind: "soundfont", player: {} });
  mocks.preloadBeat.mockResolvedValue(undefined);
  mocks.scheduleBeat.mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("연습 곡의 실제 음표와 시간", () => {
  it("쉼표를 포함한 정확한 박자만 재생하고 낮은 도와 높은 도를 보존한다", () => {
    const timeline = buildPracticeTimeline(input);
    expect(timeline.durationSeconds).toBe(1);
    expect(timeline.events.map(({ pitch, startSeconds, endSeconds }) => ({ pitch, startSeconds, endSeconds }))).toEqual([
      { pitch: 60, startSeconds: 0, endSeconds: 0.5 },
      { pitch: null, startSeconds: 0.5, endSeconds: 0.75 },
      { pitch: 72, startSeconds: 0.75, endSeconds: 1 }
    ]);
    expect(practiceNoteAtTime(timeline, 0.5)).toBe("rest");
    expect(practiceNoteAtTime(timeline, 0.75)).toBe("high");
    expect(practiceNoteAtTime(timeline, 1)).toBeNull();
  });

  it("리듬 모드에서는 모든 소리 음표를 C5로 연주하고 쉼표는 유지한다", () => {
    expect(buildPracticeTimeline({ ...input, step: "rhythm" }).events.map((event) => event.pitch)).toEqual([72, null, 72]);
  });

  it.each([
    { label: "박자가 부족한", beats: rational(1, 2), duration: 0.25 },
    { label: "박자가 초과된", beats: rational(9, 2), duration: 2.25 }
  ])("$label 마디도 입력한 길이까지만 리듬 악기로 연주한다", async ({ beats, duration }) => {
    const selected = { notes: [{ id: "selected", pitch: 65, duration: beats }] };
    const draft: PracticeAudioInput = { ...input, step: "rhythm", measures: [input.measures[0], selected, { notes: [] }] };
    const preview = practiceMeasureAudioInput(draft, 1);
    const result = await renderPracticeAudio(preview);
    expect(preview.measures).toEqual([selected]);
    expect(preview.measures[0]).toBe(selected);
    expect(preview.step).toBe("rhythm");
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), expect.anything(), input.rhythmInstrumentId);
    expect(mocks.queue.mock.calls.map((args) => args.slice(3, 6))).toEqual([[72, 0, duration]]);
    expect(result.timeline.events.map((event) => event.noteId)).toEqual(["selected"]);
    expect(result.buffer.duration).toBe(duration);
    expect(draft.measures[1].notes).toHaveLength(1);
    expect(draft.step).toBe("rhythm");
  });

  it("한 마디 리듬에서도 입력된 쉼표를 유지하고 다른 마디 음표는 포함하지 않는다", () => {
    const preview = practiceMeasureAudioInput({ ...input, step: "rhythm", measures: [{ notes: [] }, input.measures[0]] }, 1);
    const timeline = buildPracticeTimeline(preview);
    expect(timeline.events.map((event) => event.noteId)).toEqual(["low", "rest", "high"]);
    expect(timeline.events.map((event) => event.pitch)).toEqual([72, null, 72]);
    expect(timeline.durationSeconds).toBe(1);
  });

  it("가락의 마디 듣기는 입력한 높이와 16분음표·쉼표·가사를 가락 악기로 그대로 연주한다", async () => {
    const selected = { notes: [
      { id: "rest-start", pitch: null, duration: rational(1, 4) },
      { id: "low-sixteenth", pitch: 60, duration: rational(1, 4), lyric: "봄" },
      { id: "high-eighth", pitch: 67, duration: rational(1, 2), lyric: "날" },
      { id: "rest-end", pitch: null, duration: rational(1, 4) }
    ] };
    const draft: PracticeAudioInput = {
      ...input,
      melodyInstrumentId: "clarinet",
      rhythmInstrumentId: "beat:woodblock",
      measures: [input.measures[0], selected, { notes: [] }],
      rhythmLayers: [{ id: "other", instrumentId: "beat:shaker", measures: [input.measures[0]] }]
    };
    const preview = practiceMeasureAudioInput(draft, 1);
    const result = await renderPracticeAudio(preview);
    expect(preview.step).toBe("melody");
    expect(preview.measures).toEqual([selected]);
    expect(preview.measures[0]).toBe(selected);
    expect(preview.rhythmLayers).toBeUndefined();
    expect(mocks.load.mock.calls.map((args) => args[2])).toEqual(["clarinet"]);
    expect(mocks.preloadBeat).not.toHaveBeenCalled();
    expect(mocks.queue.mock.calls.map((args) => args.slice(3, 6))).toEqual([
      [60, 0.125, 0.125], [67, 0.25, 0.25]
    ]);
    expect(result.timeline.events.map((event) => [event.noteId, event.pitch])).toEqual([
      ["rest-start", null], ["low-sixteenth", 60], ["high-eighth", 67], ["rest-end", null]
    ]);
    expect(result.timeline.durationSeconds).toBe(0.625);
    expect(result.buffer.duration).toBe(Math.ceil(0.625 * 44100) / 44100);
    expect(result.layerTimelines).toBeUndefined();
    expect(draft.measures[1].notes).toEqual(selected.notes);
    expect(draft.measures[1].notes.map((note) => note.lyric)).toEqual([undefined, "봄", "날", undefined]);
    expect(mocks.release).toHaveBeenCalledWith(expect.anything(), expect.anything(), "clarinet");
  });

  it("빈 마디와 쉼표만 있는 마디는 소리 음표를 넣도록 안내한다", () => {
    expect(() => practiceMeasureAudioInput({ ...input, measures: [{ notes: [] }] }, 0)).toThrow("1마디에 소리 나는 음표");
    expect(() => practiceMeasureAudioInput({ ...input, measures: [{ notes: [
      { id: "rest", pitch: null, duration: rational(1) }
    ] }] }, 0)).toThrow("소리 나는 음표");
    expect(() => practiceMeasureAudioInput(input, -1)).toThrow("마디를 다시");
    expect(() => practiceMeasureAudioInput(input, 0.5)).toThrow("마디를 다시");
    expect(() => practiceMeasureAudioInput(input, 1)).toThrow("마디를 다시");
  });

  it("빈 곡, 잘못된 빠르기와 음표 길이는 읽을 수 있는 오류로 거절한다", () => {
    expect(() => buildPracticeTimeline({ ...input, measures: [] })).toThrow("음표를 한 개 이상");
    expect(() => buildPracticeTimeline({ ...input, bpm: 0 })).toThrow("빠르기");
    expect(() => buildPracticeTimeline({ ...input, measures: [{ notes: [{ id: "x", pitch: 60, duration: rational(0) }] }] }))
      .toThrow("음표 길이");
  });

  it("선택한 악기와 실제 음표 길이를 샘플에 전달하며 전주나 후주를 만들지 않는다", async () => {
    const result = await renderPracticeAudio(input);
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), expect.anything(), "flute");
    expect(mocks.queue.mock.calls.map((args) => args.slice(3, 6))).toEqual([[60, 0, 0.5], [72, 0.75, 0.25]]);
    expect(result.buffer.duration).toBe(1);
    expect(OfflineContextMock.contexts[0].length).toBe(44100);
    expect(result.usedFallback).toBe(false);
    expect(mocks.release).toHaveBeenCalledOnce();
  });

  it("리듬 악기는 선율 샘플과 비트 샘플의 같은 이름을 구별한다", async () => {
    await renderPracticeAudio({ ...input, step: "rhythm", rhythmInstrumentId: "timpani" });
    expect(mocks.load).toHaveBeenCalledWith(expect.anything(), expect.anything(), "timpani");
    expect(mocks.queue.mock.calls.map((args) => args[3])).toEqual([72, 72]);
    expect(mocks.preloadBeat).not.toHaveBeenCalled();
    mocks.queue.mockClear();
    await renderPracticeAudio({ ...input, step: "rhythm", rhythmInstrumentId: "beat:timpani" });
    expect(mocks.preloadBeat).toHaveBeenCalledWith(expect.anything(), ["timpani"]);
    expect(mocks.scheduleBeat.mock.calls.map((args) => [args[2], args[4]])).toEqual([[0, "timpani"], [0.75, "timpani"]]);
    expect(mocks.queue).not.toHaveBeenCalled();
  });

  it("붙임줄을 한 소리로 렌더해도 각 음표의 하이라이트 시간을 유지한다", async () => {
    const tied = { ...input, measures: [{ notes: [
      { id: "a", pitch: 60, duration: rational(1), linkToNext: true },
      { id: "b", pitch: 60, duration: rational(1) }
    ] }] };
    const result = await renderPracticeAudio(tied);
    expect(mocks.queue).toHaveBeenCalledOnce();
    expect(mocks.queue.mock.calls[0].slice(3, 6)).toEqual([60, 0, 1]);
    expect(practiceNoteAtTime(result.timeline, 0.6)).toBe("b");
  });

  it("높이가 다른 이음줄 음표를 리듬에서 한 음으로 합치지 않는다", async () => {
    await renderPracticeAudio({ ...input, step: "rhythm", measures: [{ notes: [
      { id: "a", pitch: 60, duration: rational(1), linkToNext: true },
      { id: "b", pitch: 62, duration: rational(1) }
    ] }] });
    expect(mocks.queue.mock.calls.map((args) => args.slice(3, 6))).toEqual([[72, 0, 0.5], [72, 0.5, 0.5]]);
  });

  it("샘플 로딩 실패 시 빈 파일 대신 같은 길이의 합성음을 만든다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.load.mockRejectedValue(new Error("offline"));
    const result = await renderPracticeAudio(input);
    expect(result.usedFallback).toBe(true);
    expect(OfflineContextMock.contexts[0].oscillator.start.mock.calls).toEqual([[0], [0.75]]);
    expect(OfflineContextMock.contexts[0].oscillator.stop.mock.calls).toEqual([[0.5], [1]]);
    warn.mockRestore();
  });

  it("준비 중 취소하면 뒤늦게 샘플이 와도 재생을 예약하지 않는다", async () => {
    const controller = new AbortController();
    mocks.load.mockReturnValue(new Promise(() => undefined));
    const promise = renderPracticeAudio(input, { signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(OfflineContextMock.contexts[0].startRendering).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
});

describe("연습 파일 내보내기", () => {
  it("렌더된 PCM을 실제 MP3 프레임으로 인코딩한다", async () => {
    const progress = vi.fn();
    const result = await encodePracticeMp3(audioBuffer(), { onProgress: progress });
    expect(result.type).toBe("audio/mpeg");
    expect(result.size).toBeGreaterThan(1000);
    const bytes = new Uint8Array(await result.arrayBuffer());
    expect(bytes.some((value, index) => value === 0xff && (bytes[index + 1] & 0xe0) === 0xe0)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("MP4 화면에 렌더된 음원과 입력한 가락·가사를 그대로 전달한다", async () => {
    mocks.mp4.mockResolvedValue(new Blob(["mp4"], { type: "video/mp4" }));
    const buffer = audioBuffer(44100);
    const rendered = { buffer, timeline: buildPracticeTimeline(input), usedFallback: false };
    await exportPracticeMp4(rendered, input);
    expect(mocks.mp4).toHaveBeenCalledWith(rendered, input, {});
  });

  it("영상 오류를 호출자에게 전달한다", async () => {
    mocks.mp4.mockRejectedValue(new Error("지원하지 않는 브라우저"));
    await expect(exportPracticeMp4({ buffer: audioBuffer(44100), timeline: buildPracticeTimeline(input), usedFallback: false }, input))
      .rejects.toThrow("지원하지 않는");
  });

  it("가사 없는 리듬도 선택한 화면 모드와 취소 신호를 전달한다", async () => {
    const controller = new AbortController();
    const rhythm: PracticeAudioInput = {
      ...input,
      step: "rhythm",
      videoMode: "score",
      measures: input.measures.map((measure) => ({
        notes: measure.notes.map((note) => ({ ...note, lyric: "" }))
      }))
    };
    mocks.mp4.mockResolvedValue(new Blob(["mp4"], { type: "video/mp4" }));
    const rendered = { buffer: audioBuffer(44100), timeline: buildPracticeTimeline(rhythm), usedFallback: false };
    await exportPracticeMp4(rendered, rhythm, { signal: controller.signal });
    expect(mocks.mp4).toHaveBeenCalledWith(rendered, rhythm, { signal: controller.signal });
  });

  it("다운로드 이름에서 잘못된 파일 문자를 지운다", () => {
    expect(practiceAudioFileName('봄:나비/노래?', "mp3")).toBe("봄나비노래.mp3");
    expect(practiceAudioFileName(" ", "mp4")).toBe("나의 연습 가락.mp4");
  });
});
