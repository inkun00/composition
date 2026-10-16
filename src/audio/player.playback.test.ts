import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playComposition, stopPlayback, type PlaybackMeasure } from "./player";

const { loadSample, queueSample } = vi.hoisted(() => ({
  loadSample: vi.fn(), queueSample: vi.fn()
}));

vi.mock("./samplePlayer", () => ({
  loadSampleInstrument: loadSample,
  queueSampleNote: queueSample,
  resetSampleInstrumentCache: vi.fn(),
  releaseSampleInstrument: vi.fn(),
  releaseSampleContext: vi.fn()
}));

function audioParam() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class AudioNodeMock {
  gain = audioParam();
  threshold = audioParam();
  knee = audioParam();
  ratio = audioParam();
  attack = audioParam();
  release = audioParam();
  disconnect = vi.fn();
  fftSize = 1024;
  getFloatTimeDomainData = vi.fn((buffer: Float32Array) => buffer.fill(0));
  connect = vi.fn((destination: AudioNodeMock) => destination);
}

class AudioContextMock {
  currentTime = 0;
  state = "running";
  destination = new AudioNodeMock();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
  createAnalyser = vi.fn(() => new AudioNodeMock());
  createGain = vi.fn(() => new AudioNodeMock());
  createDynamicsCompressor = vi.fn(() => new AudioNodeMock());
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
}

const measure: PlaybackMeasure = {
  notes: [{ id: "rest", pitch: null, duration: { numerator: 4, denominator: 1 } }],
  harmony: "home", chords: ["C"], measureIndex: 0
};
const accompaniment = {
  styleId: "arpeggio" as const,
  instrumentIds: ["acoustic_grand_piano"],
  meter: { beats: 4, beatUnit: 4 } as const
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("AudioContext", AudioContextMock);
  loadSample.mockImplementation(async (_context, _destination, id: string) => ({ id }));
});

afterEach(async () => {
  await stopPlayback();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("마디 반주 미리듣기", () => {
  it("한 마디 미리듣기에서도 선택한 아르페지오를 한 음씩 연주한다", async () => {
    await playComposition([measure], "flute", 120, accompaniment);
    expect(queueSample).toHaveBeenCalledTimes(8);
    const starts = queueSample.mock.calls.map((call) => call[4] as number);
    expect(new Set(starts).size).toBe(8);
    expect(starts[starts.length - 1] - starts[0]).toBeGreaterThan(1.7);
    expect(queueSample.mock.calls.every((call) => call[5] < .3)).toBe(true);
  });

  it("곡의 마지막 마디라고 명시하면 긴 종지 화음을 함께 연주한다", async () => {
    await playComposition([{ ...measure, isSongEnding: true }], "flute", 120, accompaniment);
    expect(queueSample).toHaveBeenCalledTimes(3);
    expect(new Set(queueSample.mock.calls.map((call) => call[4])).size).toBe(1);
    expect(queueSample.mock.calls.every((call) => call[5] > 1.9)).toBe(true);
  });

  it("전체 곡의 마지막 마디에는 별도 표시가 없어도 종지를 적용한다", async () => {
    await playComposition([measure, { ...measure, measureIndex: 1 }], "flute", 120, accompaniment);
    const ending = queueSample.mock.calls.filter((call) => call[4] >= 2);
    expect(ending).toHaveLength(3);
    expect(ending.every((call) => call[5] > 1.9)).toBe(true);
  });

  it("중간부터 들어도 실제 8마디에는 필인을 넣고 6마디에는 기본 무늬를 유지한다", async () => {
    await playComposition([{ ...measure, measureIndex: 7 }], "flute", 120, accompaniment);
    const tail = queueSample.mock.calls.filter((call) => call[4] > 1.8);
    expect(tail.length).toBeGreaterThanOrEqual(3);
    expect(new Set(tail.map((call) => call[4])).size).toBeLessThan(tail.length);
    await stopPlayback();
    queueSample.mockClear();
    await playComposition([{ ...measure, measureIndex: 5 }], "flute", 120, accompaniment);
    expect(queueSample).toHaveBeenCalledTimes(8);
    expect(new Set(queueSample.mock.calls.map((call) => call[4])).size).toBe(8);
  });
});
