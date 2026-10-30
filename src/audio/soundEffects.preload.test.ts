import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { preloadSoundEffects, queueSoundEffect } from "./soundEffects";

vi.mock("../platform/portable", () => ({ publicAssetUrl: (source: string) => source }));
vi.mock("../music/soundEffects", () => {
  const effects = [
    { id: "sample", source: "/effect.ogg", category: "school" },
    { id: "alias", source: "/effect.ogg", category: "school" },
    { id: "synthetic", category: "school" }
  ];
  return { SOUND_EFFECTS: effects, findSoundEffect: (id: string) => effects.find((effect) => effect.id === id)! };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => { resolve = settle; });
  return { promise, resolve };
}

class NodeMock {
  gain = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  frequency = { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() };
  buffer: AudioBuffer | null = null;
  connect = vi.fn((destination: NodeMock) => destination);
  start = vi.fn();
  stop = vi.fn();
}

class ContextMock {
  currentTime = 0;
  state = "running";
  sampleRate = 48000;
  decoded = { duration: 1.2, sampleRate: this.sampleRate } as AudioBuffer;
  decodeAudioData = vi.fn(async () => this.decoded);
  sources: NodeMock[] = [];
  oscillators: NodeMock[] = [];
  createGain = () => new NodeMock();
  createBufferSource = () => {
    const node = new NodeMock();
    this.sources.push(node);
    return node;
  };
  createOscillator = () => {
    const node = new NodeMock();
    this.oscillators.push(node);
    return node;
  };
}

class OfflineContextMock extends ContextMock {}

function context(value: ContextMock): BaseAudioContext {
  return value as unknown as BaseAudioContext;
}

const destination = {} as AudioNode;
const response = () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => response()));
  vi.stubGlobal("OfflineAudioContext", OfflineContextMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("오프라인 재생 전 효과음 준비", () => {
  it("다운로드와 디코딩이 끝날 때까지 기다린 뒤 첫 프레임부터 즉시 예약한다", async () => {
    const ctx = new OfflineContextMock();
    const decoding = deferred<AudioBuffer>();
    ctx.decodeAudioData.mockImplementation(() => decoding.promise);
    let finished = false;
    const ready = preloadSoundEffects(context(ctx), ["sample"]).then(() => { finished = true; });
    await vi.waitFor(() => expect(ctx.decodeAudioData).toHaveBeenCalledOnce());
    expect(finished).toBe(false);
    decoding.resolve(ctx.decoded);
    await ready;
    queueSoundEffect(context(ctx), destination, "sample", 0);
    expect(ctx.sources).toHaveLength(1);
    expect(ctx.sources[0].buffer).toBe(ctx.decoded);
    expect(ctx.sources[0].start).toHaveBeenCalledWith(0);
  });

  it("같은 소스의 별칭과 겹친 준비 요청은 한 번만 다운로드·디코딩한다", async () => {
    const ctx = new OfflineContextMock();
    await Promise.all([
      preloadSoundEffects(context(ctx), ["sample", "alias", "sample"]),
      preloadSoundEffects(context(ctx), ["alias"])
    ]);
    queueSoundEffect(context(ctx), destination, "sample", 1);
    queueSoundEffect(context(ctx), destination, "alias", 2);
    expect(fetch).toHaveBeenCalledOnce();
    expect(ctx.decodeAudioData).toHaveBeenCalledOnce();
    expect(ctx.sources.map((source) => source.start.mock.calls[0][0])).toEqual([1, 2]);
  });

  it("서로 다른 오디오 컨텍스트에는 해당 컨텍스트에서 디코딩한 버퍼를 사용한다", async () => {
    const first = new OfflineContextMock();
    const second = new OfflineContextMock();
    await preloadSoundEffects(context(first), ["sample"]);
    await preloadSoundEffects(context(second), ["sample"]);
    queueSoundEffect(context(second), destination, "sample", 0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(second.decodeAudioData).toHaveBeenCalledOnce();
    expect(second.sources[0].buffer).toBe(second.decoded);
    expect(second.sources[0].buffer).not.toBe(first.decoded);
  });

  it.each(["download", "decode"] as const)("%s 실패는 기존 합성 효과음을 동기적으로 예약한다", async (stage) => {
    const ctx = new OfflineContextMock();
    if (stage === "download") vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    else ctx.decodeAudioData.mockRejectedValue(new Error("Decoder unavailable"));
    await preloadSoundEffects(context(ctx), ["sample"]);
    queueSoundEffect(context(ctx), destination, "sample", 0);
    expect(ctx.oscillators).toHaveLength(2);
    expect(ctx.oscillators[0].start).toHaveBeenCalledWith(0);
    expect(ctx.sources).toHaveLength(0);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("샘플이 없는 효과음은 네트워크를 사용하지 않는다", async () => {
    const ctx = new OfflineContextMock();
    await preloadSoundEffects(context(ctx), ["synthetic"]);
    queueSoundEffect(context(ctx), destination, "synthetic", 3);
    expect(fetch).not.toHaveBeenCalled();
    expect(ctx.oscillators[0].start).toHaveBeenCalledWith(3);
  });

  it("이미 취소된 작업은 다운로드를 시작하지 않는다", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(preloadSoundEffects(context(new OfflineContextMock()), ["sample"], abort.signal))
      .rejects.toMatchObject({ name: "AbortError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("준비 중 취소는 즉시 대기를 끝내며 같은 컨텍스트의 다른 요청을 취소하지 않는다", async () => {
    const ctx = new OfflineContextMock();
    const downloading = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockImplementation(() => downloading.promise as Promise<Response>);
    const abort = new AbortController();
    const cancelled = preloadSoundEffects(context(ctx), ["sample"], abort.signal);
    const other = preloadSoundEffects(context(ctx), ["sample"]);
    const assertion = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    abort.abort();
    await assertion;
    downloading.resolve(response());
    await other;
    expect(fetch).toHaveBeenCalledOnce();
    queueSoundEffect(context(ctx), destination, "sample", 0);
    expect(ctx.sources).toHaveLength(1);
  });

  it("기존 실시간 재생의 늦은 로드도 닫힌 컨텍스트에는 노드를 만들지 않는다", async () => {
    const ctx = new ContextMock();
    const downloading = deferred<ReturnType<typeof response>>();
    vi.mocked(fetch).mockImplementation(() => downloading.promise as Promise<Response>);
    queueSoundEffect(context(ctx), destination, "sample", 0);
    ctx.state = "closed";
    downloading.resolve(response());
    await preloadSoundEffects(context(ctx), ["sample"]);
    expect(ctx.sources).toHaveLength(0);
    expect(ctx.oscillators).toHaveLength(0);
  });

  it("기존 실시간 재생은 준비된 소스의 안전 여유 시간을 유지한다", async () => {
    const ctx = new ContextMock();
    ctx.currentTime = 2;
    await preloadSoundEffects(context(ctx), ["sample"]);
    queueSoundEffect(context(ctx), destination, "sample", 1);
    expect(ctx.sources[0].start).toHaveBeenCalledWith(2.01);
  });
});
