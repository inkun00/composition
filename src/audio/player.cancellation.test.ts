import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  pausePlayback,
  playComposition,
  resumePlayback,
  stopPlayback,
  type CompositionPlaybackClock,
  type PlaybackMeasure
} from "./player";

const { loadSample, queueSample, releaseSamples } = vi.hoisted(() => ({
  loadSample: vi.fn(), queueSample: vi.fn(), releaseSamples: vi.fn()
}));

vi.mock("./samplePlayer", () => ({
  loadSampleInstrument: loadSample,
  queueSampleNote: queueSample,
  releaseSampleInstrument: vi.fn(),
  releaseSampleContext: releaseSamples
}));

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class NodeMock {
  gain = parameter();
  frequency = parameter();
  threshold = parameter();
  knee = parameter();
  ratio = parameter();
  attack = parameter();
  release = parameter();
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class ContextMock extends EventTarget {
  static instances: ContextMock[] = [];
  currentTime = 0;
  state = "running";
  destination = new NodeMock();
  createGain = vi.fn(() => new NodeMock());
  createDynamicsCompressor = vi.fn(() => new NodeMock());
  createOscillator = vi.fn(() => new NodeMock());
  resume = vi.fn(async () => { this.state = "running"; });
  suspend = vi.fn(async () => { this.state = "suspended"; });
  close = vi.fn(async () => { this.state = "closed"; });

  constructor() {
    super();
    ContextMock.instances.push(this);
  }
}

const measure: PlaybackMeasure = {
  notes: [{ id: "melody", pitch: 72, duration: { numerator: 4, denominator: 1 } }],
  harmony: "home", chords: ["C"], measureIndex: 0
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  ContextMock.instances = [];
  vi.stubGlobal("AudioContext", ContextMock);
  loadSample.mockImplementation(async () => ({ id: "piano" }));
});

afterEach(async () => {
  await stopPlayback();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("곡별 재생 중단", () => {
  it("가사 시계는 첫 소리의 0.08초 대기와 실제 오디오 시간을 따른다", async () => {
    let clock: CompositionPlaybackClock | undefined;
    const controller = new AbortController();
    await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onStarted: (value) => { clock = value; } });
    expect(clock?.durationSeconds).toBe(2);
    expect(clock?.getElapsedSeconds()).toBeCloseTo(-.08);
    ContextMock.instances[0].currentTime = .58;
    expect(clock?.getElapsedSeconds()).toBeCloseTo(.5);
    await pausePlayback();
    await vi.advanceTimersByTimeAsync(5000);
    expect(clock?.getElapsedSeconds()).toBeCloseTo(.5);
    await resumePlayback();
    ContextMock.instances[0].currentTime = 1.08;
    expect(clock?.getElapsedSeconds()).toBeCloseTo(1);
  });

  it("샘플 준비 시간은 가사에 포함하지 않고 준비가 끝난 오디오 시각부터 시작한다", async () => {
    const preparation = deferred<{ id: string }>();
    loadSample.mockReturnValueOnce(preparation.promise);
    const onStarted = vi.fn();
    const pending = playComposition([measure], "piano", 60, undefined, false,
      { signal: new AbortController().signal, onStarted });
    await vi.waitFor(() => expect(loadSample).toHaveBeenCalledOnce());
    ContextMock.instances[0].currentTime = 3.25;
    expect(onStarted).not.toHaveBeenCalled();
    preparation.resolve({ id: "piano" });
    await pending;
    const clock = onStarted.mock.calls[0][0] as CompositionPlaybackClock;
    expect(clock.durationSeconds).toBe(4);
    expect(clock.getElapsedSeconds()).toBeCloseTo(-.08);
    ContextMock.instances[0].currentTime = 3.83;
    expect(clock.getElapsedSeconds()).toBeCloseTo(.5);
  });

  it("이미 취소된 요청은 재생 자원을 확보하지 않는다", async () => {
    const controller = new AbortController();
    const onEnded = vi.fn();
    controller.abort();
    expect(await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded })).toBeNull();
    expect(ContextMock.instances).toHaveLength(0);
    expect(loadSample).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("샘플 준비 중에도 즉시 중단하고 늦게 도착한 샘플로 재생하지 않는다", async () => {
    const preparation = deferred<{ id: string }>();
    loadSample.mockReturnValueOnce(preparation.promise);
    const controller = new AbortController();
    const onEnded = vi.fn();
    const playing = playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded });
    await vi.waitFor(() => expect(loadSample).toHaveBeenCalledOnce());
    controller.abort();
    expect(ContextMock.instances[0].close).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
    preparation.resolve({ id: "piano" });
    expect(await playing).toBeNull();
    expect(queueSample).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("오디오 활성화를 기다리는 동안에도 취소 연결이 살아 있다", async () => {
    const activation = deferred<void>();
    class SuspendedContext extends ContextMock {
      state = "suspended";
      resume = vi.fn(async () => {
        await activation.promise;
        this.state = "running";
      });
    }
    vi.stubGlobal("AudioContext", SuspendedContext);
    const controller = new AbortController();
    const onEnded = vi.fn();
    const playing = playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded });
    expect(ContextMock.instances[0].resume).toHaveBeenCalledOnce();
    controller.abort();
    expect(ContextMock.instances[0].close).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
    activation.resolve();
    expect(await playing).toBeNull();
    expect(loadSample).not.toHaveBeenCalled();
    expect(queueSample).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("재생 중인 요청만 닫고 앞서 사용한 일반 재생 컨텍스트는 유지한다", async () => {
    await playComposition([measure]);
    const ordinary = ContextMock.instances[0];
    ordinary.currentTime = 10;
    await vi.advanceTimersByTimeAsync(100);
    const controller = new AbortController();
    const onEnded = vi.fn();
    expect(await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded })).toBeGreaterThan(0);
    const album = ContextMock.instances[1];
    controller.abort();
    await vi.advanceTimersByTimeAsync(500);
    expect(album.close).toHaveBeenCalledOnce();
    expect(ordinary.close).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("자연 종료 알림과 취소 연결을 한 번 정리하고 이후 재생을 보호한다", async () => {
    const controller = new AbortController();
    const onEnded = vi.fn();
    const removeAbort = vi.spyOn(controller.signal, "removeEventListener");
    await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded });
    const first = ContextMock.instances[0];
    first.currentTime = 10;
    await vi.advanceTimersByTimeAsync(100);
    expect(first.close).toHaveBeenCalledOnce();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(removeAbort).toHaveBeenCalledWith("abort", expect.any(Function));
    expect(await playComposition([measure])).toBeGreaterThan(0);
    const next = ContextMock.instances[1];
    controller.abort();
    expect(next.close).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("다른 음악 때문에 거절된 요청의 취소는 기존 음악에 영향을 주지 않는다", async () => {
    await playComposition([measure]);
    const controller = new AbortController();
    const onEnded = vi.fn();
    expect(await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded })).toBeNull();
    controller.abort();
    expect(ContextMock.instances).toHaveLength(1);
    expect(ContextMock.instances[0].close).not.toHaveBeenCalled();
    expect(onEnded).not.toHaveBeenCalled();
  });

  it("전체 중단 후 준비 응답과 이전 요청 취소가 새 곡에 영향을 주지 않는다", async () => {
    const preparation = deferred<{ id: string }>();
    loadSample.mockReturnValueOnce(preparation.promise);
    const controller = new AbortController();
    const onEnded = vi.fn();
    const oldPlaying = playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded });
    await vi.waitFor(() => expect(loadSample).toHaveBeenCalledOnce());
    await stopPlayback();
    expect(onEnded).toHaveBeenCalledOnce();
    expect(await playComposition([measure])).toBeGreaterThan(0);
    const current = ContextMock.instances[1];
    const scheduled = queueSample.mock.calls.length;
    preparation.resolve({ id: "old-piano" });
    expect(await oldPlaying).toBeNull();
    controller.abort();
    expect(queueSample).toHaveBeenCalledTimes(scheduled);
    expect(current.close).not.toHaveBeenCalled();
    expect(onEnded).toHaveBeenCalledOnce();
  });

  it("일시 정지 동안 자연 종료하지 않고 다시 재생한 오디오 시간에 맞춰 끝난다", async () => {
    const controller = new AbortController();
    const onEnded = vi.fn();
    await playComposition([measure], "piano", 120, undefined, false,
      { signal: controller.signal, onEnded });
    expect(await pausePlayback()).toBe(true);
    expect(ContextMock.instances[0].suspend).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(5000);
    expect(onEnded).not.toHaveBeenCalled();
    expect(await resumePlayback()).toBe(true);
    ContextMock.instances[0].currentTime = 10;
    await vi.advanceTimersByTimeAsync(100);
    expect(onEnded).toHaveBeenCalledOnce();
  });
});
