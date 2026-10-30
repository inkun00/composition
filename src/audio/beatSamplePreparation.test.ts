import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BEAT_SAMPLE_RATES } from "./beatSamplePreparation";
import { BEAT_SAMPLE_MIX_PROFILES, preloadBeatSamples, scheduleLoadedBeatSample } from "./beatSamples";

function parameter() {
  return { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
}

class NodeMock {
  gain = parameter();
  frequency = parameter();
  Q = parameter();
  threshold = parameter();
  knee = parameter();
  ratio = parameter();
  attack = parameter();
  release = parameter();
  playbackRate = parameter();
  type = "";
  buffer: AudioBuffer | null = null;
  connect = vi.fn((destination: NodeMock) => destination);
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

const raw = { duration: .2, length: 9600, sampleRate: 48000, numberOfChannels: 1 } as AudioBuffer;
const contexts: PreparationContext[] = [];
let finishRendering: (() => void) | undefined;
let failRendering = false;
let delayRendering = false;

class LiveContext {
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = new NodeMock();
  decodeAudioData = vi.fn(async () => raw);
  createBufferSource = vi.fn(() => new NodeMock());
  createGain = vi.fn(() => new NodeMock());
  createBiquadFilter = vi.fn(() => new NodeMock());
  createDynamicsCompressor = vi.fn(() => new NodeMock());
  createBuffer = vi.fn((channels: number, length: number, sampleRate: number) => ({
    numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
    getChannelData: () => new Float32Array(length), copyToChannel: vi.fn()
  } as unknown as AudioBuffer));
}

class PreparationContext extends LiveContext {
  result: AudioBuffer;
  startRendering = vi.fn(async () => {
    if (failRendering) throw new Error("render failed");
    if (delayRendering) await new Promise<void>((resolve) => {
      const previous = finishRendering;
      finishRendering = () => { previous?.(); resolve(); };
    });
    return this.result;
  });

  constructor(readonly channels: number, readonly length: number, sampleRate: number) {
    super();
    this.sampleRate = sampleRate;
    this.result = { duration: length / sampleRate, length, sampleRate, numberOfChannels: channels,
      getChannelData: () => new Float32Array(length) } as unknown as AudioBuffer;
    contexts.push(this);
  }
}

beforeEach(() => {
  contexts.splice(0);
  finishRendering = undefined;
  failRendering = false;
  delayRendering = false;
  vi.stubGlobal("OfflineAudioContext", PreparationContext);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("비트 악기의 사전 보정", () => {
  it("다섯 미세 음정별로 기존 필터와 압축기를 한 번씩 준비하고 모든 타격은 소스와 음량만 예약한다", async () => {
    const context = new LiveContext();
    await preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    expect(contexts).toHaveLength(5);
    const profile = BEAT_SAMPLE_MIX_PROFILES.kick;
    contexts.forEach((prepared, index) => {
      const source = prepared.createBufferSource.mock.results[0].value;
      expect(source.buffer).toBe(raw);
      expect(source.playbackRate.value).toBe(BEAT_SAMPLE_RATES[index]);
      expect(source.start).toHaveBeenCalledOnce();
      expect(source.start.mock.calls[0][0]).toBeGreaterThanOrEqual(.12);
      const tone = prepared.createBiquadFilter.mock.results[0].value;
      expect(tone.type).toBe(profile.filterType);
      expect(tone.frequency.value).toBe(profile.frequency);
      expect(tone.gain.value).toBe(profile.filterGain);
      const compressor = prepared.createDynamicsCompressor.mock.results[0].value;
      expect(compressor.threshold.value).toBe(-12);
      expect(compressor.knee.value).toBe(8);
      expect(compressor.ratio.value).toBe(2);
      expect(compressor.attack.value).toBe(.006);
      expect(compressor.release.value).toBe(.09);
      expect(prepared.result.duration).toBeGreaterThan(raw.duration / BEAT_SAMPLE_RATES[index] + .119);
      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(tone.disconnect).toHaveBeenCalledOnce();
      expect(compressor.disconnect).toHaveBeenCalledOnce();
    });
    for (let hit = 0; hit < 100; hit += 1) {
      expect(scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
        1 + hit / 8, .1, "kick", hit)).toBe(true);
      const source = context.createBufferSource.mock.results[hit].value;
      expect(source.buffer).toBe(contexts[hit % 5].createBuffer.mock.results[0].value);
      expect(source.playbackRate.value).toBe(1);
      expect(source.start).toHaveBeenCalledExactlyOnceWith(1 + hit / 8);
      expect(context.createGain.mock.results[hit].value.gain.setValueAtTime)
        .toHaveBeenCalledWith(.1 * profile.outputGain, 1 + hit / 8);
    }
    expect(context.createBiquadFilter).not.toHaveBeenCalled();
    expect(context.createDynamicsCompressor).not.toHaveBeenCalled();
  });

  it("동시 준비는 같은 작업을 기다리고 완료된 보정과 원본은 다시 만들지 않는다", async () => {
    delayRendering = true;
    const context = new LiveContext();
    let completed = false;
    const first = preloadBeatSamples(context as unknown as AudioContext, ["snare"]).then(() => { completed = true; });
    const second = preloadBeatSamples(context as unknown as AudioContext, ["snare", "snare"]);
    await vi.waitFor(() => expect(contexts).toHaveLength(5));
    expect(completed).toBe(false);
    finishRendering?.();
    await Promise.all([first, second]);
    expect(completed).toBe(true);
    await preloadBeatSamples(context as unknown as AudioContext, ["snare"]);
    expect(contexts).toHaveLength(5);
    expect(context.decodeAudioData).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("컨텍스트 시작과 가까운 타격은 기존 보정기의 초기 응답을 유지한다", async () => {
    const context = new LiveContext();
    await preloadBeatSamples(context as unknown as AudioContext, ["snare"]);
    for (const time of [0, .08]) {
      scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
        time, .1, "snare", 0);
    }
    expect(context.createBiquadFilter).toHaveBeenCalledTimes(2);
    expect(context.createDynamicsCompressor).toHaveBeenCalledTimes(2);
    expect(context.createBufferSource.mock.results.every(({ value }) => value.buffer === raw)).toBe(true);
    scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
      .2, .1, "snare", 0);
    expect(context.createBufferSource.mock.results[2].value.buffer).toBe(contexts[0].createBuffer.mock.results[0].value);
    expect(context.createDynamicsCompressor).toHaveBeenCalledTimes(2);
  });

  it("금속 악기의 기존 꼬리 음량과 종료 시각을 유지한다", async () => {
    const context = new LiveContext();
    await preloadBeatSamples(context as unknown as AudioContext, ["ride"]);
    scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
      4, .07, "ride", 2);
    const source = context.createBufferSource.mock.results[0].value;
    const gain = context.createGain.mock.results[0].value;
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.stop.mock.calls[0][0]).toBeCloseTo(5.11);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledExactlyOnceWith(.0001, 5.1);
  });

  it("사전 보정 실패는 기존 실시간 보정으로 재생하고 다음 준비에서 재시도한다", async () => {
    const context = new LiveContext();
    failRendering = true;
    await preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    expect(scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
      0, .1, "kick", 4)).toBe(true);
    expect(context.createBufferSource.mock.results[0].value.buffer).toBe(raw);
    expect(context.createBufferSource.mock.results[0].value.playbackRate.value).toBe(1.012);
    expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
    expect(contexts.every((prepared) => prepared.createBufferSource.mock.results[0].value.disconnect.mock.calls.length === 1)).toBe(true);
    failRendering = false;
    await preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    expect(contexts).toHaveLength(10);
    scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
      1, .1, "kick", 0);
    expect(context.createBufferSource.mock.results[1].value.buffer).toBe(contexts[5].createBuffer.mock.results[0].value);
    expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
  });

  it("지원하지 않거나 메모리 상한을 넘는 원본은 사전 보정 없이 기존 타격을 유지한다", async () => {
    const context = new LiveContext();
    vi.stubGlobal("OfflineAudioContext", undefined);
    await preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    scheduleLoadedBeatSample(context as unknown as AudioContext, context.destination as unknown as AudioNode,
      0, .1, "kick", 0);
    expect(context.createDynamicsCompressor).toHaveBeenCalledOnce();
    vi.stubGlobal("OfflineAudioContext", PreparationContext);
    const large = new LiveContext();
    large.decodeAudioData.mockResolvedValue({ ...raw, duration: 500, length: 24_000_000 } as AudioBuffer);
    await preloadBeatSamples(large as unknown as AudioContext, ["kick"]);
    expect(contexts).toHaveLength(0);
    scheduleLoadedBeatSample(large as unknown as AudioContext, large.destination as unknown as AudioNode,
      0, .1, "kick", 0);
    expect(large.createDynamicsCompressor).toHaveBeenCalledOnce();
  });

  it("컨텍스트가 닫힌 뒤 도착한 보정 결과는 보관하지 않는다", async () => {
    delayRendering = true;
    const context = new LiveContext();
    const pending = preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    await vi.waitFor(() => expect(contexts).toHaveLength(5));
    context.state = "closed";
    finishRendering?.();
    await pending;
    // A test context may be reopened; a real closed context is never reused.
    context.state = "running";
    delayRendering = false;
    await preloadBeatSamples(context as unknown as AudioContext, ["kick"]);
    expect(contexts).toHaveLength(10);
  });
});
