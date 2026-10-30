import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AccompanimentOptions, PlaybackMeasure } from "./accompanimentScore";
import { prepareKaraokeAudio } from "./karaokePreparation";
import { karaokePreparationCache } from "./karaokePreparationCache";

const mocks = vi.hoisted(() => ({
  loadLayers: vi.fn(), loadMelody: vi.fn(), queueSample: vi.fn(), drums: vi.fn(), effect: vi.fn(),
  preloadEffects: vi.fn(), releaseRuntime: vi.fn(), releaseSamples: vi.fn()
}));
vi.mock("./accompanimentRuntime", () => ({
  loadAccompanimentLayers: mocks.loadLayers, loadSampleWithTimeout: mocks.loadMelody,
  releaseAccompanimentRuntime: mocks.releaseRuntime
}));
vi.mock("./samplePlayer", () => ({ queueSampleNote: mocks.queueSample, releaseSampleContext: mocks.releaseSamples }));
vi.mock("./drumGroove", () => ({ scheduleBeatPattern: mocks.drums }));
vi.mock("./soundEffects", () => ({ queueSoundEffect: mocks.effect, preloadSoundEffects: mocks.preloadEffects }));

function param() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}
class NodeMock {
  gain = param();
  frequency = param();
  type = "sine";
  connect = vi.fn((node: NodeMock) => node);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}
const contexts: OfflineContextMock[] = [];
class OfflineContextMock {
  destination = new NodeMock();
  currentTime = 0;
  createGain = vi.fn(() => new NodeMock());
  createOscillator = vi.fn(() => new NodeMock());
  result: AudioBuffer;
  startRendering = vi.fn(async () => this.result);
  constructor(readonly channels: number, readonly length: number, readonly sampleRate: number) {
    this.result = { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate } as AudioBuffer;
    contexts.push(this);
  }
}

const ids = ["bright_acoustic_piano", "acoustic_bass", "clarinet", "recorder"];
const accompaniment: AccompanimentOptions = {
  styleId: "children_song", instrumentIds: ids, meter: { beats: 4, beatUnit: 4 },
  beatPattern: ["kick", "snare", "hihat"].map((instrumentId, index) => ({
    id: `beat-${index}`, instrumentId: instrumentId as "kick" | "snare" | "hihat",
    measureIndex: 0, offsetBeats: index
  })), beatVolume: 140
};
const measures: readonly PlaybackMeasure[] = Array.from({ length: 2 }, (_, index) => ({
  notes: [72, 74, null, 76].map((pitch, noteIndex) => ({
    id: `${index}-${noteIndex}`, pitch, lyric: pitch === null ? "" : "라", duration: { numerator: 1, denominator: 1 }
  })), harmony: "home", chords: ["C"], measureIndex: index,
  effects: [{ id: `effect-${index}`, effectId: "bell", offsetBeats: 1 }]
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  karaokePreparationCache.clear();
  contexts.splice(0);
  vi.clearAllMocks();
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
  mocks.loadLayers.mockImplementation(async (context: OfflineContextMock, _destination, options: AccompanimentOptions) =>
    options.instrumentIds.map((id) => ({ id, sample: { id }, destination: context.createGain(), muted: false })));
  mocks.loadMelody.mockImplementation(async (_context, _destination, id) => ({ id }));
  mocks.preloadEffects.mockResolvedValue(undefined);
});
afterEach(async () => {
  karaokePreparationCache.clear();
  await Promise.resolve();
  await Promise.resolve();
  vi.unstubAllGlobals();
});

describe("노래 연습·녹음용 사전 렌더링", () => {
  it("악기와 효과음을 함께 준비하고 둘 다 준비된 뒤 렌더링한다", async () => {
    const layers = deferred<[]>();
    const effects = deferred<void>();
    mocks.loadLayers.mockReturnValueOnce(layers.promise);
    mocks.preloadEffects.mockReturnValueOnce(effects.promise);
    const pending = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" });
    await vi.waitFor(() => expect(mocks.preloadEffects).toHaveBeenCalledOnce());
    expect(mocks.loadLayers).toHaveBeenCalledOnce();
    expect(contexts[0].startRendering).not.toHaveBeenCalled();
    layers.resolve([]);
    await Promise.resolve();
    expect(contexts[0].startRendering).not.toHaveBeenCalled();
    effects.resolve();
    await pending;
    expect(contexts[0].startRendering).toHaveBeenCalledOnce();
  });

  it("선택한 네 반주 악기·비트·효과와 도움 가락을 서로 다른 버퍼로 준비한다", async () => {
    const result = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" });
    expect(contexts).toHaveLength(2);
    expect(result.backing).toBe(contexts[0].result);
    expect(result.guide).toBe(contexts[1].result);
    const backing = mocks.queueSample.mock.calls.filter((call) => call[1] === contexts[0]);
    expect(new Set(backing.map((call) => call[0].id))).toEqual(new Set(ids));
    const melody = mocks.queueSample.mock.calls.filter((call) => call[1] === contexts[1]);
    expect(melody).toHaveLength(6);
    expect(melody.every((call) => call[0].id === "flute")).toBe(true);
    expect(mocks.drums).toHaveBeenCalledTimes(10);
    expect(mocks.drums.mock.calls.every((call) => call[0] === contexts[0] && call[6] === accompaniment.beatPattern)).toBe(true);
    expect(mocks.effect).toHaveBeenCalledTimes(2);
    expect(mocks.effect.mock.calls.every((call) => call[0] === contexts[0])).toBe(true);
    expect(mocks.preloadEffects).toHaveBeenCalledWith(contexts[0], ["bell", "bell"], expect.any(AbortSignal));
    expect(mocks.loadLayers).toHaveBeenCalledOnce();
    for (const context of contexts) {
      expect(mocks.releaseRuntime).toHaveBeenCalledWith(context);
      expect(mocks.releaseSamples).toHaveBeenCalledWith(context);
      expect(context.createGain.mock.results[0].value.disconnect).toHaveBeenCalledOnce();
    }
  });

  it.each(["practice", "recording"] as const)("%s: 전주·본곡·후주의 정확한 시간과 동일한 시작0을 유지한다", async (mode) => {
    const result = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode, guideMode: "soft" });
    expect(result.introSeconds).toBe(8);
    expect(result.songSeconds).toBe(4);
    expect(result.outroSeconds).toBe(8);
    expect(result.durationSeconds).toBe(20 + (mode === "practice" ? .55 : .8));
    expect(contexts.every((context) => context.channels === 2 && context.sampleRate === 48000 &&
      context.length === Math.ceil(20.8 * 48000))).toBe(true);
    expect(result.backing.duration).toBeCloseTo(20.8);
    expect(Math.min(...mocks.drums.mock.calls.map((call) => call[2]))).toBe(0);
    const melody = mocks.queueSample.mock.calls.filter((call) => call[0].id === "flute");
    expect(melody.every((call) => call[4] >= result.introSeconds && call[4] < 12)).toBe(true);
    expect(mocks.effect.mock.calls.map((call) => call[3])).toEqual([8.5, 10.5]);
  });

  it("개인 녹음의 첫 음 도움은 마디마다 첫 음만 모니터용 버퍼에 넣는다", async () => {
    await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 44100, mode: "recording", guideMode: "first-note" });
    const melody = mocks.queueSample.mock.calls.filter((call) => call[0].id === "flute");
    expect(melody).toHaveLength(2);
    expect(melody.map((call) => call[3])).toEqual([72, 72]);
    expect(melody.every((call) => call[1] === contexts[1])).toBe(true);
  });

  it("연습 가락은 전체를 .82배, 녹음의 부드러운 가락은 .34배로 준비한다", async () => {
    await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 44100, mode: "practice" });
    const practice = mocks.queueSample.mock.calls.filter((call) => call[0].id === "flute");
    mocks.queueSample.mockClear();
    await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 44100, mode: "recording", guideMode: "soft" });
    const recording = mocks.queueSample.mock.calls.filter((call) => call[0].id === "flute");
    expect(recording).toHaveLength(practice.length);
    recording.forEach((call, index) => expect(call[6] / practice[index][6]).toBeCloseTo(.34 / .82));
  });

  it("합창처럼 도움을 끄면 가락 음원과 두 번째 렌더링을 만들지 않는다", async () => {
    const result = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 44100, mode: "recording", guideMode: "off" });
    expect(result.guide).toBeNull();
    expect(contexts).toHaveLength(1);
    expect(mocks.loadMelody).not.toHaveBeenCalled();
    expect(mocks.queueSample.mock.calls.some((call) => call[0].id === "flute")).toBe(false);
  });

  it("첫 반주 렌더링이 끝난 뒤 두 번째 가락 컨텍스트를 만들어 최대 동시 렌더링을 제한한다", async () => {
    const rendered = deferred<AudioBuffer>();
    mocks.loadLayers.mockImplementationOnce(async (context: OfflineContextMock) => {
      context.startRendering.mockImplementation(() => rendered.promise);
      return [];
    });
    const pending = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" });
    await vi.waitFor(() => expect(contexts[0].startRendering).toHaveBeenCalledOnce());
    expect(contexts).toHaveLength(1);
    rendered.resolve(contexts[0].result);
    await pending;
    expect(contexts).toHaveLength(2);
  });

  it.each(["layers", "effects", "render"] as const)("%s 대기 도중 취소하면 즉시 종료하고 모든 샘플을 정리한다", async (stage) => {
    const controller = new AbortController();
    const never = new Promise<never>(() => undefined);
    if (stage === "layers") mocks.loadLayers.mockReturnValue(never);
    if (stage === "effects") mocks.preloadEffects.mockReturnValue(never);
    if (stage === "render") mocks.loadLayers.mockImplementationOnce(async (context: OfflineContextMock) => {
      context.startRendering.mockImplementation(() => never);
      return [];
    });
    const pending = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice", signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    if (stage === "layers") await vi.waitFor(() => expect(mocks.loadLayers).toHaveBeenCalledOnce());
    if (stage === "effects") await vi.waitFor(() => expect(mocks.preloadEffects).toHaveBeenCalledOnce());
    if (stage === "render") await vi.waitFor(() => expect(contexts[0].startRendering).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(contexts).toHaveLength(1);
    await vi.waitFor(() => expect(mocks.releaseRuntime).toHaveBeenCalledWith(contexts[0]));
    expect(mocks.releaseSamples).toHaveBeenCalledWith(contexts[0]);
  });

  it("도움 가락 샘플을 기다리다 취소하면 합성 가락으로 넘어가지 않고 두 컨텍스트를 정리한다", async () => {
    const controller = new AbortController();
    mocks.loadMelody.mockReturnValue(new Promise(() => undefined));
    const pending = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice", signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.loadMelody).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(contexts[1].createOscillator).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(mocks.releaseSamples).toHaveBeenCalledTimes(2));
  });

  it("렌더링 실패에도 리소스를 정리하고 재시도에서 새 컨텍스트를 사용한다", async () => {
    mocks.loadLayers.mockImplementationOnce(async (context: OfflineContextMock) => {
      context.startRendering.mockRejectedValue(new Error("render failed"));
      return [];
    });
    await expect(prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" })).rejects.toThrow("render failed");
    expect(mocks.releaseSamples).toHaveBeenCalledWith(contexts[0]);
    const result = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" });
    expect(result.backing).toBe(contexts[1].result);
  });

  it("오프라인 오디오 미지원·잘못된 빠르기·빈 곡·사전 취소는 실시간 합성으로 되돌리지 않는다", async () => {
    for (const bpm of [0, NaN, Infinity]) await expect(prepareKaraokeAudio(measures, "flute", bpm,
      accompaniment, { sampleRate: 48000, mode: "practice" })).rejects.toThrow("악보");
    await expect(prepareKaraokeAudio([], "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" })).rejects.toThrow("악보");
    const controller = new AbortController();
    controller.abort();
    await expect(prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice", signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    vi.stubGlobal("OfflineAudioContext", undefined);
    await expect(prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { sampleRate: 48000, mode: "practice" })).rejects.toThrow("최신 크롬");
    expect(contexts).toHaveLength(0);
  });
});

describe("노래 연습·녹음 준비 결과 재사용", () => {
  const options = { sampleRate: 48000, mode: "practice" as const };

  it("같은 곡을 다시 시작할 때 두 버퍼를 그대로 쓰고 새 컨텍스트를 만들지 않는다", async () => {
    const first = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    const second = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    expect(second.backing).toBe(first.backing);
    expect(second.guide).toBe(first.guide);
    expect(contexts).toHaveLength(2);
    expect(mocks.loadLayers).toHaveBeenCalledOnce();
    expect(mocks.loadMelody).toHaveBeenCalledOnce();
    expect(contexts.every((context) => context.startRendering.mock.calls.length === 1)).toBe(true);
  });

  it("연습에서 녹음으로 바꾸거나 도움 방식을 바꿔도 반주는 다시 만들지 않는다", async () => {
    const practice = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    const soft = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { ...options, mode: "recording", guideMode: "soft" });
    const firstNote = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { ...options, mode: "recording", guideMode: "first-note" });
    const off = await prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { ...options, mode: "recording", guideMode: "off" });
    for (const result of [soft, firstNote, off]) expect(result.backing).toBe(practice.backing);
    expect(soft.guide).not.toBe(practice.guide);
    expect(firstNote.guide).not.toBe(soft.guide);
    expect(off.guide).toBeNull();
    expect(practice.durationSeconds).toBe(20.55);
    expect(soft.durationSeconds).toBe(20.8);
    expect(contexts).toHaveLength(4);
    expect(mocks.loadLayers).toHaveBeenCalledOnce();
    expect(mocks.loadMelody).toHaveBeenCalledTimes(3);
  });

  it("가사·메모 식별자·화면 콜백만 바뀌면 준비한 소리를 유지한다", async () => {
    const first = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    const edited = measures.map((measure) => ({ ...measure,
      notes: measure.notes.map((note) => ({ ...note, id: `new-${note.id}`, lyric: "새 가사" })),
      effects: measure.effects?.map((effect) => ({ ...effect, id: `new-${effect.id}` }))
    }));
    const second = await prepareKaraokeAudio(edited, "flute", 120, { ...accompaniment,
      onTrackState: vi.fn(), beatPattern: accompaniment.beatPattern?.map((event) => ({ ...event, id: `new-${event.id}` }))
    }, options);
    expect(second.backing).toBe(first.backing);
    expect(second.guide).toBe(first.guide);
    expect(contexts).toHaveLength(2);
  });

  it("메인 악기만 바꾸면 반주를 유지하고 도움 가락만 새로 준비한다", async () => {
    const first = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    const changed = await prepareKaraokeAudio(measures, "violin", 120, accompaniment, options);
    expect(changed.backing).toBe(first.backing);
    expect(changed.guide).not.toBe(first.guide);
    expect(contexts).toHaveLength(3);
    expect(mocks.loadLayers).toHaveBeenCalledOnce();
    expect(mocks.loadMelody.mock.calls.map((call) => call[2])).toEqual(["flute", "violin"]);
  });

  it.each(["pitch", "bpm", "sample-rate", "mix", "beat", "effect", "chord", "meter"] as const)(
    "%s 변경은 이전 반주를 재사용하지 않는다", async (change) => {
      const first = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
      let nextMeasures = measures;
      let nextAccompaniment = accompaniment;
      let bpm = 120;
      let sampleRate = 48000;
      if (change === "pitch") nextMeasures = measures.map((measure) => ({ ...measure,
        notes: measure.notes.map((note) => ({ ...note, pitch: note.pitch === null ? null : note.pitch + 1 })) }));
      if (change === "bpm") bpm = 96;
      if (change === "sample-rate") sampleRate = 44100;
      if (change === "mix") nextAccompaniment = { ...accompaniment,
        trackMix: { [ids[0]]: { volume: 80, muted: false } } };
      if (change === "beat") nextAccompaniment = { ...accompaniment,
        beatPattern: accompaniment.beatPattern?.map((event) => ({ ...event, offsetBeats: event.offsetBeats + .25 })) };
      if (change === "effect") nextMeasures = measures.map((measure) => ({ ...measure,
        effects: measure.effects?.map((effect) => ({ ...effect, offsetBeats: 1.5 })) }));
      if (change === "chord") nextMeasures = measures.map((measure) => ({ ...measure, chords: ["F"] }));
      if (change === "meter") nextAccompaniment = { ...accompaniment, meter: { beats: 3, beatUnit: 4 } };
      const changed = await prepareKaraokeAudio(nextMeasures, "flute", bpm, nextAccompaniment,
        { ...options, sampleRate });
      expect(changed.backing).not.toBe(first.backing);
      expect(mocks.loadLayers).toHaveBeenCalledTimes(2);
      if (["mix", "beat", "effect", "chord", "meter"].includes(change)) expect(changed.guide).toBe(first.guide);
      else expect(changed.guide).not.toBe(first.guide);
    }
  );

  it("같은 준비를 기다리는 한 요청만 취소하면 다른 요청의 소리는 완성한다", async () => {
    const waiting = deferred<[]>();
    mocks.loadLayers.mockReturnValueOnce(waiting.promise);
    const controller = new AbortController();
    const canceled = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { ...options, signal: controller.signal });
    const retained = prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    const rejection = expect(canceled).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.loadLayers).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    expect(mocks.releaseRuntime).not.toHaveBeenCalled();
    waiting.resolve([]);
    const result = await retained;
    const next = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    expect(next.backing).toBe(result.backing);
    expect(next.guide).toBe(result.guide);
    expect(contexts).toHaveLength(2);
  });

  it("준비 중 마지막 요청을 취소해도 같은 곡의 다음 시도는 성공한다", async () => {
    mocks.loadLayers.mockReturnValueOnce(new Promise(() => undefined));
    const controller = new AbortController();
    const pending = prepareKaraokeAudio(measures, "flute", 120, accompaniment,
      { ...options, signal: controller.signal });
    const rejection = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(mocks.loadLayers).toHaveBeenCalledOnce());
    controller.abort();
    await rejection;
    await vi.waitFor(() => expect(mocks.releaseRuntime).toHaveBeenCalledWith(contexts[0]));
    const next = await prepareKaraokeAudio(measures, "flute", 120, accompaniment, options);
    expect(next.backing).toBe(contexts[1].result);
    expect(contexts).toHaveLength(3);
  });
});
