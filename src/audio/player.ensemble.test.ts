import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportBackingCompositionMp3Offline, playComposition, practiceKaraokeComposition,
  recordKaraokeComposition, stopPlayback, type AccompanimentOptions, type PlaybackMeasure } from "./player";
import * as performanceModule from "./accompanimentPerformance";

const { loadSample, queueSample, scheduleDrums, queueEffect, audioBuffer } = vi.hoisted(() => ({
  loadSample: vi.fn(), queueSample: vi.fn(), scheduleDrums: vi.fn(), queueEffect: vi.fn(),
  audioBuffer: { numberOfChannels: 2, sampleRate: 44100, length: 3,
    getChannelData: () => new Float32Array([.03, -.02, .01]) }
}));
vi.mock("./samplePlayer", () => ({ loadSampleInstrument: loadSample, queueSampleNote: queueSample,
  releaseSampleInstrument: vi.fn(), releaseSampleContext: vi.fn() }));
vi.mock("./drumGroove", () => ({ scheduleBeatPattern: scheduleDrums }));
vi.mock("./beatSamples", () => ({ preloadBeatSamples: vi.fn(async () => {}) }));
vi.mock("./soundEffects", () => ({ queueSoundEffect: queueEffect, preloadSoundEffects: vi.fn(async () => {}) }));
vi.mock("./audioExport", () => ({ encodeAudioBufferToMp3: () => new Blob(["mp3"], { type: "audio/mpeg" }),
  renderedAudioPeak: () => .03, renderProcessedKaraokeMp3: vi.fn(),
  renderKaraokePreviewMix: async () => ({ audioBuffer, blob: new Blob(["mp3"]) }) }));
vi.mock("./pcmRecorder", () => ({ findBuiltInMicrophoneDeviceId: async () => null,
  forceBuiltInMicrophoneStream: async (stream: MediaStream) => ({ stream }),
  startPcmStreamCapture: async () => ({ stop: async () => new Float32Array([.01]) }),
  createAudioBufferFromPcm: () => audioBuffer, encodeAudioBufferToWav: () => new Blob(["wav"]) }));
vi.mock("./vocalCapture", async (importActual) => ({
  ...await importActual<typeof import("./vocalCapture")>(), createVocalMonitor: () => vi.fn()
}));

function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
class NodeMock {
  gain = param();
  threshold = param();
  knee = param();
  ratio = param();
  attack = param();
  release = param();
  fftSize = 1024;
  getFloatTimeDomainData = (buffer: Float32Array) => buffer.fill(0);
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
  buffer: unknown;
  loop = false;
}
class ContextMock extends EventTarget {
  state = "running";
  sampleRate = 44100;
  destination = new NodeMock();
  get currentTime() { return Date.now() / 1000; }
  createGain = () => new NodeMock();
  createDynamicsCompressor = () => new NodeMock();
  createAnalyser = () => new NodeMock();
  createBuffer = () => audioBuffer;
  createBufferSource = () => new NodeMock();
  createMediaStreamSource = () => new NodeMock();
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
}
class OfflineContextMock extends ContextMock {
  get currentTime() { return 0; }
  startRendering = async () => audioBuffer;
}

const tracks = ["acoustic_grand_piano", "acoustic_guitar_steel", "string_ensemble_1", "acoustic_bass"];
const options: AccompanimentOptions = { styleId: "folk", instrumentIds: tracks,
  meter: { beats: 4, beatUnit: 4 } };
const measuresFor = (count: number): PlaybackMeasure[] => Array.from({ length: count }, (_, index) => ({
  notes: [72, 71, 69, 67].map((pitch, noteIndex) => ({ id: `${index}-${noteIndex}`, pitch,
    duration: { numerator: 1, denominator: 1 } })),
  harmony: "home", chords: [index % 4 === 2 ? "F" : index % 4 === 3 ? "G" : "C"], measureIndex: index
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.clearAllMocks();
  vi.stubGlobal("AudioContext", ContextMock);
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop: vi.fn() }] }) } });
  loadSample.mockImplementation(async (_context, _destination, id: string) => ({ id }));
});
afterEach(async () => {
  await stopPlayback();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Compare the musical score, independent of device preparation and count-in latency. */
function backingNotes(beforeSeconds = Infinity) {
  const backing = queueSample.mock.calls.filter((call) => tracks.includes(call[0].id));
  const first = Math.min(...backing.map((call) => call[4]));
  return backing.filter((call) => call[4] - first < beforeSeconds - .02).map((call) => ({
    instrument: call[0].id, pitch: call[3], offset: +(call[4] - first).toFixed(5),
    duration: +call[5].toFixed(5), velocity: +call[6].toFixed(5)
  }));
}

describe("선택한 반주 악기의 편성 일관성", () => {
  it("합주의 모든 악기에 같은 앞뒤 가락과 전체 편성을 전달한다", async () => {
    const planner = vi.spyOn(performanceModule, "planAccompanimentLayer");
    const measures = measuresFor(8);
    try {
      await playComposition(measures, "oboe", 120, options, true);
      const songCalls = planner.mock.calls.map(([call]) => call)
        .filter((call) => call.ensemble?.section === "song" && call.ensemble.measureIndex === 1);
      expect(songCalls).toHaveLength(tracks.length);
      const contexts = songCalls.map((call) => call.ensemble);
      expect(new Set(contexts).size).toBe(1);
      expect(contexts[0]?.previous).toBe(measures[0]);
      expect(contexts[0]?.current).toBe(measures[1]);
      expect(contexts[0]?.next).toBe(measures[2]);
      expect(new Set(contexts[0]?.instrumentIds)).toEqual(new Set(tracks));
      const intro = planner.mock.calls.map(([call]) => call).find((call) => call.ensemble?.section === "intro");
      expect(intro?.ensemble?.melody.activeFraction).toBe(0);
      expect(intro?.ensemble?.motif).toEqual([]);
    } finally {
      planner.mockRestore();
    }
  });

  it("클라리넷·리코더의 파트는 선택 순서와 단독 듣기에 따라 바뀌지 않는다", async () => {
    const instrumentIds = ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"];
    const windOptions: AccompanimentOptions = { ...options, styleId: "children_song", instrumentIds };
    const measures = measuresFor(8);
    const capture = () => {
      const calls = queueSample.mock.calls.filter((call) => instrumentIds.includes(call[0].id));
      const first = Math.min(...calls.map((call) => call[4]));
      return calls.map((call) => ({ id: call[0].id as string, pitch: call[3] as number,
        offset: +(call[4] - first).toFixed(5), duration: +call[5].toFixed(5), velocity: +call[6].toFixed(5) }))
        .sort((left, right) => left.id.localeCompare(right.id) || left.offset - right.offset || left.pitch - right.pitch);
    };
    await playComposition(measures, "oboe", 120, windOptions);
    const expected = capture();
    await stopPlayback();
    queueSample.mockClear();
    await playComposition(measures, "oboe", 120, { ...windOptions, instrumentIds: [...instrumentIds].reverse() });
    expect(capture()).toEqual(expected);
    await stopPlayback();
    queueSample.mockClear();
    await playComposition(measures, "oboe", 120, { ...windOptions, soloInstrumentId: "recorder" });
    expect(capture().filter((note) => note.id === "recorder"))
      .toEqual(expected.filter((note) => note.id === "recorder"));
  });

  it.each([8, 16])("%i마디에서 마지막에 고른 베이스까지 매 마디 실제 샘플로 예약한다", async (count) => {
    await playComposition(measuresFor(count), "oboe", 120, options);
    const first = Math.min(...queueSample.mock.calls.filter((call) => tracks.includes(call[0].id)).map((call) => call[4]));
    for (const id of tracks) {
      const measures = new Set(queueSample.mock.calls.filter((call) => call[0].id === id)
        .map((call) => Math.floor((call[4] - first + .02) / 2)));
      expect(measures, id).toEqual(new Set(Array.from({ length: count }, (_, index) => index)));
    }
    await stopPlayback();
    queueSample.mockClear();
    await playComposition(measuresFor(count), "oboe", 120, { ...options, instrumentIds: [...tracks].reverse() });
    const bass = queueSample.mock.calls.filter((call) => call[0].id === "acoustic_bass");
    expect(bass.some((call) => call[4] < 2)).toBe(true);
  });

  it.each([8, 16])("%i마디 곡 재생·연습·녹음·MP3가 같은 음표·리듬·세기로 연주한다", async (count) => {
    const measures = measuresFor(count);
    await playComposition(measures, "oboe", 120, options, true);
    const expected = backingNotes((4 + count) * 2);
    await stopPlayback();
    queueSample.mockClear();
    await exportBackingCompositionMp3Offline(measures, "oboe", 120, options);
    expect(backingNotes((4 + count) * 2)).toEqual(expected);
    const fullScore = backingNotes();
    queueSample.mockClear();
    const practice = practiceKaraokeComposition(measures, "oboe", 120, options);
    await vi.advanceTimersByTimeAsync((count + 9) * 2000);
    await practice;
    expect(backingNotes()).toEqual(fullScore);
    queueSample.mockClear();
    const recording = recordKaraokeComposition(measures, "oboe", 120, options, { guideMelodyMode: "off" });
    await vi.advanceTimersByTimeAsync((count + 10) * 2000);
    expect(await recording).not.toBe(null);
    expect(backingNotes()).toEqual(fullScore);
  });

  it("단독 듣기는 원래 합주에서의 해당 파트를 유지하고 가락·드럼·효과음을 제외한다", async () => {
    const measures = measuresFor(8);
    await playComposition(measures, "oboe", 120, options);
    const normal = backingNotes().filter((note) => note.instrument === "acoustic_bass");
    await stopPlayback();
    queueSample.mockClear();
    await playComposition(measures, "oboe", 120, { ...options, soloInstrumentId: "acoustic_bass",
      beatPattern: [{ id: "beat", instrumentId: "kick", measureIndex: 0, offsetBeats: 0 }] });
    expect(backingNotes().filter((note) => note.instrument === "acoustic_bass")).toEqual(normal);
    expect(queueSample.mock.calls.some((call) => call[0].id === "oboe")).toBe(false);
    expect(scheduleDrums).not.toHaveBeenCalled();
    expect(queueEffect).not.toHaveBeenCalled();
    const outputs = new Map(queueSample.mock.calls.map((call) => [call[0].id, call[2].gain.value]));
    expect(outputs.get("acoustic_bass")).toBeGreaterThan(0);
    expect([...outputs].filter(([id]) => id !== "acoustic_bass").every(([, gain]) => gain === 0)).toBe(true);
  });
});
