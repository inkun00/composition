import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportBackingCompositionMp3, exportBackingCompositionMp3Offline, type PlaybackMeasure } from "./player";
import { renderOfflineBackingAudio } from "./backingExport";
import { releaseSampleContext, releaseSampleInstrument } from "./samplePlayer";

const { loadSample, queueSample, encodeBuffer, flush } = vi.hoisted(() => ({
  loadSample: vi.fn(),
  queueSample: vi.fn(),
  encodeBuffer: vi.fn(() => new Uint8Array([1, 2])),
  flush: vi.fn(() => new Uint8Array([3]))
}));

vi.mock("./samplePlayer", () => ({
  loadSampleInstrument: loadSample,
  queueSampleNote: queueSample,
  resetSampleInstrumentCache: vi.fn(),
  releaseSampleInstrument: vi.fn(),
  releaseSampleContext: vi.fn()
}));

vi.mock("@breezystack/lamejs", () => ({
  Mp3Encoder: class {
    encodeBuffer = encodeBuffer;
    flush = flush;
  }
}));

function audioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  };
}

class AudioNodeMock {
  gain = audioParam();
  threshold = audioParam();
  knee = audioParam();
  ratio = audioParam();
  attack = audioParam();
  release = audioParam();
  frequency = audioParam();
  disconnect = vi.fn();
  fftSize = 1024;
  getFloatTimeDomainData = vi.fn((buffer: Float32Array) => buffer.fill(0));
  connect = vi.fn((destination: AudioNodeMock) => destination);
  start = vi.fn();
  stop = vi.fn();
}

const contexts: OfflineContextMock[] = [];

class OfflineContextMock {
  currentTime = 0;
  destination = new AudioNodeMock();
  createAnalyser = vi.fn(() => new AudioNodeMock());
  createGain = vi.fn(() => new AudioNodeMock());
  createDynamicsCompressor = vi.fn(() => new AudioNodeMock());
  createOscillator = vi.fn(() => new AudioNodeMock());
  startRendering = vi.fn(async () => ({
    numberOfChannels: 2,
    sampleRate: this.sampleRate,
    getChannelData: () => new Float32Array([.03, -.02, .01])
  }));

  constructor(readonly channels: number, readonly length: number, readonly sampleRate: number) {
    contexts.push(this);
  }
}

const measures: readonly PlaybackMeasure[] = [{
  notes: [{ id: "melody", pitch: 72, duration: { numerator: 4, denominator: 1 } }],
  harmony: "home",
  chords: ["C"]
}];

beforeEach(() => {
  vi.clearAllMocks();
  contexts.splice(0);
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
  loadSample.mockImplementation(async (_context, _destination, id: string) => ({ id }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("오프라인 반주 MP3", () => {
  it("영상에는 MP3로 압축하기 전 PCM과 정확한 전주 시작 시각을 제공한다", async () => {
    const result = await renderOfflineBackingAudio(measures, "flute", 120, {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"]
    });

    expect(result.introSeconds).toBe(8.08);
    expect(result.audioBuffer.numberOfChannels).toBe(2);
    expect(contexts[0].length / contexts[0].sampleRate).toBeCloseTo(18.88, 4);
    expect(encodeBuffer).not.toHaveBeenCalled();
    expect(releaseSampleContext).toHaveBeenCalledWith(contexts[0]);
  });

  it("샘플을 불러오는 동안 취소해도 렌더링과 인코딩을 생략하고 샘플을 정리한다", async () => {
    const controller = new AbortController();
    loadSample.mockImplementationOnce(async (_context, _destination, id: string) => {
      controller.abort();
      return { id };
    });
    await expect(renderOfflineBackingAudio(measures, "flute", 120, {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"]
    }, controller.signal)).rejects.toMatchObject({ name: "AbortError" });

    expect(contexts[0].startRendering).not.toHaveBeenCalled();
    expect(encodeBuffer).not.toHaveBeenCalled();
    expect(releaseSampleContext).toHaveBeenCalledWith(contexts[0]);
  });

  it("그림 뮤직비디오는 선택한 가락 악기 샘플과 반주를 함께 넣고 전주와 후주는 반주로 둔다", async () => {
    await renderOfflineBackingAudio(measures, "flute", 120, {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"]
    }, undefined, { includeMelody: true });

    expect(loadSample.mock.calls.map((call) => call[2])).toEqual(["flute", "acoustic_guitar_steel"]);
    const melody = queueSample.mock.calls.filter((call) => call[0].id === "flute");
    expect(melody).toHaveLength(1);
    expect(melody[0][3]).toBe(72);
    expect(melody[0][4]).toBeGreaterThanOrEqual(8);
    expect(melody[0][4]).toBeLessThan(10.1);
    expect(queueSample.mock.calls.some((call) => call[0].id === "acoustic_guitar_steel")).toBe(true);
    expect(contexts[0].createOscillator).not.toHaveBeenCalled();
    expect(releaseSampleContext).toHaveBeenCalledWith(contexts[0]);
  });

  it("가락 악기 로딩이 멈추면 8초 뒤 샘플을 해제하고 합성 가락과 실제 반주로 저장한다", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    loadSample.mockImplementation((_context, _destination, id: string) => id === "flute"
      ? new Promise(() => undefined) : Promise.resolve({ id }));
    const pending = renderOfflineBackingAudio(measures, "flute", 120, {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"]
    }, undefined, { includeMelody: true });

    await vi.advanceTimersByTimeAsync(7999);
    expect(contexts[0].startRendering).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.audioBuffer.numberOfChannels).toBe(2);
    expect(releaseSampleInstrument).toHaveBeenCalledWith(contexts[0], expect.any(AudioNodeMock), "flute");
    expect(contexts[0].createOscillator).toHaveBeenCalled();
    expect(queueSample.mock.calls.some((call) => call[0].id === "acoustic_guitar_steel")).toBe(true);
    expect(contexts[0].startRendering).toHaveBeenCalledOnce();
    expect(releaseSampleContext).toHaveBeenCalledWith(contexts[0]);
  });

  it("실시간 저장을 지원하지 않는 브라우저에서도 이후 저장을 잠그지 않는다", async () => {
    vi.stubGlobal("MediaRecorder", undefined);
    await expect(exportBackingCompositionMp3(measures)).rejects.toThrow("MP3 저장");

    const blob = await exportBackingCompositionMp3Offline(measures, "flute", 120, {
      styleId: "folk", instrumentIds: ["acoustic_guitar_steel"]
    });
    expect(blob?.type).toBe("audio/mpeg");
  });

  it("미리듣기에서 고른 반주 악기 샘플로 전주부터 후주까지 렌더링한다", async () => {
    const blob = await exportBackingCompositionMp3Offline(measures, "flute", 120, {
      styleId: "folk",
      instrumentIds: ["acoustic_guitar_steel", "acoustic_bass"],
      meter: { beats: 4, beatUnit: 4 }
    });

    expect(blob?.type).toBe("audio/mpeg");
    expect(blob?.size).toBeGreaterThan(0);
    expect(loadSample.mock.calls.map((call) => call[2])).toEqual([
      "acoustic_guitar_steel", "acoustic_bass"
    ]);
    expect(new Set(queueSample.mock.calls.map((call) => call[0].id)))
      .toEqual(new Set(["acoustic_guitar_steel", "acoustic_bass"]));
    const starts = queueSample.mock.calls.map((call) => call[4] as number);
    expect(Math.min(...starts)).toBeLessThan(1);
    expect(starts.some((start) => start >= 8 && start < 10)).toBe(true);
    expect(Math.max(...starts)).toBeGreaterThan(16);
    expect(contexts[0].createOscillator).not.toHaveBeenCalled();
    expect(contexts[0].startRendering).toHaveBeenCalledOnce();
  });

  it("한 악기의 샘플을 못 불러와도 나머지 악기는 실제 샘플을 유지한다", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    loadSample.mockImplementation(async (_context, _destination, id: string) => {
      if (id === "acoustic_guitar_steel") throw new Error("sample unavailable");
      return { id };
    });

    const blob = await exportBackingCompositionMp3Offline(measures, "flute", 120, {
      styleId: "folk",
      instrumentIds: ["acoustic_guitar_steel", "acoustic_bass"]
    });

    expect(blob?.type).toBe("audio/mpeg");
    expect(queueSample).toHaveBeenCalled();
    expect(queueSample.mock.calls.every((call) => call[0].id === "acoustic_bass")).toBe(true);
    expect(contexts[0].createOscillator).not.toHaveBeenCalled();
  });
});
